// Editing operations. Each takes a draft and returns a new draft, never
// mutating its input, so the store can keep whole-draft snapshots for undo.
//
// End and pick arguments here are 0-based indices (end 1 is index 0); shaft,
// treadle and palette values are as stored in the model (shafts and treadles
// 1-based, palette 0-based).

import { cloneDraft, normalizeDraft, toLiftplan, toTreadling } from './draft.js';

export const LIMITS = { shafts: 40, treadles: 64, ends: 2000, picks: 2000 };

const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(Number(v)) || lo));

function setIn(row, value, on) {
  const s = new Set(row);
  if (on) s.add(value);
  else s.delete(value);
  return [...s].sort((a, b) => a - b);
}

// --- Cells -----------------------------------------------------------------

// Put an end on a shaft (0 = unthreaded).
export function setThreading(draft, end, shaft) {
  if (draft.threading[end] === shaft) return draft;
  const d = cloneDraft(draft);
  d.threading[end] = shaft;
  return d;
}

export function setTieup(draft, shaft, treadle, on) {
  if (draft.tieup[shaft - 1][treadle - 1] === on) return draft;
  const d = cloneDraft(draft);
  d.tieup[shaft - 1][treadle - 1] = on;
  return d;
}

export function setTreadle(draft, pick, treadle, on) {
  if (draft.treadling[pick].includes(treadle) === on) return draft;
  const d = cloneDraft(draft);
  d.treadling[pick] = setIn(d.treadling[pick], treadle, on);
  return d;
}

export function setLift(draft, pick, shaft, on) {
  if (draft.liftplan[pick].includes(shaft) === on) return draft;
  const d = cloneDraft(draft);
  d.liftplan[pick] = setIn(d.liftplan[pick], shaft, on);
  return d;
}

export function setWarpColor(draft, end, color) {
  if (draft.warpColors[end] === color) return draft;
  const d = cloneDraft(draft);
  d.warpColors[end] = color;
  return d;
}

export function setWeftColor(draft, pick, color) {
  if (draft.weftColors[pick] === color) return draft;
  const d = cloneDraft(draft);
  d.weftColors[pick] = color;
  return d;
}

// --- Palette ---------------------------------------------------------------

export function setPaletteColor(draft, index, rgb) {
  const d = cloneDraft(draft);
  d.palette[index] = rgb.map((v) => clampInt(v, 0, 255));
  return d;
}

export function addPaletteColor(draft, rgb) {
  const d = cloneDraft(draft);
  d.palette.push(rgb.map((v) => clampInt(v, 0, 255)));
  return d;
}

// Remove a palette color; threads using it move to color `replacement`.
export function removePaletteColor(draft, index, replacement = 0) {
  if (draft.palette.length <= 1) return draft;
  const d = cloneDraft(draft);
  d.palette.splice(index, 1);
  const remap = (c) => {
    const r = c === index ? replacement : c;
    return r > index ? r - 1 : r;
  };
  d.warpColors = d.warpColors.map(remap);
  d.weftColors = d.weftColors.map(remap);
  return normalizeDraft(d);
}

// --- Sizes -----------------------------------------------------------------

// Change shaft/treadle/end/pick counts. Cells outside the new size are dropped;
// new ends and picks get the colors of the last existing one.
export function resize(draft, { shafts, treadles, numEnds, numPicks }) {
  const d = cloneDraft(draft);
  if (shafts !== undefined) d.shafts = clampInt(shafts, 1, LIMITS.shafts);
  if (treadles !== undefined) d.treadles = clampInt(treadles, 1, LIMITS.treadles);
  if (numEnds !== undefined) {
    const n = clampInt(numEnds, 0, LIMITS.ends);
    const fill = d.warpColors.at(-1) ?? (d.palette.length > 1 ? 1 : 0);
    while (d.warpColors.length < n) d.warpColors.push(fill);
    d.numEnds = n;
  }
  if (numPicks !== undefined) {
    const n = clampInt(numPicks, 0, LIMITS.picks);
    const fill = d.weftColors.at(-1) ?? 0;
    while (d.weftColors.length < n) d.weftColors.push(fill);
    d.numPicks = n;
  }
  return normalizeDraft(d);
}

// --- Ranges of ends or picks -----------------------------------------------
// A range is { from, to } with 0-based inclusive indices, from <= to.
// "ends" ranges cover threading and warp colors; "picks" ranges cover
// treadling, liftplan and weft colors.

const AXES = {
  ends: { count: 'numEnds', limit: LIMITS.ends, arrays: ['threading', 'warpColors'] },
  picks: { count: 'numPicks', limit: LIMITS.picks, arrays: ['treadling', 'liftplan', 'weftColors'] },
};

function blank(draft, axis, name, ref) {
  if (name === 'threading') return 0;
  if (name === 'treadling' || name === 'liftplan') return [];
  // Colors: copy the neighbouring thread so inserted threads blend in.
  const colors = draft[name];
  return colors[ref] ?? colors[ref - 1] ?? colors.at(-1) ?? 0;
}

// Copy a range out of the draft: { axis, length, threading, warpColors } or
// { axis, length, treadling, liftplan, weftColors }.
export function copyRange(draft, axis, { from, to }) {
  const clip = { axis, length: to - from + 1 };
  for (const name of AXES[axis].arrays) clip[name] = structuredClone(draft[name].slice(from, to + 1));
  return clip;
}

// Insert `count` blank ends/picks before index `at`.
export function insert(draft, axis, at, count = 1) {
  const { count: key, limit, arrays } = AXES[axis];
  count = Math.min(count, limit - draft[key]);
  if (count <= 0) return draft;
  const d = cloneDraft(draft);
  for (const name of arrays) {
    const fill = Array.from({ length: count }, () => structuredClone(blank(draft, axis, name, at)));
    d[name].splice(at, 0, ...fill);
  }
  d[key] += count;
  return d;
}

export function remove(draft, axis, { from, to }) {
  const { count: key, arrays } = AXES[axis];
  const d = cloneDraft(draft);
  for (const name of arrays) d[name].splice(from, to - from + 1);
  d[key] -= to - from + 1;
  return d;
}

// Write a copied range over the draft starting at `at`, growing the draft if
// it runs past the end. Shafts/treadles beyond the draft's counts are dropped.
export function paste(draft, clip, at) {
  const { count: key, limit, arrays } = AXES[clip.axis];
  const d = cloneDraft(draft);
  const end = Math.min(at + clip.length, limit);
  if (end > d[key]) {
    const grown = resize(d, { [key]: end });
    Object.assign(d, grown);
  }
  for (const name of arrays) {
    for (let i = at; i < end; i++) d[name][i] = structuredClone(clip[name][i - at]);
  }
  return normalizeDraft(d);
}

// Repeat a range `times` more times, inserted right after it.
export function repeat(draft, axis, range, times = 1) {
  const clip = copyRange(draft, axis, range);
  let d = draft;
  for (let i = 0; i < times; i++) {
    const at = range.to + 1 + i * clip.length;
    d = insert(d, axis, at, clip.length);
    d = paste(d, clip, at);
  }
  return d;
}

// --- Fill helpers ----------------------------------------------------------

// Straight draw over a range of ends: 1, 2, ..., shafts, 1, 2, ...
// counting from the first end of the range.
export function straightDraw(draft, { from, to }, shafts = draft.shafts) {
  const d = cloneDraft(draft);
  for (let e = from; e <= to; e++) d.threading[e] = ((e - from) % shafts) + 1;
  return d;
}

// Point draw: 1..n..2 repeated (1 2 3 4 3 2 1 2 3 4 ...).
export function pointDraw(draft, { from, to }, shafts = draft.shafts) {
  const d = cloneDraft(draft);
  const period = Math.max(1, 2 * shafts - 2);
  for (let e = from; e <= to; e++) {
    const i = (e - from) % period;
    d.threading[e] = shafts === 1 ? 1 : i < shafts ? i + 1 : period - i + 1;
  }
  return d;
}

// Same patterns for treadling over a range of picks (treadle mode) or the
// liftplan (one shaft per pick, liftplan mode).
export function straightTreadling(draft, { from, to }) {
  const n = draft.mode === 'liftplan' ? draft.shafts : draft.treadles;
  return fillPicks(draft, from, to, (i) => (i % n) + 1);
}

export function pointTreadling(draft, { from, to }) {
  const n = draft.mode === 'liftplan' ? draft.shafts : draft.treadles;
  const period = Math.max(1, 2 * n - 2);
  return fillPicks(draft, from, to, (i) => {
    const k = i % period;
    return n === 1 ? 1 : k < n ? k + 1 : period - k + 1;
  });
}

function fillPicks(draft, from, to, valueAt) {
  const d = cloneDraft(draft);
  const key = d.mode === 'liftplan' ? 'liftplan' : 'treadling';
  for (let p = from; p <= to; p++) d[key][p] = [valueAt(p - from)];
  return d;
}

// "Treadle as drawn in" (tromp as writ): pick j uses the treadle whose number
// is the shaft of end j, counting from end 1, repeating the threading as
// needed. Unthreaded ends are skipped. In liftplan mode there are no treadles,
// so pick j lifts the shaft of end j.
export function treadleAsDrawnIn(draft) {
  const shafts = draft.threading.filter((s) => s > 0);
  if (!shafts.length) return draft;
  const d = cloneDraft(draft);
  for (let p = 0; p < d.numPicks; p++) {
    const s = shafts[p % shafts.length];
    if (d.mode === 'liftplan') d.liftplan[p] = [s];
    else d.treadling[p] = s <= d.treadles ? [s] : [];
  }
  return d;
}

// --- Whole-draft settings --------------------------------------------------

export function setMode(draft, mode) {
  if (draft.mode === mode) return draft;
  return mode === 'liftplan' ? toLiftplan(draft) : toTreadling(draft);
}

export function setOption(draft, key, value) {
  const d = cloneDraft(draft);
  if (key === 'risingShed') d.risingShed = Boolean(value);
  else if (key === 'endNumbering') d.display.endNumbering = value === 'ltr' ? 'ltr' : 'rtl';
  return d;
}

export function setMeta(draft, fields) {
  const d = cloneDraft(draft);
  d.meta = { ...d.meta, ...fields };
  return d;
}
