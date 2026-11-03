// Common handweaving yarns: yards per pound and typical setts (ends per inch)
// for plain weave and twill. These are starting points from widely published
// sett charts; a sample is still the real test, and yardage varies by maker,
// so a weaver can always type their own numbers.
//
// Ids are stored in saved stashes and warp plans, so never rename one.

export const YARNS = [
  // Cotton (cotton count: 840 yd/lb per singles count, divided by plies)
  { id: 'cotton-3-2', fiber: 'Cotton', name: '3/2 cotton', ypp: 1260, plain: 12, twill: 15 },
  { id: 'cotton-5-2', fiber: 'Cotton', name: '5/2 cotton', ypp: 2100, plain: 15, twill: 18 },
  { id: 'cotton-6-2', fiber: 'Cotton', name: '6/2 cotton', ypp: 2520, plain: 18, twill: 20 },
  { id: 'cotton-8-4', fiber: 'Cotton', name: '8/4 cotton (carpet warp)', ypp: 1600, plain: 12, twill: 15 },
  { id: 'cotton-8-2', fiber: 'Cotton', name: '8/2 cotton', ypp: 3360, plain: 20, twill: 24 },
  { id: 'cotton-10-2', fiber: 'Cotton', name: '10/2 cotton', ypp: 4200, plain: 24, twill: 28 },
  { id: 'cotton-16-2', fiber: 'Cotton', name: '16/2 cotton', ypp: 6720, plain: 30, twill: 36 },
  { id: 'cotton-20-2', fiber: 'Cotton', name: '20/2 cotton', ypp: 8400, plain: 36, twill: 40 },
  { id: 'cotton-30-2', fiber: 'Cotton', name: '30/2 cotton', ypp: 12600, plain: 42, twill: 48 },
  { id: 'cotton-60-2', fiber: 'Cotton', name: '60/2 cotton', ypp: 25200, plain: 60, twill: 72 },

  // Cotton/linen blends
  { id: 'cottolin-22-2', fiber: 'Cottolin', name: '22/2 cottolin', ypp: 3200, plain: 20, twill: 24 },
  { id: 'cottolin-8-2', fiber: 'Cottolin', name: '8/2 cottolin', ypp: 3200, plain: 20, twill: 24 },

  // Linen (lea count: 300 yd/lb per singles count, divided by plies)
  { id: 'linen-8-2', fiber: 'Linen and hemp', name: '8/2 linen', ypp: 1200, plain: 12, twill: 15 },
  { id: 'linen-10-2', fiber: 'Linen and hemp', name: '10/2 linen', ypp: 1500, plain: 15, twill: 18 },
  { id: 'linen-12-2', fiber: 'Linen and hemp', name: '12/2 linen', ypp: 1800, plain: 16, twill: 20 },
  { id: 'linen-16-2', fiber: 'Linen and hemp', name: '16/2 linen', ypp: 2400, plain: 18, twill: 22 },
  { id: 'linen-20-2', fiber: 'Linen and hemp', name: '20/2 linen', ypp: 3000, plain: 20, twill: 24 },
  { id: 'linen-30-2', fiber: 'Linen and hemp', name: '30/2 linen', ypp: 4500, plain: 24, twill: 28 },
  { id: 'linen-40-2', fiber: 'Linen and hemp', name: '40/2 linen', ypp: 6000, plain: 28, twill: 32 },
  { id: 'linen-8-1', fiber: 'Linen and hemp', name: '8/1 linen (singles)', ypp: 2400, plain: 18, twill: 22 },
  { id: 'linen-16-1', fiber: 'Linen and hemp', name: '16/1 linen (singles)', ypp: 4800, plain: 24, twill: 28 },
  { id: 'linen-rug-warp', fiber: 'Linen and hemp', name: '12/6 linen rug warp', ypp: 600, plain: 8, twill: 10 },
  { id: 'hemp-10-2', fiber: 'Linen and hemp', name: '10/2 hemp', ypp: 1500, plain: 15, twill: 18 },

  // Wool (worsted count: 560 yd/lb per singles count, divided by plies)
  { id: 'wool-2-8-worsted', fiber: 'Wool', name: '2/8 worsted wool', ypp: 1680, plain: 16, twill: 20 },
  { id: 'wool-2-8-woolen', fiber: 'Wool', name: '2/8 woolen (Shetland type)', ypp: 1900, plain: 12, twill: 15 },
  { id: 'wool-2-18-worsted', fiber: 'Wool', name: '2/18 worsted wool', ypp: 5040, plain: 24, twill: 30 },
  { id: 'wool-2-20-merino', fiber: 'Wool', name: '2/20 merino', ypp: 5040, plain: 24, twill: 30 },
  { id: 'wool-silk-2-18', fiber: 'Wool', name: '2/18 wool/silk', ypp: 5040, plain: 24, twill: 30 },
  { id: 'wool-highland', fiber: 'Wool', name: 'Heavy woolen (Highland type)', ypp: 900, plain: 8, twill: 10 },
  { id: 'wool-rug', fiber: 'Wool', name: 'Rug wool (weft)', ypp: 300, plain: 4, twill: 5 },

  // Knitting yarns, by weight class. These vary most of all; check the label.
  { id: 'knit-lace', fiber: 'Knitting yarn', name: 'Lace weight', ypp: 3600, plain: 20, twill: 24 },
  { id: 'knit-fingering', fiber: 'Knitting yarn', name: 'Fingering / sock weight', ypp: 1800, plain: 14, twill: 18 },
  { id: 'knit-sport', fiber: 'Knitting yarn', name: 'Sport weight', ypp: 1300, plain: 12, twill: 14 },
  { id: 'knit-dk', fiber: 'Knitting yarn', name: 'DK weight', ypp: 1100, plain: 10, twill: 12 },
  { id: 'knit-worsted', fiber: 'Knitting yarn', name: 'Worsted / aran weight', ypp: 900, plain: 8, twill: 10 },

  // Silk
  { id: 'silk-20-2', fiber: 'Silk', name: '20/2 spun silk', ypp: 5000, plain: 24, twill: 30 },
  { id: 'silk-30-2', fiber: 'Silk', name: '30/2 spun silk', ypp: 7500, plain: 30, twill: 36 },
  { id: 'silk-60-2', fiber: 'Silk', name: '60/2 spun silk', ypp: 15000, plain: 48, twill: 56 },

  // Tencel, bamboo and other rayons
  { id: 'tencel-5-2', fiber: 'Tencel, bamboo and rayon', name: '5/2 Tencel', ypp: 2100, plain: 16, twill: 20 },
  { id: 'tencel-8-2', fiber: 'Tencel, bamboo and rayon', name: '8/2 Tencel', ypp: 3360, plain: 24, twill: 28 },
  { id: 'bamboo-8-2', fiber: 'Tencel, bamboo and rayon', name: '8/2 bamboo', ypp: 3360, plain: 24, twill: 28 },
  { id: 'rayon-chenille', fiber: 'Tencel, bamboo and rayon', name: 'Rayon chenille', ypp: 1450, plain: 16, twill: 18 },
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
