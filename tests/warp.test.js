import { test, assert, assertEqual } from './harness.js';
import { createDraft } from '../src/core/draft.js';
import { straightDraw, straightTreadling, setTieup } from '../src/core/edits.js';
import { planWarp, balancingEnds, colorCounts, structureOf } from '../src/core/warp-calc.js';
import { YARNS, yarnById } from '../src/core/yarns.js';

const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

// Worked by hand:
//   width target  = 20 / (0.95 * 0.90)          = 23.392 in
//   raw ends      = 23.392 * 20                 = 467.8 -> 117 repeats of 4 = 468
//   woven/piece   = (30 + 4) / (0.90 * 0.90)    = 41.975 in
//   warp length   = 4 * 41.975 + 12 + 24        = 203.90 in = 5.664 yd
//   warp yards    = 468 * 203.90 / 36           = 2650.7
const project = {
  finishedWidth: 20, finishedLength: 30, pieces: 4, allowance: 4, sampling: 12, loomWaste: 24,
  drawIn: 0.05, shrinkWidth: 0.10, takeUp: 0.10, shrinkLength: 0.10, weftTakeUp: 0.10,
  floatingSelvedges: false, balance: true,
};

test('warp plan matches the hand calculation', () => {
  const plan = planWarp({ project, epi: 20, ppi: 20, threadingUnit: [1, 2, 3, 4], warpYpp: 3360, weftYpp: 3360 });
  assert(near(plan.widthTarget, 23.392, 0.001), `width ${plan.widthTarget}`);
  assertEqual(plan.repeats, 117);
  assertEqual(plan.balance, 0, 'a straight draw needs no balancing end');
  assertEqual(plan.ends, 468);
  assert(near(plan.widthInReed, 23.4));
  assert(near(plan.wovenPerPiece, 41.975, 0.001));
  assert(near(plan.warpLength, 203.901, 0.001), `length ${plan.warpLength}`);
  assert(near(plan.warp.yards, 2650.7, 0.1), `warp yards ${plan.warp.yards}`);
  assert(near(plan.warp.pounds, 2650.7 / 3360, 0.001));
  // Weft: (4 * 41.975 + 12) in woven * 20 ppi = 3598 picks, each 23.4 * 1.1 / 36 yd.
  assertEqual(plan.weft.picks, 3598);
  assert(near(plan.weft.yards, 3598 * 23.4 * 1.1 / 36, 0.1), `weft yards ${plan.weft.yards}`);
});

test('point twill gets a balancing end; floating selvedges add two', () => {
  const plan = planWarp({ project: { ...project, floatingSelvedges: true }, epi: 20, ppi: 20, threadingUnit: [1, 2, 3, 4, 3, 2] });
  assertEqual(plan.balance, 1);
  assertEqual(plan.repeats, 78); // 467.8 / 6 = 77.97
  assertEqual(plan.patternEnds, 78 * 6 + 1);
  assertEqual(plan.ends, 78 * 6 + 1 + 2);
});

test('balancing ends', () => {
  assertEqual(balancingEnds([1, 2, 3, 4, 3, 2]), 1);
  assertEqual(balancingEnds([1, 2, 3, 4]), 0);
  assertEqual(balancingEnds([1, 2, 1, 2, 3, 4, 3, 4]), 0);
});

test('colors are counted by repeating the draft color order', () => {
  // Stripes of 4 dark, 2 light repeated: 10 ends -> 4 dark, 2 light, 4 dark.
  const counts = colorCounts([1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0], 10);
  assertEqual(counts.get(1), 8);
  assertEqual(counts.get(0), 2);
});

test('warp yardage per color adds up to the total', () => {
  const plan = planWarp({ project, epi: 20, ppi: 20, threadingUnit: [1, 2, 3, 4], warpColors: [1, 1, 0, 0], weftColors: [0, 2] });
  assertEqual(plan.warp.byColor.map((c) => c.ends), [234, 234]);
  assert(near(plan.warp.byColor.reduce((s, c) => s + c.yards, 0), plan.warp.yards));
  assertEqual(plan.weft.byColor.map((c) => c.color), [0, 2]);
  assertEqual(plan.warp.pounds, null, 'no weight without yards per pound');
});

test('structure: plain weave vs twill', () => {
  let plain = createDraft({ shafts: 2, treadles: 2, numEnds: 4, numPicks: 4 });
  plain = straightDraw(plain, { from: 0, to: 3 });
  plain = setTieup(setTieup(plain, 1, 1, true), 2, 2, true);
  plain = straightTreadling(plain, { from: 0, to: 3 });
  assertEqual(structureOf(plain), 'plain');
  let twill = createDraft({ shafts: 4, treadles: 4, numEnds: 8, numPicks: 8 });
  twill = straightDraw(twill, { from: 0, to: 7 });
  [[1, 2], [2, 3], [3, 4], [4, 1]].forEach((s, t) => s.forEach((x) => { twill = setTieup(twill, x, t + 1, true); }));
  twill = straightTreadling(twill, { from: 0, to: 7 });
  assertEqual(structureOf(twill), 'twill');
});

test('yarn table is complete', () => {
  for (const y of YARNS) assert(y.ypp > 0 && y.plain > 0 && y.twill >= y.plain, y.name);
  assertEqual(yarnById('cotton-8-2').ypp, 3360);
});
