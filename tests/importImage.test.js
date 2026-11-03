import { test, assert, assertEqual } from './harness.js';
import { createDraft } from '../src/core/draft.js';
import { drawdownColors } from '../src/core/drawdown.js';
import { renderDrawdown, columnToEnd } from '../src/core/render.js';
import { importFromImage } from '../src/importImage/index.js';
import { solveColors } from '../src/importImage/solveColors.js';
import { resolveUnknowns } from '../src/importImage/resolveUnknowns.js';
import { colorDistance } from '../src/importImage/color.js';

const DARK = [30, 40, 90];
const LIGHT = [240, 230, 200];
const RED = [200, 40, 40];

function build({ shafts, threading, tieup, treadling, warpColors, weftColors, palette }) {
  const d = createDraft({ shafts, treadles: tieup.length, numEnds: threading.length, numPicks: treadling.length, palette });
  d.threading = threading;
  tieup.forEach((list, t) => list.forEach((s) => { d.tieup[s - 1][t] = true; }));
  d.treadling = treadling.map((t) => [t]);
  d.warpColors = warpColors;
  d.weftColors = weftColors;
  return d;
}

const repeat = (seq, n) => Array.from({ length: n }, (_, i) => seq[i % seq.length]);

const DRAFTS = {
  // 2-shaft color-and-weave: plain weave with alternating dark/light blocks.
  'log cabin (2 shafts)': () => {
    const order = repeat([0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0], 24);
    return build({
      shafts: 2, threading: repeat([1, 2], 24), tieup: [[1], [2]], treadling: repeat([1, 2], 24),
      warpColors: order, weftColors: order, palette: [DARK, LIGHT],
    });
  },
  // 4-shaft color-and-weave: 2/2 twill, 4 dark 4 light both ways.
  'houndstooth (4 shafts)': () => {
    const order = repeat([0, 0, 0, 0, 1, 1, 1, 1], 24);
    return build({
      shafts: 4, threading: repeat([1, 2, 3, 4], 24), tieup: [[1, 2], [2, 3], [3, 4], [4, 1]],
      treadling: repeat([1, 2, 3, 4], 24), warpColors: order, weftColors: order, palette: [DARK, LIGHT],
    });
  },
  // 8-shaft point twill with three-color stripes.
  'point twill (8 shafts)': () => {
    const point = [1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2];
    const tieup = Array.from({ length: 8 }, (_, t) => [0, 1, 2, 4].map((k) => ((t + k) % 8) + 1));
    return build({
      shafts: 8, threading: repeat(point, 28), tieup, treadling: repeat(point, 28),
      warpColors: repeat([0, 0, 0, 1, 1, 2], 28), weftColors: repeat([1, 1, 1, 1, 0, 0], 28),
      palette: [DARK, LIGHT, RED],
    });
  },
};

// Deterministic noise standing in for mild JPEG artifacts.
function addNoise(img, amp) {
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const data = new Uint8ClampedArray(img.data);
  for (let i = 0; i < data.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) data[i + ch] += Math.round((rand() * 2 - 1) * amp);
  }
  return { ...img, data };
}

// Face-of-cloth colors in screen order (left to right), for comparing drafts
// whose end numbering or shaft numbering differs.
function screenColors(draft) {
  const colors = drawdownColors(draft);
  return colors.map((row) => row.map((_, col) => row[columnToEnd(draft, col)]));
}

for (const [name, make] of Object.entries(DRAFTS)) {
  for (const cellSize of [4, 5, 7.5, 10]) {
    for (const gridLine of [0, 1]) {
      for (const noise of [0, 6]) {
        test(`image import: ${name}, cell ${cellSize}px, grid line ${gridLine}, noise ${noise}`, () => {
          const original = make();
          let img = renderDrawdown(original, { cellSize, gridLine });
          if (noise) img = addNoise(img, noise);
          const { draft, report } = importFromImage(img);
          assertEqual([report.ends, report.picks], [original.numEnds, original.numPicks], 'grid counts');
          assertEqual(report.mismatches, 0, 'derived draft reproduces the image');
          assert(report.shafts <= original.shafts, `shafts ${report.shafts} <= ${original.shafts}`);
          const want = screenColors(original);
          const got = screenColors(draft);
          want.forEach((row, p) => row.forEach((c, col) => {
            assert(colorDistance(c, got[p][col]) < 40, `cell ${p},${col} color`);
          }));
        });
      }
    }
  }
}

test('image import: an all-one-color image gives a valid draft', () => {
  const img = { width: 40, height: 30, data: new Uint8ClampedArray(40 * 30 * 4).fill(200) };
  const { draft, report } = importFromImage(img);
  assert(draft.numEnds >= 1 && draft.numPicks >= 1, 'has at least one cell');
  assertEqual(report.mismatches, 0);
  assertEqual(draft.shafts, 1);
});

test('solveColors: exact solution recovers warp and weft colors', () => {
  // warp: 0 1 0, weft: 2 3; warp-up cells marked by which color shows.
  const grid = [[0, 2, 0], [3, 1, 3]];
  const s = solveColors(grid);
  assert(s.exact, 'exact');
  assertEqual(s.violations, []);
  grid.forEach((row, r) => row.forEach((c, col) => assert(c === s.warp[col] || c === s.weft[r], `cell ${r},${col}`)));
});

test('solveColors: a misread cell falls back to fewest violations', () => {
  const grid = [[0, 1, 0, 1], [1, 0, 1, 0], [0, 1, 0, 1], [1, 0, 2, 0]];
  const s = solveColors(grid);
  assert(!s.exact, 'not exact');
  assertEqual(s.violations, [[3, 2]]);
});

test('resolveUnknowns: fills from the repeat', () => {
  const U = -1;
  const { up } = resolveUnknowns([
    [1, 0, U, 0],
    [0, 1, 0, U],
  ]);
  assertEqual(up, [[1, 0, 1, 0], [0, 1, 0, 1]]);
});
