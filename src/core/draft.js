// Draft model. A draft is a plain, JSON-serializable object; every function here
// returns a new draft rather than mutating its input.
//
// Indexing: arrays are 0-based in memory (end 1 is threading[0]), but the values
// stored in them are 1-based shaft/treadle numbers, matching weaving convention
// and WIF. Palette indices are 0-based.

export const FORMAT_VERSION = 1;

export const DEFAULT_PALETTE = [
  [255, 255, 255],
  [0, 0, 0],
];

export function createDraft({
  shafts = 4,
  treadles = 4,
  numEnds = 0,
  numPicks = 0,
  risingShed = true,
  mode = 'treadle',
  palette = DEFAULT_PALETTE,
  warpColor = 1,
  weftColor = 0,
} = {}) {
  return {
    formatVersion: FORMAT_VERSION,
    shafts,
    treadles,
    numEnds,
    numPicks,
    threading: new Array(numEnds).fill(0),
    tieup: emptyTieup(shafts, treadles),
    treadling: Array.from({ length: numPicks }, () => []),
    liftplan: Array.from({ length: numPicks }, () => []),
    mode,
    risingShed,
    palette: palette.map((c) => [...c]),
    warpColors: new Array(numEnds).fill(warpColor),
    weftColors: new Array(numPicks).fill(weftColor),
    display: { endNumbering: 'rtl', tieupCorner: 'tr' },
    meta: { title: '', notes: '', source: '', sourceYear: null, page: '', license: '', transcribedBy: '' },
    extraWifSections: [],
  };
}

export function emptyTieup(shafts, treadles) {
  return Array.from({ length: shafts }, () => new Array(treadles).fill(false));
}

export function cloneDraft(draft) {
  return structuredClone(draft);
}

// Bring a possibly partial or inconsistent draft into shape: arrays sized to the
// counts, values clamped to valid ranges, set-like rows sorted and de-duplicated.
export function normalizeDraft(input) {
  const base = createDraft();
  const d = { ...base, ...structuredClone(input) };
  d.formatVersion = FORMAT_VERSION;
  d.display = { ...base.display, ...(input.display || {}) };
  d.meta = { ...base.meta, ...(input.meta || {}) };
  d.shafts = posInt(d.shafts, 1);
  d.treadles = posInt(d.treadles, 0);
  d.numEnds = posInt(d.numEnds, 0);
  d.numPicks = posInt(d.numPicks, 0);
  if (!Array.isArray(d.palette) || d.palette.length === 0) d.palette = DEFAULT_PALETTE.map((c) => [...c]);
  const maxColor = d.palette.length - 1;

  d.threading = resize(d.threading, d.numEnds, 0).map((s) => (Number.isInteger(s) && s >= 1 && s <= d.shafts ? s : 0));
  d.tieup = Array.from({ length: d.shafts }, (_, s) =>
    Array.from({ length: d.treadles }, (_, t) => Boolean(d.tieup?.[s]?.[t])));
  d.treadling = resize(d.treadling, d.numPicks, null).map((row) => cleanSet(row, d.treadles));
  d.liftplan = resize(d.liftplan, d.numPicks, null).map((row) => cleanSet(row, d.shafts));
  d.warpColors = resize(d.warpColors, d.numEnds, 0).map((c) => clampColor(c, maxColor));
  d.weftColors = resize(d.weftColors, d.numPicks, 0).map((c) => clampColor(c, maxColor));
  d.mode = d.mode === 'liftplan' ? 'liftplan' : 'treadle';
  d.risingShed = d.risingShed !== false;
  if (!Array.isArray(d.extraWifSections)) d.extraWifSections = [];
  return d;
}

// Shafts raised (or, on a sinking-shed loom, lowered) for a pick, as a sorted array.
export function shaftsForPick(draft, pick) {
  if (draft.mode === 'liftplan') return draft.liftplan[pick] ?? [];
  const shafts = new Set();
  for (const treadle of draft.treadling[pick] ?? []) {
    for (let s = 0; s < draft.shafts; s++) {
      if (draft.tieup[s][treadle - 1]) shafts.add(s + 1);
    }
  }
  return [...shafts].sort((a, b) => a - b);
}

// Treadle mode -> liftplan mode. Always exact.
export function toLiftplan(draft) {
  const d = cloneDraft(draft);
  d.liftplan = Array.from({ length: d.numPicks }, (_, p) => [...shaftsForPick(draft, p)]);
  d.mode = 'liftplan';
  return d;
}

// Liftplan mode -> treadle mode. Builds a new tie-up with one treadle per distinct
// lift (in order of first use), so every pick uses exactly one treadle. The
// treadle count grows if the loom would need more; callers that care about a
// physical treadle limit should check d.treadles afterwards.
export function toTreadling(draft) {
  const d = cloneDraft(draft);
  const keys = new Map();
  const lifts = [];
  d.treadling = d.liftplan.map((row) => {
    if (row.length === 0) return [];
    const key = row.join(',');
    if (!keys.has(key)) {
      keys.set(key, lifts.length + 1);
      lifts.push(row);
    }
    return [keys.get(key)];
  });
  d.treadles = Math.max(lifts.length, 1);
  d.tieup = emptyTieup(d.shafts, d.treadles);
  lifts.forEach((row, t) => row.forEach((s) => { d.tieup[s - 1][t] = true; }));
  d.mode = 'treadle';
  return d;
}

function posInt(v, min) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min ? n : min;
}

function resize(arr, length, fill) {
  const src = Array.isArray(arr) ? arr : [];
  return Array.from({ length }, (_, i) => (i < src.length ? src[i] : fill));
}

function cleanSet(row, max) {
  if (!Array.isArray(row)) return [];
  return [...new Set(row.filter((v) => Number.isInteger(v) && v >= 1 && v <= max))].sort((a, b) => a - b);
}

function clampColor(c, max) {
  return Number.isInteger(c) && c >= 0 && c <= max ? c : 0;
}
