// Warp planning arithmetic: width in the reed, number of ends, warp length,
// and warp and weft yardage per color. All lengths are in inches unless a
// name says yards. Percentages are fractions (0.1 = 10%).

import { drawdown, floatLengths } from './drawdown.js';
import { periodOf } from './loom.js';

export const DEFAULT_PROJECT = {
  finishedWidth: 18,     // per piece, after washing
  finishedLength: 28,    // per piece, after washing, without hems or fringe
  pieces: 4,
  allowance: 4,          // hems or fringe per piece (finished)
  sampling: 12,          // woven at the start to check the sett and beat
  loomWaste: 27,         // unweavable warp at the front and back
  drawIn: 0.05,          // weft pulls the cloth narrower on the loom
  shrinkWidth: 0.10,     // washing
  takeUp: 0.10,          // warp bends over and under the weft
  shrinkLength: 0.10,    // washing
  weftTakeUp: 0.10,      // extra weft for its bends and the angle in the shed
  floatingSelvedges: false,
  balance: true,         // add ends so the threading ends as it starts
};

// Plain weave or twill-ish, from the longest float on the face of the cloth.
export function structureOf(draft) {
  if (!draft.numEnds || !draft.numPicks) return 'plain';
  const { warp, weft } = floatLengths(drawdown(draft));
  const longest = Math.max(0, ...warp.flat(), ...weft.flat());
  return longest <= 1 ? 'plain' : 'twill';
}

// Ends to add after whole repeats so the threading reads the same from either
// side (e.g. one end to finish a point twill on the shaft it began on), or 0
// if no number of extra ends does that.
export function balancingEnds(unit, repeats = 2) {
  if (unit.length < 2) return 0;
  for (let b = 1; b < unit.length; b++) {
    const seq = [];
    for (let r = 0; r < repeats; r++) seq.push(...unit);
    seq.push(...unit.slice(0, b));
    if (seq.every((v, i) => v === seq[seq.length - 1 - i])) return b;
  }
  return 0;
}

// Count how many of `n` threads get each color when `sequence` repeats across
// them. Returns Map(colorIndex -> count).
export function colorCounts(sequence, n) {
  const unit = sequence.slice(0, periodOf(sequence));
  const counts = new Map();
  if (!unit.length) return counts;
  for (let i = 0; i < n; i++) {
    const c = unit[i % unit.length];
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return counts;
}

// The whole plan. Inputs:
//   project     see DEFAULT_PROJECT
//   epi, ppi    sett and picks per inch
//   threadingUnit  one repeat of the threading (shaft numbers), for rounding ends
//   warpColors, weftColors  the color sequences from the draft (palette indices)
//   warpYpp, weftYpp  yards per pound of the yarns
export function planWarp({ project, epi, ppi, threadingUnit = [], warpColors = [0], weftColors = [0], warpYpp = 0, weftYpp = 0 }) {
  const p = { ...DEFAULT_PROJECT, ...project };
  const widthTarget = p.finishedWidth / ((1 - p.drawIn) * (1 - p.shrinkWidth));
  const rawEnds = widthTarget * epi;

  // Round to whole threading repeats when the repeat is small next to the warp.
  const unit = threadingUnit.length;
  let patternEnds = Math.max(1, Math.round(rawEnds));
  let repeats = 0;
  let balance = 0;
  if (unit && unit <= rawEnds / 2) {
    repeats = Math.max(1, Math.round(rawEnds / unit));
    balance = p.balance ? balancingEnds(threadingUnit) : 0;
    patternEnds = repeats * unit + balance;
  }
  const selvedges = p.floatingSelvedges ? 2 : 0;
  const ends = patternEnds + selvedges;
  const widthInReed = patternEnds / epi;

  const wovenPerPiece = (p.finishedLength + p.allowance) / ((1 - p.takeUp) * (1 - p.shrinkLength));
  const woven = p.pieces * wovenPerPiece + p.sampling;
  const warpLength = woven + p.loomWaste;

  const warpYardsPerEnd = warpLength / 36;
  const warpByColor = [...colorCounts(warpColors, patternEnds)].map(([color, count]) => ({ color, ends: count }));
  if (selvedges) {
    // Floating selvedges are usually the same yarn as the edge ends.
    const edge = warpByColor.find((c) => c.color === warpColors[0]) ?? warpByColor[0];
    if (edge) edge.ends += selvedges;
  }
  for (const c of warpByColor) {
    c.yards = c.ends * warpYardsPerEnd;
    c.pounds = warpYpp ? c.yards / warpYpp : null;
  }

  const picks = woven * ppi;
  const pickYards = (widthInReed * (1 + p.weftTakeUp)) / 36;
  const weftByColor = [...colorCounts(weftColors, Math.round(picks))].map(([color, count]) => ({
    color, picks: count, yards: count * pickYards, pounds: weftYpp ? (count * pickYards) / weftYpp : null,
  }));

  const sum = (list, k) => list.reduce((s, c) => s + (c[k] ?? 0), 0);
  return {
    widthTarget, rawEnds, ends, patternEnds, repeats, balance, selvedges, widthInReed,
    wovenPerPiece, woven, warpLength,
    warp: { byColor: warpByColor, yards: sum(warpByColor, 'yards'), pounds: warpYpp ? sum(warpByColor, 'pounds') : null },
    weft: { byColor: weftByColor, picks: Math.round(picks), yards: sum(weftByColor, 'yards'), pounds: weftYpp ? sum(weftByColor, 'pounds') : null },
  };
}
