// Translate a draft into instructions for a particular loom.
//
// A loom profile is a plain object:
//   { type: 'table' | 'floor', shafts, treadles,
//     shed: 'jack' | 'counterbalance' | 'countermarch',   (floor looms)
//     reeds: [dents per inch, ...] }
//
// Everything works in terms of the shafts that must RISE for each pick, which
// is what a table loom's levers and a jack loom's treadles do. Sinking-shed
// drafts are converted, and counterbalance/countermarch ties are derived from
// the rising set at the end.

import { shaftsForPick } from './draft.js';

const key = (set) => set.join(',');
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

// Shafts that rise on each pick, whatever shed the draft was written for.
export function liftsPerPick(draft) {
  const all = range(draft.shafts);
  return Array.from({ length: draft.numPicks }, (_, p) => {
    const moved = shaftsForPick(draft, p);
    return draft.risingShed ? moved : all.filter((s) => !moved.includes(s));
  });
}

// Shafts actually used by the threading, sorted.
export function usedShafts(draft) {
  return [...new Set(draft.threading.filter((s) => s > 0))].sort((a, b) => a - b);
}

// Smallest p such that seq[i] equals seq[i - p] for every i >= p. A sequence
// with no repeat has period seq.length.
export function periodOf(seq, same = (a, b) => key([a].flat()) === key([b].flat())) {
  const n = seq.length;
  for (let p = 1; p < n; p++) {
    let ok = true;
    for (let i = p; i < n && ok; i++) ok = same(seq[i], seq[i - p]);
    if (ok) return p;
  }
  return n;
}

// Describe a sequence as one repeat unit: { unit, times, extra } where the
// whole sequence is `unit` repeated `times` times followed by the first
// `extra` items of the unit. A unit longer than half the sequence isn't a
// useful repeat, so the whole sequence becomes the unit.
export function repeatUnit(seq) {
  let p = periodOf(seq);
  if (p > seq.length / 2) p = seq.length;
  return { unit: seq.slice(0, p), times: Math.floor(seq.length / Math.max(p, 1)), extra: seq.length % Math.max(p, 1) };
}

// Collapse consecutive equal items: [{ value, count, start }] (start is 0-based).
export function runs(seq) {
  const out = [];
  seq.forEach((v, i) => {
    const last = out.at(-1);
    if (last && key([last.value].flat()) === key([v].flat())) last.count++;
    else out.push({ value: v, count: 1, start: i });
  });
  return out;
}

// Ends on each shaft: heddles[s - 1] is the number of heddles shaft s needs.
export function heddleCounts(draft) {
  const counts = new Array(draft.shafts).fill(0);
  for (const s of draft.threading) if (s > 0) counts[s - 1]++;
  return counts;
}

// Can `lift` be made by pressing at most two of `columns` (each a sorted
// shaft list)? Returns the treadle numbers (1-based), or null.
function pressFor(lift, columns) {
  const want = key(lift);
  const inside = [];
  columns.forEach((c, i) => {
    if (key(c) === want) inside.unshift(i); // exact match first
    else if (c.every((s) => lift.includes(s))) inside.push(i);
  });
  if (inside.length && key(columns[inside[0]]) === want) return [inside[0] + 1];
  for (let a = 0; a < inside.length; a++) {
    for (let b = a + 1; b < inside.length; b++) {
      const union = new Set([...columns[inside[a]], ...columns[inside[b]]]);
      if (union.size === lift.length) return [inside[a] + 1, inside[b] + 1].sort((x, y) => x - y);
    }
  }
  return null;
}

// Find a skeleton tie-up: at most `maxTreadles` treadles such that every lift
// is one treadle or two pressed together. Depth-first search over candidate
// treadles drawn from the lifts and their pairwise intersections and
// differences, with a node budget so it always returns quickly. Returns the
// columns or null.
export function skeletonTieup(lifts, maxTreadles, budget = 50000) {
  const distinct = [...new Map(lifts.filter((l) => l.length).map((l) => [key(l), l])).values()];
  const pool = new Map(distinct.map((l) => [key(l), l]));
  for (const a of distinct) {
    for (const b of distinct) {
      if (a === b) continue;
      const inter = a.filter((s) => b.includes(s));
      const diff = a.filter((s) => !b.includes(s));
      if (inter.length) pool.set(key(inter), inter);
      if (diff.length) pool.set(key(diff), diff);
    }
  }
  const candidates = [...pool.values()];
  let nodes = 0;

  function search(columns) {
    if (++nodes > budget) return null;
    const need = distinct.find((l) => !pressFor(l, columns));
    if (!need) return columns;
    if (columns.length >= maxTreadles) return null;
    const subsets = candidates.filter((c) => c.every((s) => need.includes(s)) && !columns.some((x) => key(x) === key(c)));
    // Try the lift itself first, then halves that pair with an existing treadle,
    // then any pair of new halves.
    const options = [];
    options.push([need]);
    for (const c of subsets) {
      const rest = need.filter((s) => !c.includes(s));
      if (columns.some((x) => x.every((s) => need.includes(s)) && rest.every((s) => x.includes(s)))) options.push([c]);
    }
    for (const c of subsets) {
      const rest = need.filter((s) => !c.includes(s));
      if (!rest.length) continue;
      for (const d of subsets) {
        if (rest.every((s) => d.includes(s)) && key(c) < key(d)) options.push([c, d]);
      }
    }
    for (const add of options) {
      if (columns.length + add.length > maxTreadles) continue;
      const found = search([...columns, ...add]);
      if (found) return found;
    }
    return null;
  }
  return search([]);
}

// Columns and treadling for a floor loom with `maxTreadles` treadles.
// Returns { columns, treadling, method } or { problem }.
//   method: 'draft'     the draft's own tie-up fits
//           'distinct'  one treadle per different lift
//           'skeleton'  two feet for some picks
export function treadlesFor(draft, lifts, maxTreadles) {
  if (draft.mode !== 'liftplan' && draft.risingShed) {
    const used = new Set(draft.treadling.flat());
    if (Math.max(0, ...used) <= maxTreadles && draft.treadling.every((t) => t.length <= 2)) {
      const columns = range(draft.treadles).slice(0, maxTreadles)
        .map((t) => range(draft.shafts).filter((s) => draft.tieup[s - 1][t - 1]));
      return { columns, treadling: draft.treadling.map((t) => [...t]), method: 'draft' };
    }
  }
  const distinct = [...new Map(lifts.filter((l) => l.length).map((l) => [key(l), l])).values()];
  if (distinct.length <= maxTreadles) {
    const index = new Map(distinct.map((l, i) => [key(l), i + 1]));
    return { columns: distinct, treadling: lifts.map((l) => (l.length ? [index.get(key(l))] : [])), method: 'distinct' };
  }
  const columns = skeletonTieup(lifts, maxTreadles);
  if (columns) return { columns, treadling: lifts.map((l) => (l.length ? pressFor(l, columns) : [])), method: 'skeleton' };
  return { problem: `This draft has ${distinct.length} different sheds. With ${maxTreadles} treadles no tie-up was found, even using two feet at once.`, distinct: distinct.length };
}

// Ties for each treadle on each kind of floor loom.
//   jack:           tie the shafts that rise
//   counterbalance: tie the shafts that sink
//   countermarch:   every shaft is tied, rising ones to the upper lams and
//                   sinking ones to the lower lams
export function tiesFor(columns, shafts, shed) {
  return columns.map((rise) => {
    const sink = range(shafts).filter((s) => !rise.includes(s));
    if (shed === 'counterbalance') return { sink };
    if (shed === 'countermarch') return { rise, sink };
    return { rise };
  });
}

// Sley pattern for a sett (ends per inch) with the reeds a weaver owns.
// Returns the simplest { reed, pattern, perInch } where pattern is ends per
// dent over one cycle (e.g. [2, 1] for 1.5 per dent), or null.
export function sleyFor(epi, reeds) {
  let best = null;
  for (const reed of reeds) {
    if (!(reed > 0) || !(epi > 0)) continue;
    // Ends per dent as a fraction a/b, using tenths of an end per inch.
    const g = gcd(Math.round(epi * 10), reed * 10);
    const a = Math.round(epi * 10) / g;
    const b = (reed * 10) / g;
    if (b > 8) continue; // a cycle longer than 8 dents is too fiddly to sley
    const pattern = Array.from({ length: b }, (_, i) => Math.floor(((i + 1) * a) / b) - Math.floor((i * a) / b));
    const max = Math.max(...pattern);
    if (max > 4) continue;
    const score = b * 10 + (pattern.includes(0) ? 15 : 0) + (max > 2 ? 5 * (max - 2) : 0);
    if (!best || score < best.score) best = { reed, pattern, perInch: epi, score };
  }
  if (!best) return null;
  const { score, ...rest } = best;
  return rest;
}

function gcd(a, b) {
  return b ? gcd(b, a % b) : a;
}

// Everything the loom setup page shows, for one draft on one loom.
export function planForLoom(draft, loom) {
  const problems = [];
  const notes = [];
  const used = usedShafts(draft);
  const shaftsNeeded = used.length ? used.at(-1) : 0;
  if (shaftsNeeded > loom.shafts) {
    problems.push(`This draft needs ${shaftsNeeded} shafts; your loom has ${loom.shafts}.`);
  }
  if (draft.threading.some((s) => s === 0)) notes.push('Some ends are unthreaded in the draft; they are left out of the threading.');

  const lifts = liftsPerPick(draft);
  const threadingSeq = draft.threading.filter((s) => s > 0);
  const plan = {
    shaftsNeeded,
    problems,
    notes,
    threading: { ...repeatUnit(threadingSeq), total: threadingSeq.length },
    heddles: heddleCounts(draft).slice(0, Math.max(shaftsNeeded, 1)),
    lifts,
  };
  // Without enough shafts there is no tie-up or lift sequence to give.
  if (shaftsNeeded > loom.shafts) return plan;

  if (loom.type === 'table') {
    plan.picks = { kind: 'levers', ...repeatUnit(lifts), total: lifts.length };
    return plan;
  }

  const t = treadlesFor(draft, lifts, loom.treadles);
  if (t.problem) {
    problems.push(t.problem);
    plan.picks = { kind: 'levers', ...repeatUnit(lifts), total: lifts.length };
    return plan;
  }
  if (t.method === 'skeleton') notes.push('Skeleton tie-up: some picks use two treadles pressed together.');
  if (t.method === 'distinct' && draft.mode !== 'liftplan') notes.push('The tie-up was rearranged to fit your treadles; the cloth is the same.');
  plan.tieup = { columns: t.columns, ties: tiesFor(t.columns, loom.shafts, loom.shed), method: t.method };
  plan.picks = { kind: 'treadles', ...repeatUnit(t.treadling), total: t.treadling.length };

  if (loom.shed === 'counterbalance' && loom.shafts % 2 === 0) {
    const half = loom.shafts / 2;
    const uneven = lifts.some((l) => l.length && l.length !== half);
    if (uneven) notes.push(`Some sheds don't raise exactly half the shafts. Counterbalance looms can give a poor shed for those; check the shed before weaving far.`);
  }
  return plan;
}
