import { test, assert, assertEqual } from './harness.js';
import { coreArea, coreWeight, yarnOnCore, yppFromSample, sampleAdvice, GRAMS_PER_POUND } from '../src/core/cone.js';
import { YARNS, FIBERS, COUNT_SYSTEMS, parseCount, yppFromCount, presetFor, countFromYpp } from '../src/core/yarns.js';

const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Worked by hand: a typical paper cone, 6.5 in tall (16.51 cm), 2.75 in
// (6.985 cm) at the base, 1 in (2.54 cm) at the top, 2 mm wall.
//   slant = hypot(16.51, 3.4925 - 1.27)     = 16.659 cm
//   area  = pi * (3.4925 + 1.27) * 16.659    = 249.26 cm²
//   mass  = 249.26 * 0.2 * 0.75              = 37.4 g
const cone = { shape: 'cone', length: 16.51, baseDiameter: 6.985, topDiameter: 2.54, thickness: 0.2, material: 'cardboard' };

test('cone core weight matches the hand calculation', () => {
  assert(near(coreArea(cone), 249.26, 0.05), `area ${coreArea(cone)}`);
  const w = coreWeight(cone);
  assert(near(w.grams, 37.4, 0.1), `grams ${w.grams}`);
  assert(w.low < w.grams && w.grams < w.high);
});

test('tube core: a cylinder', () => {
  // 15 cm long, 4 cm across, 0.3 cm wall, plastic: pi * 4 * 15 * 0.3 * 0.95 = 53.7 g
  const w = coreWeight({ shape: 'tube', length: 15, baseDiameter: 4, thickness: 0.3, material: 'plastic' });
  assert(near(w.grams, Math.PI * 4 * 15 * 0.3 * 0.95, 0.001));
  assertEqual(coreArea({ shape: 'tube', length: 15, baseDiameter: 4, topDiameter: 1 }), Math.PI * 4 * 15, 'tube ignores the top diameter');
});

test('yarn length from weight: 8/2 cotton', () => {
  // 500 g gross, 40 g core: 460 g = 1.0141 lb * 3360 yd/lb = 3407 yd
  const r = yarnOnCore({ grossGrams: 500, core: { grams: 40 }, ypp: 3360 });
  assert(near(r.yards, (460 / GRAMS_PER_POUND) * 3360, 0.01));
  assert(near(r.yards, 3407.4, 0.1), `yards ${r.yards}`);
  assert(near(r.meters, r.yards * 0.9144, 0.001));
  assert(r.low < r.yards && r.yards < r.high, 'range brackets the estimate');
  // A weighed core has no density spread, only the yarn's.
  assert(near(r.high / r.yards, 1.05, 1e-9));
});

test('an empty core gives no yarn, never negative', () => {
  const r = yarnOnCore({ grossGrams: 30, core: { grams: 37, low: 30, high: 45 }, ypp: 3360 });
  assertEqual(r.yards, 0);
  assertEqual(r.low, 0);
});

test('yarn counts: yards per pound from fiber and count', () => {
  assertEqual(yppFromCount('cotton', '10/2').ypp, 4200, '10/2 cotton');
  assertEqual(yppFromCount('lea', '10/2').ypp, 1500, '10/2 linen');
  assertEqual(yppFromCount('worsted', '2/18').ypp, 5040, '2/18 worsted');
  assertEqual(yppFromCount('lea', '6/4').ypp, 450, '6/4 linen');
  assertEqual(yppFromCount('cotton', '8').ypp, 6720, 'a bare count is a singles');
  assert(near(yppFromCount('nm', '20/2').ypp, 4961, 1), 'Nm 20/2');
  assertEqual(yppFromCount('cotton', 'lots'), null);
});

test('yarn counts: the larger number is the count, however it is written', () => {
  for (const t of ['8/2', '2/8', '8-2', '8 / 2', '8x2', '8/2 bamboo']) {
    const c = parseCount(t);
    assertEqual(c.count, 8, t);
    assertEqual(c.plies, 2, t);
  }
  assertEqual(parseCount(''), null);
});

test('yarn counts: every preset with a count is near what its count says', () => {
  for (const y of YARNS.filter((y) => y.count)) {
    const fiber = FIBERS.find((f) => f.id === y.kind);
    const t = yppFromCount(y.system ?? fiber.systems[0], y.count);
    // 2/8 worsted is sold well under its count; the rest are within 15%.
    assert(Math.abs(t.ypp / y.ypp - 1) < (y.id === 'wool-2-8-worsted' ? 0.4 : 0.15), `${y.id}: ${t.ypp} vs ${y.ypp}`);
  }
  for (const f of FIBERS) for (const s of f.systems) assert(COUNT_SYSTEMS[s], `${f.id} system ${s}`);
  for (const y of YARNS) assert(FIBERS.some((f) => f.id === y.kind), `${y.id} kind`);
});

test('yarn counts: a fiber and count find the usual figure', () => {
  assertEqual(presetFor('cotton', '8/4')?.id, 'cotton-8-4');
  assertEqual(presetFor('cotton', ' 8 / 4 ')?.id, 'cotton-8-4');
  assertEqual(presetFor('linen', '10/2')?.id, 'linen-10-2');
  assertEqual(presetFor('rayon', '8/2 bamboo')?.id, 'bamboo-8-2');
  assertEqual(presetFor('knitting', 'DK weight')?.id, 'knit-dk');
  assertEqual(presetFor('cotton', '12/2'), null, 'no 12/2 cotton preset');
  assertEqual(presetFor('cotton', '10/2 linen'), null, 'words must match a name exactly');
});

test('weighed sample: yards per pound and how far it can be off', () => {
  // 100 yd of 8/2 cotton weighs 453.592 / 3360 * 100 = 13.5 g
  const s = yppFromSample({ yards: 100, grams: 13.5, scaleStep: 0.1 });
  assert(near(s.ypp, 3360, 5), `ypp ${s.ypp}`);
  assert(near(s.spread, 0.05 / 13.5 + 0.01, 1e-9), 'half a step over the weight, plus 1% for the length');
  assertEqual(yppFromSample({ yards: 0, grams: 5 }), null);
  assertEqual(yppFromSample({ yards: 5, grams: 0 }), null);
  // The wider spread carries into the yardage range.
  const r = yarnOnCore({ grossGrams: 500, core: { grams: 40 }, ypp: 3360, spread: 0.2 });
  assert(near(r.high / r.low, 1.2 / 0.8, 1e-9), 'a ±20% figure gives a ±20% range');
});

test('weighed sample: how long a sample to measure', () => {
  // 25 steps of the scale: 25 g on a kitchen scale is 185 yd of 8/2 cotton.
  const kitchen = sampleAdvice({ ypp: 3360, scaleStep: 1 });
  assertEqual(kitchen.grams, 25);
  assert(near(kitchen.yards, (25 / GRAMS_PER_POUND) * 3360, 0.01));
  // A jeweller's scale needs only 0.25 g, but never less than 10 yards.
  assertEqual(sampleAdvice({ ypp: 3360, scaleStep: 0.01 }).yards, 10);
  assertEqual(sampleAdvice({ ypp: 0, scaleStep: 1 }).yards, null);
});

test('count from yards per pound', () => {
  assertEqual(countFromYpp('cotton', 3360, 2), 8);
  assertEqual(countFromYpp('lea', 1500, 2), 10);
  assertEqual(countFromYpp('nope', 1500, 2), null);
});
