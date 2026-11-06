// Common handweaving yarns: yards per pound and typical setts (ends per inch)
// for plain weave and twill. These are starting points from widely published
// sett charts; a sample is still the real test, and yardage varies by maker,
// so a weaver can always type their own numbers.
//
// Ids are stored in saved stashes and warp plans, so never rename one.

export const YARNS = [
  // Cotton (cotton count: 840 yd/lb per singles count, divided by plies)
  { id: 'cotton-3-2', fiber: 'Cotton', kind: 'cotton', count: '3/2', name: '3/2 cotton', ypp: 1260, plain: 12, twill: 15 },
  { id: 'cotton-5-2', fiber: 'Cotton', kind: 'cotton', count: '5/2', name: '5/2 cotton', ypp: 2100, plain: 15, twill: 18 },
  { id: 'cotton-6-2', fiber: 'Cotton', kind: 'cotton', count: '6/2', name: '6/2 cotton', ypp: 2520, plain: 18, twill: 20 },
  { id: 'cotton-8-4', fiber: 'Cotton', kind: 'cotton', count: '8/4', name: '8/4 cotton (carpet warp)', ypp: 1600, plain: 12, twill: 15 },
  { id: 'cotton-8-2', fiber: 'Cotton', kind: 'cotton', count: '8/2', name: '8/2 cotton', ypp: 3360, plain: 20, twill: 24 },
  { id: 'cotton-10-2', fiber: 'Cotton', kind: 'cotton', count: '10/2', name: '10/2 cotton', ypp: 4200, plain: 24, twill: 28 },
  { id: 'cotton-16-2', fiber: 'Cotton', kind: 'cotton', count: '16/2', name: '16/2 cotton', ypp: 6720, plain: 30, twill: 36 },
  { id: 'cotton-20-2', fiber: 'Cotton', kind: 'cotton', count: '20/2', name: '20/2 cotton', ypp: 8400, plain: 36, twill: 40 },
  { id: 'cotton-30-2', fiber: 'Cotton', kind: 'cotton', count: '30/2', name: '30/2 cotton', ypp: 12600, plain: 42, twill: 48 },
  { id: 'cotton-60-2', fiber: 'Cotton', kind: 'cotton', count: '60/2', name: '60/2 cotton', ypp: 25200, plain: 60, twill: 72 },

  // Cotton/linen blends
  { id: 'cottolin-22-2', fiber: 'Cottolin', kind: 'cottolin', count: '22/2', system: 'lea', name: '22/2 cottolin', ypp: 3200, plain: 20, twill: 24 },
  { id: 'cottolin-8-2', fiber: 'Cottolin', kind: 'cottolin', count: '8/2', name: '8/2 cottolin', ypp: 3200, plain: 20, twill: 24 },

  // Linen (lea count: 300 yd/lb per singles count, divided by plies)
  { id: 'linen-8-2', fiber: 'Linen and hemp', kind: 'linen', count: '8/2', name: '8/2 linen', ypp: 1200, plain: 12, twill: 15 },
  { id: 'linen-10-2', fiber: 'Linen and hemp', kind: 'linen', count: '10/2', name: '10/2 linen', ypp: 1500, plain: 15, twill: 18 },
  { id: 'linen-12-2', fiber: 'Linen and hemp', kind: 'linen', count: '12/2', name: '12/2 linen', ypp: 1800, plain: 16, twill: 20 },
  { id: 'linen-16-2', fiber: 'Linen and hemp', kind: 'linen', count: '16/2', name: '16/2 linen', ypp: 2400, plain: 18, twill: 22 },
  { id: 'linen-20-2', fiber: 'Linen and hemp', kind: 'linen', count: '20/2', name: '20/2 linen', ypp: 3000, plain: 20, twill: 24 },
  { id: 'linen-30-2', fiber: 'Linen and hemp', kind: 'linen', count: '30/2', name: '30/2 linen', ypp: 4500, plain: 24, twill: 28 },
  { id: 'linen-40-2', fiber: 'Linen and hemp', kind: 'linen', count: '40/2', name: '40/2 linen', ypp: 6000, plain: 28, twill: 32 },
  { id: 'linen-8-1', fiber: 'Linen and hemp', kind: 'linen', count: '8/1', name: '8/1 linen (singles)', ypp: 2400, plain: 18, twill: 22 },
  { id: 'linen-16-1', fiber: 'Linen and hemp', kind: 'linen', count: '16/1', name: '16/1 linen (singles)', ypp: 4800, plain: 24, twill: 28 },
  { id: 'linen-rug-warp', fiber: 'Linen and hemp', kind: 'linen', count: '12/6', name: '12/6 linen rug warp', ypp: 600, plain: 8, twill: 10 },
  { id: 'hemp-10-2', fiber: 'Linen and hemp', kind: 'hemp', count: '10/2', name: '10/2 hemp', ypp: 1500, plain: 15, twill: 18 },

  // Wool (worsted count: 560 yd/lb per singles count, divided by plies)
  { id: 'wool-2-8-worsted', fiber: 'Wool', kind: 'wool-worsted', count: '2/8', name: '2/8 worsted wool', ypp: 1680, plain: 16, twill: 20 },
  { id: 'wool-2-8-woolen', fiber: 'Wool', kind: 'wool-woolen', count: '2/8', name: '2/8 woolen (Shetland type)', ypp: 1900, plain: 12, twill: 15 },
  { id: 'wool-2-18-worsted', fiber: 'Wool', kind: 'wool-worsted', count: '2/18', name: '2/18 worsted wool', ypp: 5040, plain: 24, twill: 30 },
  { id: 'wool-2-20-merino', fiber: 'Wool', kind: 'wool-worsted', count: '2/20', name: '2/20 merino', ypp: 5040, plain: 24, twill: 30 },
  { id: 'wool-silk-2-18', fiber: 'Wool', kind: 'wool-worsted', count: '2/18', name: '2/18 wool/silk', ypp: 5040, plain: 24, twill: 30 },
  { id: 'wool-highland', fiber: 'Wool', kind: 'wool-woolen', name: 'Heavy woolen (Highland type)', ypp: 900, plain: 8, twill: 10 },
  { id: 'wool-rug', fiber: 'Wool', kind: 'wool-woolen', name: 'Rug wool (weft)', ypp: 300, plain: 4, twill: 5 },

  // Knitting yarns, by weight class. These vary most of all; check the label.
  { id: 'knit-lace', fiber: 'Knitting yarn', kind: 'knitting', name: 'Lace weight', ypp: 3600, plain: 20, twill: 24 },
  { id: 'knit-fingering', fiber: 'Knitting yarn', kind: 'knitting', name: 'Fingering / sock weight', ypp: 1800, plain: 14, twill: 18 },
  { id: 'knit-sport', fiber: 'Knitting yarn', kind: 'knitting', name: 'Sport weight', ypp: 1300, plain: 12, twill: 14 },
  { id: 'knit-dk', fiber: 'Knitting yarn', kind: 'knitting', name: 'DK weight', ypp: 1100, plain: 10, twill: 12 },
  { id: 'knit-worsted', fiber: 'Knitting yarn', kind: 'knitting', name: 'Worsted / aran weight', ypp: 900, plain: 8, twill: 10 },

  // Silk
  { id: 'silk-20-2', fiber: 'Silk', kind: 'silk', count: '20/2', name: '20/2 spun silk', ypp: 5000, plain: 24, twill: 30 },
  { id: 'silk-30-2', fiber: 'Silk', kind: 'silk', count: '30/2', name: '30/2 spun silk', ypp: 7500, plain: 30, twill: 36 },
  { id: 'silk-60-2', fiber: 'Silk', kind: 'silk', count: '60/2', name: '60/2 spun silk', ypp: 15000, plain: 48, twill: 56 },

  // Tencel, bamboo and other rayons
  { id: 'tencel-5-2', fiber: 'Tencel, bamboo and rayon', kind: 'rayon', count: '5/2', name: '5/2 Tencel', ypp: 2100, plain: 16, twill: 20 },
  { id: 'tencel-8-2', fiber: 'Tencel, bamboo and rayon', kind: 'rayon', count: '8/2', name: '8/2 Tencel', ypp: 3360, plain: 24, twill: 28 },
  { id: 'bamboo-8-2', fiber: 'Tencel, bamboo and rayon', kind: 'rayon', count: '8/2', name: '8/2 bamboo', ypp: 3360, plain: 24, twill: 28 },
  { id: 'rayon-chenille', fiber: 'Tencel, bamboo and rayon', kind: 'rayon', name: 'Rayon chenille', ypp: 1450, plain: 16, twill: 18 },
];

export const yarnById = (id) => YARNS.find((y) => y.id === id) ?? null;

// The yarns grouped by fiber, in table order: [{ fiber, yarns: [...] }].
export function yarnsByFiber() {
  const groups = [];
  for (const y of YARNS) {
    const last = groups[groups.length - 1];
    if (last?.fiber === y.fiber) last.yarns.push(y);
    else groups.push({ fiber: y.fiber, yarns: [y] });
  }
  return groups;
}

// Yarn counts are length per weight by definition. The fiber decides which
// system the numbers are in. yd/lb = base × count ÷ plies.
//   order: how the count is usually written, for the placeholder. 'count/ply'
//   is 8/2 (cotton, linen); 'ply/count' is 2/8 (worsted wool).
export const COUNT_SYSTEMS = {
  cotton: { name: 'Cotton count', short: 'cotton count', base: 840, order: 'count/ply' },
  lea: { name: 'Linen (lea) count', short: 'lea count', base: 300, order: 'count/ply' },
  worsted: { name: 'Worsted count', short: 'worsted count', base: 560, order: 'ply/count' },
  nm: { name: 'Metric (Nm)', short: 'metric count', base: 496.1, order: 'count/ply' }, // 1,000 m per kg
  skein: { name: 'Woolen skein (Yorkshire)', short: 'woolen skein count', base: 256, order: 'ply/count' },
  run: { name: 'Woolen run', short: 'woolen run count', base: 1600, order: 'count/ply' },
};

// What a weaver chooses as the material, and which count systems it is sold in
// (the first is the usual one). `noun` names a yarn of it ("12/2 cotton"). The
// ids match the presets' `kind`; a preset sold in another of its fiber's
// systems says so with `system`.
export const FIBERS = [
  { id: 'cotton', name: 'Cotton', noun: 'cotton', systems: ['cotton'] },
  { id: 'linen', name: 'Linen', noun: 'linen', systems: ['lea'] },
  { id: 'hemp', name: 'Hemp', noun: 'hemp', systems: ['lea'] },
  { id: 'cottolin', name: 'Cottolin (cotton/linen)', noun: 'cottolin', systems: ['cotton', 'lea'] },
  { id: 'wool-worsted', name: 'Wool, worsted', noun: 'worsted wool', systems: ['worsted', 'nm'] },
  { id: 'wool-woolen', name: 'Wool, woolen', noun: 'woolen', systems: ['nm', 'skein', 'run'] },
  { id: 'silk', name: 'Silk', noun: 'silk', systems: ['nm'] },
  { id: 'rayon', name: 'Tencel, bamboo or rayon', noun: 'yarn', systems: ['cotton'] },
  { id: 'knitting', name: 'Knitting yarn (by weight)', noun: 'yarn', systems: [] },
  { id: 'other', name: 'Other or synthetic', noun: 'yarn', systems: ['nm', 'cotton', 'lea', 'worsted', 'skein', 'run'] },
];

export const fiberById = (id) => FIBERS.find((f) => f.id === id) ?? FIBERS[0];
export const presetsForFiber = (fiberId) => YARNS.filter((y) => y.kind === fiberId);

// Read a count such as "8/2", "8-4", "2 / 8", "16/1" or a bare "8" (singles),
// possibly followed by words ("8/2 bamboo"). Returns { count, plies } or null.
// The larger number is always the count and the smaller the plies (no yarn
// has more plies than its count), so 8/2 and 2/8 read the same whichever way
// round a maker writes it.
export function parseCount(text) {
  const m = String(text ?? '').match(/(\d+(?:\.\d+)?)\s*(?:[/\-x×]\s*(\d+(?:\.\d+)?))?/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] === undefined ? null : Number(m[2]);
  if (!(a > 0) || (b !== null && !(b > 0))) return null;
  if (b === null) return { count: a, plies: 1 };
  return { count: Math.max(a, b), plies: Math.min(a, b) };
}

// Yards per pound from a count in a system, or null if it can't be read.
export function yppFromCount(systemId, text) {
  const sys = COUNT_SYSTEMS[systemId];
  const c = sys && parseCount(text);
  if (!c) return null;
  return { ypp: (sys.base * c.count) / c.plies, ...c, base: sys.base };
}

// The preset for a fiber and what the weaver typed: the exact name first
// ("8/2 bamboo"), then the count ("8/4"). null if none.
export function presetFor(fiberId, text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return null;
  const list = presetsForFiber(fiberId);
  const byName = list.find((y) => y.name.toLowerCase() === t);
  if (byName) return byName;
  const c = parseCount(t);
  if (!c || !/^[\d\s./\-x×]+$/i.test(t)) return null;
  return list.find((y) => {
    const p = y.count && parseCount(y.count);
    return p && p.count === c.count && p.plies === c.plies;
  }) ?? null;
}
