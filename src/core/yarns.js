// Common handweaving yarns: yards per pound and typical setts (ends per inch)
// for plain weave and twill. These are starting points from widely published
// sett charts; a sample is still the real test, and yardage varies by maker,
// so a weaver can always type their own numbers.

export const YARNS = [
  { id: 'cotton-3-2', name: '3/2 cotton', ypp: 1260, plain: 12, twill: 15 },
  { id: 'cotton-5-2', name: '5/2 cotton', ypp: 2100, plain: 15, twill: 18 },
  { id: 'cotton-8-4', name: '8/4 cotton (carpet warp)', ypp: 1600, plain: 12, twill: 15 },
  { id: 'cotton-8-2', name: '8/2 cotton', ypp: 3360, plain: 20, twill: 24 },
  { id: 'cotton-10-2', name: '10/2 cotton', ypp: 4200, plain: 24, twill: 28 },
  { id: 'cotton-16-2', name: '16/2 cotton', ypp: 6720, plain: 30, twill: 36 },
  { id: 'cotton-20-2', name: '20/2 cotton', ypp: 8400, plain: 36, twill: 40 },
  { id: 'cottolin-22-2', name: '22/2 cottolin', ypp: 3200, plain: 20, twill: 24 },
  { id: 'linen-16-2', name: '16/2 linen', ypp: 2400, plain: 18, twill: 22 },
  { id: 'tencel-8-2', name: '8/2 Tencel', ypp: 3360, plain: 24, twill: 28 },
  { id: 'wool-2-8-worsted', name: '2/8 worsted wool', ypp: 1680, plain: 16, twill: 20 },
  { id: 'wool-2-8-woolen', name: '2/8 woolen (Shetland type)', ypp: 1900, plain: 12, twill: 15 },
  { id: 'wool-2-20-merino', name: '2/20 merino', ypp: 5040, plain: 24, twill: 30 },
];

export const yarnById = (id) => YARNS.find((y) => y.id === id) ?? null;
