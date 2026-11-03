import { test, assert, assertEqual } from './harness.js';
import { createDraft, normalizeDraft, shaftsForPick, toLiftplan, toTreadling } from '../src/core/draft.js';
import { drawdown, floatLengths } from '../src/core/drawdown.js';

// Build a treadle-mode draft from compact descriptions.
// tieup is a list of shaft lists, one per treadle.
function make({ shafts, threading, tieup, treadling, risingShed = true }) {
  const d = createDraft({ shafts, treadles: tieup.length, numEnds: threading.length, numPicks: treadling.length, risingShed });
  d.threading = [...threading];
  tieup.forEach((list, t) => list.forEach((s) => { d.tieup[s - 1][t] = true; }));
  d.treadling = treadling.map((t) => (Array.isArray(t) ? t : [t]));
  return d;
}

const straight = (shafts, ends) => Array.from({ length: ends }, (_, i) => (i % shafts) + 1);
const grid = (dd) => dd.warpOnTop.map((row) => row.map((up) => (up ? 'X' : '.')).join(''));

const plainWeave = () => make({ shafts: 2, threading: straight(2, 6), tieup: [[1], [2]], treadling: [1, 2, 1, 2] });
const twill22 = () => make({
  shafts: 4,
  threading: straight(4, 8),
  tieup: [[1, 2], [2, 3], [3, 4], [4, 1]],
  treadling: [1, 2, 3, 4, 1, 2, 3, 4],
});

test('createDraft sizes every array to the counts', () => {
  const d = createDraft({ shafts: 8, treadles: 10, numEnds: 5, numPicks: 3 });
  assertEqual(d.threading.length, 5);
  assertEqual(d.tieup.length, 8);
  assertEqual(d.tieup[0].length, 10);
  assertEqual(d.treadling.length, 3);
  assertEqual(d.liftplan.length, 3);
  assertEqual(d.warpColors.length, 5);
  assertEqual(d.weftColors.length, 3);
  assert(JSON.parse(JSON.stringify(d)), 'draft is JSON-serializable');
});

test('normalizeDraft clamps out-of-range values and sorts sets', () => {
  const d = normalizeDraft({
    shafts: 4, treadles: 2, numEnds: 3, numPicks: 2,
    threading: [1, 9, 4, 2], // 9 is out of range, extra entry dropped
    treadling: [[2, 1, 2, 5], []],
    warpColors: [0, 7],
  });
  assertEqual(d.threading, [1, 0, 4]);
  assertEqual(d.treadling, [[1, 2], []]);
  assertEqual(d.warpColors, [0, 0, 0]);
  assertEqual(d.tieup.length, 4);
});

test('2 shafts, plain weave tie-up -> checkerboard', () => {
  assertEqual(grid(drawdown(plainWeave())), ['X.X.X.', '.X.X.X', 'X.X.X.', '.X.X.X']);
});

test('4 shafts, 2/2 twill -> diagonal stepping one end per pick', () => {
  const rows = grid(drawdown(twill22()));
  assertEqual(rows[0], 'XX..XX..');
  for (let p = 1; p < rows.length; p++) {
    // Each pick is the previous one shifted one end to the right.
    const prev = rows[p - 1];
    assertEqual(rows[p], prev[prev.length - 1] + prev.slice(0, -1), `pick ${p + 1}`);
  }
});

test('sinking shed is the exact inverse of rising shed', () => {
  for (const build of [plainWeave, twill22]) {
    const rising = drawdown(build()).warpOnTop;
    const sinking = drawdown({ ...build(), risingShed: false }).warpOnTop;
    assertEqual(sinking, rising.map((row) => row.map((up) => !up)));
  }
});

test('unthreaded ends show weft on both shed types', () => {
  const d = twill22();
  d.threading[2] = 0;
  for (const risingShed of [true, false]) {
    const dd = drawdown({ ...d, risingShed });
    assert(dd.warpOnTop.every((row) => row[2] === false), `risingShed=${risingShed}`);
  }
});

test('multiple treadles per pick lift the union of their shafts', () => {
  const d = make({ shafts: 4, threading: straight(4, 4), tieup: [[1], [2], [3], [4]], treadling: [[1, 3]] });
  assertEqual(shaftsForPick(d, 0), [1, 3]);
  assertEqual(grid(drawdown(d)), ['X.X.']);
});

test('liftplan mode gives the same cloth as the equivalent treadling', () => {
  const d = twill22();
  const lp = toLiftplan(d);
  assertEqual(lp.mode, 'liftplan');
  assertEqual(lp.liftplan[0], [1, 2]);
  assertEqual(drawdown(lp), drawdown(d));
});

test('liftplan -> treadling builds one treadle per distinct lift', () => {
  const d = toLiftplan(twill22());
  d.liftplan[7] = [1, 3]; // a lift not in the twill tie-up
  const t = toTreadling(d);
  assertEqual(t.mode, 'treadle');
  assertEqual(t.treadles, 5);
  assertEqual(t.treadling.map((r) => r[0]), [1, 2, 3, 4, 1, 2, 3, 5]);
  assertEqual(drawdown(t), drawdown(d));
});

test('floatLengths measures warp and weft runs', () => {
  const d = make({ shafts: 4, threading: straight(4, 4), tieup: [[1, 2, 3]], treadling: [1, 1, 1] });
  const f = floatLengths(drawdown(d));
  assertEqual(f.warp[0], [3, 3, 3, 0]);
  assertEqual(f.weft[0], [0, 0, 0, 1]);
});
