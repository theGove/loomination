import { test, assert, assertEqual } from './harness.js';
import { createDraft } from '../src/core/draft.js';
import { straightDraw, pointDraw, straightTreadling, setTieup, setMode } from '../src/core/edits.js';
import { drawdown } from '../src/core/drawdown.js';
import {
  liftsPerPick, periodOf, repeatUnit, runs, heddleCounts, skeletonTieup, treadlesFor,
  tiesFor, sleyFor, planForLoom,
} from '../src/core/loom.js';

function twill({ ends = 16, picks = 8, risingShed = true } = {}) {
  let d = createDraft({ shafts: 4, treadles: 4, numEnds: ends, numPicks: picks, risingShed });
  d = straightDraw(d, { from: 0, to: ends - 1 });
  [[1, 2], [2, 3], [3, 4], [4, 1]].forEach((shafts, t) => shafts.forEach((s) => { d = setTieup(d, s, t + 1, true); }));
  return straightTreadling(d, { from: 0, to: picks - 1 });
}

const jack = { type: 'floor', shafts: 4, treadles: 6, shed: 'jack', reeds: [12] };

test('repeats: period, unit and leftover', () => {
  assertEqual(periodOf([1, 2, 3, 4, 1, 2, 3, 4, 1]), 4);
  assertEqual(periodOf([1, 2, 3]), 3);
  assertEqual(repeatUnit([1, 2, 1, 2, 1]), { unit: [1, 2], times: 2, extra: 1 });
  assertEqual(repeatUnit([1, 2, 3, 1, 2]).unit, [1, 2, 3, 1, 2], 'a unit longer than half is not a repeat');
  assertEqual(runs([[1], [1], [2], [1]]).map((r) => r.count), [2, 1, 1]);
});

test('sinking-shed drafts lift the other shafts', () => {
  const rising = twill();
  const sinking = twill({ risingShed: false });
  assertEqual(liftsPerPick(rising)[0], [1, 2]);
  assertEqual(liftsPerPick(sinking)[0], [3, 4]);
});

test('heddle counts per shaft', () => {
  const d = pointDraw(createDraft({ shafts: 4, treadles: 4, numEnds: 7, numPicks: 1 }), { from: 0, to: 6 });
  assertEqual(heddleCounts(d), [2, 2, 2, 1]);
});

test('jack loom with enough treadles keeps the draft tie-up', () => {
  const plan = planForLoom(twill(), jack);
  assertEqual(plan.problems, []);
  assertEqual(plan.tieup.method, 'draft');
  assertEqual(plan.tieup.ties[0], { rise: [1, 2] });
  assertEqual(plan.threading.unit, [1, 2, 3, 4]);
  assertEqual(plan.threading.times, 4);
  assertEqual(plan.picks.unit, [[1], [2], [3], [4]]);
});

test('table loom gets lever lifts', () => {
  const plan = planForLoom(twill(), { type: 'table', shafts: 4, reeds: [] });
  assertEqual(plan.picks.kind, 'levers');
  assertEqual(plan.picks.unit, [[1, 2], [2, 3], [3, 4], [1, 4]]);
});

test('counterbalance ties the sinking shafts; countermarch ties both', () => {
  const cb = planForLoom(twill(), { ...jack, shed: 'counterbalance' });
  assertEqual(cb.tieup.ties[0], { sink: [3, 4] });
  const cm = planForLoom(twill(), { ...jack, shed: 'countermarch' });
  assertEqual(cm.tieup.ties[0], { rise: [1, 2], sink: [3, 4] });
  assertEqual(tiesFor([[1]], 4, 'counterbalance'), [{ sink: [2, 3, 4] }]);
});

test('too few shafts is reported', () => {
  const plan = planForLoom(twill(), { ...jack, shafts: 2 });
  assert(plan.problems.some((p) => p.includes('needs 4 shafts')));
  assert(!plan.tieup && !plan.picks, 'no tie-up or picks for a loom that cannot weave it');
});

test('a lift plan is rebuilt into one treadle per shed when it fits', () => {
  const lp = setMode(twill(), 'liftplan');
  const t = treadlesFor(lp, liftsPerPick(lp), 4);
  assertEqual(t.method, 'distinct');
  assertEqual(t.columns, [[1, 2], [2, 3], [3, 4], [1, 4]]);
});

test('skeleton tie-up: six 2-shaft sheds on four treadles', () => {
  const lifts = [[1, 2], [2, 3], [3, 4], [1, 4], [1, 3], [2, 4]];
  const columns = skeletonTieup(lifts, 4);
  assert(columns && columns.length <= 4, `found ${JSON.stringify(columns)}`);
  // Every shed must be one treadle or the union of two.
  for (const l of lifts) {
    const ok = columns.some((c) => c.join() === l.join())
      || columns.some((a, i) => columns.some((b, j) => i < j && [...new Set([...a, ...b])].sort().join() === l.join()
        && a.every((s) => l.includes(s)) && b.every((s) => l.includes(s))));
    assert(ok, `shed ${l} not reachable`);
  }
  assertEqual(skeletonTieup(lifts, 2), null);
});

test('skeleton plan weaves the same cloth', () => {
  // Liftplan with six different sheds; a 4-treadle loom needs two feet.
  let d = createDraft({ shafts: 4, treadles: 1, numEnds: 8, numPicks: 6, mode: 'liftplan' });
  d = straightDraw(d, { from: 0, to: 7 });
  d.liftplan = [[1, 2], [2, 3], [3, 4], [1, 4], [1, 3], [2, 4]];
  const plan = planForLoom(d, { ...jack, treadles: 4 });
  assertEqual(plan.tieup.method, 'skeleton');
  // Rebuild a treadle draft from the plan and compare drawdowns.
  const woven = { ...d, mode: 'treadle', treadles: 4, treadling: [...plan.picks.unit] };
  woven.tieup = [1, 2, 3, 4].map((s) => plan.tieup.columns.map((c) => c.includes(s)));
  assertEqual(drawdown(woven), drawdown(d));
});

test('sley patterns', () => {
  assertEqual(sleyFor(24, [12]), { reed: 12, pattern: [2], perInch: 24 });
  assertEqual(sleyFor(15, [10]), { reed: 10, pattern: [1, 2], perInch: 15 });
  assertEqual(sleyFor(20, [8, 10, 12]).reed, 10, 'prefers an even 2 per dent');
  assertEqual(sleyFor(18, [12]).pattern, [1, 2]);
  assertEqual(sleyFor(100, [8]), null);
});
