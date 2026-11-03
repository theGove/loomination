import { test, assert, assertEqual } from './harness.js';
import { createDraft } from '../src/core/draft.js';
import { drawdown } from '../src/core/drawdown.js';
import {
  setThreading, setTieup, setTreadle, setLift, setWarpColor, resize, copyRange, insert, remove,
  paste, repeat, straightDraw, pointDraw, straightTreadling, pointTreadling, treadleAsDrawnIn,
  setMode, removePaletteColor, addPaletteColor,
} from '../src/core/edits.js';
import { createStore } from '../src/ui/store.js';

const base = () => createDraft({ shafts: 4, treadles: 4, numEnds: 8, numPicks: 6 });

test('edits never mutate their input', () => {
  const d = base();
  const before = JSON.stringify(d);
  setThreading(d, 0, 3);
  setTieup(d, 1, 1, true);
  setTreadle(d, 0, 2, true);
  insert(d, 'ends', 2, 3);
  remove(d, 'picks', { from: 0, to: 1 });
  resize(d, { shafts: 8, numEnds: 20 });
  assertEqual(JSON.stringify(d), before);
});

test('an edit that changes nothing returns the same draft', () => {
  const d = setThreading(base(), 0, 2);
  assert(setThreading(d, 0, 2) === d);
  assert(setTreadle(d, 0, 1, false) === d);
});

test('treadling and liftplan rows stay sorted sets', () => {
  let d = setTreadle(base(), 0, 3, true);
  d = setTreadle(d, 0, 1, true);
  d = setTreadle(d, 0, 3, true);
  assertEqual(d.treadling[0], [1, 3]);
  d = setLift(d, 2, 4, true);
  d = setLift(d, 2, 2, true);
  assertEqual(d.liftplan[2], [2, 4]);
});

test('straight and point draws', () => {
  assertEqual(straightDraw(base(), { from: 0, to: 7 }).threading, [1, 2, 3, 4, 1, 2, 3, 4]);
  assertEqual(pointDraw(base(), { from: 0, to: 7 }).threading, [1, 2, 3, 4, 3, 2, 1, 2]);
  assertEqual(straightDraw(base(), { from: 2, to: 4 }).threading, [0, 0, 1, 2, 3, 0, 0, 0]);
  assertEqual(straightTreadling(base(), { from: 0, to: 5 }).treadling, [[1], [2], [3], [4], [1], [2]]);
  assertEqual(pointTreadling(base(), { from: 0, to: 5 }).treadling, [[1], [2], [3], [4], [3], [2]]);
});

test('treadle as drawn in follows the threading from end 1', () => {
  let d = pointDraw(base(), { from: 0, to: 7 });
  d = treadleAsDrawnIn(d);
  assertEqual(d.treadling.map((t) => t[0]), [1, 2, 3, 4, 3, 2]);
});

test('resize shrinks and grows, extending colors from the last thread', () => {
  let d = setWarpColor(base(), 7, 0);
  d = setThreading(d, 0, 4);
  d = resize(d, { shafts: 3, numEnds: 10 });
  assertEqual(d.threading.length, 10);
  assertEqual(d.threading[0], 0, 'end on a removed shaft becomes unthreaded');
  assertEqual(d.tieup.length, 3);
  assertEqual(d.warpColors.slice(7), [0, 0, 0]);
});

test('insert and remove ends', () => {
  let d = straightDraw(base(), { from: 0, to: 7 });
  d = insert(d, 'ends', 2, 2);
  assertEqual(d.numEnds, 10);
  assertEqual(d.threading, [1, 2, 0, 0, 3, 4, 1, 2, 3, 4]);
  d = remove(d, 'ends', { from: 2, to: 3 });
  assertEqual(d.threading, [1, 2, 3, 4, 1, 2, 3, 4]);
  assertEqual(d.warpColors.length, 8);
});

test('copy and paste picks, growing the draft past its end', () => {
  let d = straightTreadling(base(), { from: 0, to: 5 });
  const clip = copyRange(d, 'picks', { from: 0, to: 2 });
  d = paste(d, clip, 4);
  assertEqual(d.numPicks, 7);
  assertEqual(d.treadling, [[1], [2], [3], [4], [1], [2], [3]]);
  assertEqual(d.liftplan.length, 7);
  assertEqual(d.weftColors.length, 7);
});

test('repeat inserts copies right after the range', () => {
  let d = createDraft({ shafts: 4, treadles: 4, numEnds: 4, numPicks: 1 });
  d = pointDraw(d, { from: 0, to: 2 });
  d = repeat(d, 'ends', { from: 0, to: 2 }, 2);
  assertEqual(d.threading, [1, 2, 3, 1, 2, 3, 1, 2, 3, 0]);
});

test('mode switch keeps the drawdown', () => {
  let d = straightDraw(base(), { from: 0, to: 7 });
  [[1, 2], [2, 3], [3, 4], [4, 1]].forEach((shafts, t) => shafts.forEach((s) => { d = setTieup(d, s, t + 1, true); }));
  d = straightTreadling(d, { from: 0, to: 5 });
  const lp = setMode(d, 'liftplan');
  assertEqual(drawdown(lp), drawdown(d));
  assertEqual(drawdown(setMode(lp, 'treadle')), drawdown(d));
});

test('removing a palette color remaps threads', () => {
  let d = addPaletteColor(base(), [200, 0, 0]); // palette: white, black, red
  d = setWarpColor(d, 0, 2);
  d = removePaletteColor(d, 1, 0); // remove black; black ends become white
  assertEqual(d.palette.length, 2);
  assertEqual(d.warpColors[0], 1, 'red moved down to index 1');
  assertEqual(d.warpColors[1], 0);
});

test('store: undo, redo, and a drag undoes as one step', () => {
  const store = createStore(base());
  store.apply(setThreading, 0, 1);
  store.begin();
  store.apply(setThreading, 1, 2);
  store.apply(setThreading, 2, 3);
  store.end();
  assertEqual(store.get().threading.slice(0, 3), [1, 2, 3]);
  store.undo();
  assertEqual(store.get().threading.slice(0, 3), [1, 0, 0]);
  store.undo();
  assertEqual(store.get().threading.slice(0, 3), [0, 0, 0]);
  assert(!store.canUndo());
  store.redo();
  store.redo();
  assertEqual(store.get().threading.slice(0, 3), [1, 2, 3]);
  store.undo();
  store.apply(setThreading, 5, 4);
  assert(!store.canRedo(), 'a new edit clears redo');
});
