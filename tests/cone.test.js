import { test, assert, assertEqual } from './harness.js';
import { coreArea, coreWeight, yarnOnCore, GRAMS_PER_POUND } from '../src/core/cone.js';

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
