// WIF 1.1 (Weaving Information File) import/export.
//
// Import is lenient: section and key names are case-insensitive, missing
// sections fall back to defaults, and anything we don't understand is kept in
// draft.extraWifSections so it is written back out on export.

import { createDraft, normalizeDraft } from './draft.js';

const PRIVATE_SECTION = 'PRIVATE LOOMINATION META';

// Keys we consume from sections that may also hold keys we don't.
const CONSUMED_KEYS = {
  TEXT: ['title'],
  WEAVING: ['shafts', 'treadles', 'rising shed'],
  WARP: ['threads', 'color'],
  WEFT: ['threads', 'color'],
};

// Sections that are fully consumed (or regenerated) and never kept as extras.
const OWNED_SECTIONS = new Set([
  'WIF', 'CONTENTS', 'COLOR PALETTE', 'COLOR TABLE', 'THREADING', 'TIEUP',
  'TREADLING', 'LIFTPLAN', 'WARP COLORS', 'WEFT COLORS', 'NOTES', PRIVATE_SECTION,
]);

// Parse WIF text. Returns { draft, warnings }.
export function parseWif(text) {
  const warnings = [];
  const sections = readSections(text);
  const sec = (name) => sections.get(name);
  const val = (name, key) => sec(name)?.map.get(key);

  // Colors. Palette entries are 1-based in WIF, 0-based in the model.
  let palette = null;
  const table = sec('COLOR TABLE');
  if (table) {
    const [lo, hi] = parseRange(val('COLOR PALETTE', 'range'));
    const byIndex = numberedEntries(table);
    const count = Math.max(intOr(val('COLOR PALETTE', 'entries'), 0), ...byIndex.keys(), 0);
    palette = Array.from({ length: count }, (_, i) => {
      const raw = byIndex.get(i + 1);
      const rgb = raw ? parseInts(raw) : [];
      if (raw && rgb.length < 3) warnings.push(`Color ${i + 1} is not r,g,b: "${raw}"`);
      return [0, 1, 2].map((k) => scale(rgb[k] ?? hi, lo, hi));
    });
  }
  const base = createDraft();
  palette = palette && palette.length ? palette : base.palette;

  const defaultColor = (section, fallback) => {
    const raw = val(section, 'color');
    if (raw === undefined) return fallback;
    const nums = parseInts(raw);
    if (nums.length >= 3) {
      // Some programs write an r,g,b triple here instead of a palette index.
      palette.push(nums.slice(0, 3));
      return palette.length - 1;
    }
    return nums.length ? nums[0] - 1 : fallback;
  };
  const warpDefault = defaultColor('WARP', palette.length > 1 ? 1 : 0);
  const weftDefault = defaultColor('WEFT', 0);

  const threading = numberedLists(sec('THREADING'));
  const tieup = numberedLists(sec('TIEUP'));
  const treadling = numberedLists(sec('TREADLING'));
  const liftplan = numberedLists(sec('LIFTPLAN'));
  const warpColors = numberedLists(sec('WARP COLORS'));
  const weftColors = numberedLists(sec('WEFT COLORS'));

  const maxKey = (...maps) => Math.max(0, ...maps.flatMap((m) => [...m.keys()]));
  const maxVal = (...maps) => Math.max(0, ...maps.flatMap((m) => [...m.values()].flat()));

  const shafts = intOr(val('WEAVING', 'shafts'), 0) || maxVal(threading, tieup, liftplan) || 4;
  const treadles = intOr(val('WEAVING', 'treadles'), 0) || maxKey(tieup) || maxVal(treadling);
  const numEnds = intOr(val('WARP', 'threads'), 0) || maxKey(threading, warpColors);
  const numPicks = intOr(val('WEFT', 'threads'), 0) || maxKey(treadling, liftplan, weftColors);

  const draft = createDraft({ shafts, treadles, numEnds, numPicks, palette, warpColor: warpDefault, weftColor: weftDefault });
  draft.risingShed = parseBool(val('WEAVING', 'rising shed'), true);

  for (const [end, list] of threading) {
    if (end > numEnds) continue;
    if (list.length > 1) warnings.push(`End ${end} is on more than one shaft (${list.join(',')}); using shaft ${list[0]}.`);
    draft.threading[end - 1] = list[0] ?? 0;
  }
  for (const [treadle, list] of tieup) {
    for (const s of list) if (treadle <= treadles && s >= 1 && s <= shafts) draft.tieup[s - 1][treadle - 1] = true;
  }
  for (const [pick, list] of treadling) if (pick <= numPicks) draft.treadling[pick - 1] = list;
  for (const [pick, list] of liftplan) if (pick <= numPicks) draft.liftplan[pick - 1] = list;
  for (const [end, list] of warpColors) if (end <= numEnds && list.length) draft.warpColors[end - 1] = list[0] - 1;
  for (const [pick, list] of weftColors) if (pick <= numPicks && list.length) draft.weftColors[pick - 1] = list[0] - 1;

  draft.mode = treadling.size === 0 && liftplan.size > 0 ? 'liftplan' : 'treadle';
  draft.meta.title = val('TEXT', 'title') ?? '';
  if (sec('NOTES')) {
    draft.meta.notes = [...numberedEntries(sec('NOTES'))].sort((a, b) => a[0] - b[0]).map(([, v]) => v).join('\n');
  }
  readPrivate(sec(PRIVATE_SECTION), draft);

  // Leftover keys from partly-consumed sections come first, in the order toWif
  // writes them, so an export/import round trip yields the same list.
  const partial = Object.keys(CONSUMED_KEYS);
  const extraNames = [...sections.keys()]
    .filter((name) => !OWNED_SECTIONS.has(name))
    .sort((a, b) => rank(a) - rank(b));
  function rank(name) {
    const i = partial.indexOf(name);
    return i < 0 ? partial.length : i;
  }
  for (const name of extraNames) {
    const consumed = CONSUMED_KEYS[name] ?? [];
    const entries = sections.get(name).entries.filter(([k]) => !consumed.includes(k.toLowerCase()));
    if (entries.length || !CONSUMED_KEYS[name]) draft.extraWifSections.push({ name, entries });
  }

  const before = JSON.stringify(draft);
  const normalized = normalizeDraft(draft);
  if (JSON.stringify(normalized) !== before) warnings.push('Some values were out of range and were corrected.');
  return { draft: normalized, warnings };
}

// Serialize a draft to WIF 1.1 text.
export function toWif(draft, { sourceProgram = 'Loomination', sourceVersion = '0.1' } = {}) {
  const out = [];
  const extras = new Map(draft.extraWifSections.map((s) => [s.name.toUpperCase(), s]));
  const sections = [];
  const add = (name, entries) => {
    const extra = extras.get(name);
    if (extra) {
      entries = [...entries, ...extra.entries];
      extras.delete(name);
    }
    sections.push({ name, entries });
  };

  if (draft.meta.title || extras.has('TEXT')) add('TEXT', draft.meta.title ? [['Title', draft.meta.title]] : []);
  add('WEAVING', [['Shafts', draft.shafts], ['Treadles', draft.treadles], ['Rising Shed', draft.risingShed]]);
  add('WARP', [['Threads', draft.numEnds], ['Color', mostCommon(draft.warpColors) + 1]]);
  add('WEFT', [['Threads', draft.numPicks], ['Color', mostCommon(draft.weftColors) + 1]]);
  add('COLOR PALETTE', [['Entries', draft.palette.length], ['Form', 'RGB'], ['Range', '0,255']]);
  add('COLOR TABLE', draft.palette.map((c, i) => [i + 1, c.join(',')]));
  add('THREADING', draft.threading.flatMap((s, i) => (s ? [[i + 1, s]] : [])));

  const tieupRows = [];
  for (let t = 0; t < draft.treadles; t++) {
    const shafts = [];
    for (let s = 0; s < draft.shafts; s++) if (draft.tieup[s][t]) shafts.push(s + 1);
    if (shafts.length) tieupRows.push([t + 1, shafts.join(',')]);
  }
  const listRows = (rows) => rows.flatMap((r, i) => (r.length ? [[i + 1, r.join(',')]] : []));
  const treadlingRows = listRows(draft.treadling);
  const liftplanRows = listRows(draft.liftplan);
  if (tieupRows.length || draft.mode === 'treadle') add('TIEUP', tieupRows);
  if (treadlingRows.length || draft.mode === 'treadle') add('TREADLING', treadlingRows);
  if (liftplanRows.length || draft.mode === 'liftplan') add('LIFTPLAN', liftplanRows);

  add('WARP COLORS', draft.warpColors.map((c, i) => [i + 1, c + 1]));
  add('WEFT COLORS', draft.weftColors.map((c, i) => [i + 1, c + 1]));
  if (draft.meta.notes) add('NOTES', draft.meta.notes.split(/\r?\n/).map((line, i) => [i + 1, line]));
  add(PRIVATE_SECTION, privateEntries(draft));
  for (const extra of extras.values()) sections.push({ name: extra.name, entries: extra.entries });

  out.push('[WIF]', 'Version=1.1', 'Date=April 20, 1997', 'Developers=wif@mhsoft.com',
    `Source Program=${sourceProgram}`, `Source Version=${sourceVersion}`, '');
  out.push('[CONTENTS]', ...sections.map((s) => `${s.name}=true`), '');
  for (const s of sections) {
    out.push(`[${s.name}]`, ...s.entries.map(([k, v]) => `${k}=${formatValue(v)}`), '');
  }
  return out.join('\r\n');
}

// --- reading helpers ---

function readSections(text) {
  const sections = new Map();
  let current = null;
  for (const rawLine of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;
    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      const name = header[1].trim();
      const key = name.toUpperCase();
      current = sections.get(key) ?? { name, entries: [], map: new Map() };
      sections.set(key, current);
      continue;
    }
    if (!current) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    current.entries.push([k, v]);
    current.map.set(k.toLowerCase(), v);
  }
  return sections;
}

// Entries whose keys are thread/treadle/color numbers, as Map<number, string>.
function numberedEntries(section) {
  const m = new Map();
  for (const [k, v] of section?.entries ?? []) {
    const n = parseInt(k, 10);
    if (Number.isInteger(n) && n >= 1) m.set(n, v);
  }
  return m;
}

// Same, with values parsed as comma-separated integer lists (0 dropped).
function numberedLists(section) {
  const m = new Map();
  for (const [n, v] of numberedEntries(section)) m.set(n, parseInts(v).filter((x) => x > 0));
  return m;
}

function parseInts(s) {
  return String(s).split(',').map((x) => parseInt(x.trim(), 10)).filter(Number.isInteger);
}

function intOr(s, fallback) {
  const n = parseInt(s, 10);
  return Number.isInteger(n) ? n : fallback;
}

function parseBool(s, fallback) {
  if (s === undefined) return fallback;
  const v = s.toLowerCase();
  if (['true', 'yes', 'on', '1'].includes(v)) return true;
  if (['false', 'no', 'off', '0'].includes(v)) return false;
  return fallback;
}

function parseRange(s) {
  const nums = s ? parseInts(s) : [];
  return nums.length >= 2 && nums[1] > nums[0] ? [nums[0], nums[1]] : [0, 255];
}

function scale(v, lo, hi) {
  const clamped = Math.min(hi, Math.max(lo, v));
  return Math.round(((clamped - lo) / (hi - lo)) * 255);
}

// --- Loomination-only fields, stored in a WIF private section ---

const PRIVATE_FIELDS = [
  ['Mode', (d) => d.mode, (d, v) => { d.mode = v; }],
  ['End Numbering', (d) => d.display.endNumbering, (d, v) => { d.display.endNumbering = v; }],
  ['Tieup Corner', (d) => d.display.tieupCorner, (d, v) => { d.display.tieupCorner = v; }],
  ['Source', (d) => d.meta.source, (d, v) => { d.meta.source = v; }],
  ['Source Year', (d) => d.meta.sourceYear, (d, v) => { d.meta.sourceYear = intOr(v, null); }],
  ['Page', (d) => d.meta.page, (d, v) => { d.meta.page = v; }],
  ['License', (d) => d.meta.license, (d, v) => { d.meta.license = v; }],
  ['Transcribed By', (d) => d.meta.transcribedBy, (d, v) => { d.meta.transcribedBy = v; }],
];

function privateEntries(draft) {
  return PRIVATE_FIELDS
    .map(([key, get]) => [key, get(draft)])
    .filter(([, v]) => v !== '' && v !== null && v !== undefined);
}

function readPrivate(section, draft) {
  if (!section) return;
  for (const [key, , set] of PRIVATE_FIELDS) {
    const v = section.map.get(key.toLowerCase());
    if (v !== undefined) set(draft, v);
  }
}

// --- writing helpers ---

function formatValue(v) {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v).replace(/[\r\n]+/g, ' ');
}

function mostCommon(arr) {
  const counts = new Map();
  let best = 0;
  let bestCount = 0;
  for (const v of arr) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) { best = v; bestCount = c; }
  }
  return best;
}
