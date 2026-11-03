import { test, assertEqual } from './harness.js';
import { decodeShard, draftPath, shardsFor, filterDrafts, filterToParams, filterFromParams, DEFAULT_FILTER, FLAGS } from '../src/ui/library-data.js';
import { createDraft } from '../src/core/draft.js';
import { layoutDraft, hitTest } from '../src/ui/draft-view.js';

const fields = ['id', 'book', 'title', 'names', 'shafts', 'treadles', 'ends', 'picks', 'unitEnds', 'unitPicks', 'warpFloat', 'weftFloat', 'colors', 'flags'];
const rows = [
  ['hw-10', 1, 'Figure 10', '', 4, 4, 32, 32, 4, 4, 3, 3, 2, FLAGS.straightThreading],
  ['hw-2', 1, 'Figure 2', 'Rosepath', 4, 6, 32, 32, 8, 8, 3, 5, 2, FLAGS.pointThreading],
  ['hw-305', 2, 'Plate 1', '', 2, 2, 16, 16, 2, 2, 1, 1, 2, FLAGS.straightThreading],
  ['hw-7', 2, 'Plate 2', 'Whig Rose', 8, 10, 64, 64, 32, 32, 7, 7, 3, FLAGS.blockDraft],
];
const drafts = decodeShard({ fields, rows });
const books = new Map([
  [1, { id: 1, title: 'Shuttle-Craft Book', authors: 'Atwater', year: 1928 }],
  [2, { id: 2, title: 'Domestic Manufacturer', authors: 'Bronson', year: 1817 }],
]);
const ids = (list) => list.map((d) => d.id);

test('decodeShard turns compact rows into objects', () => {
  assertEqual(drafts[1].names, 'Rosepath');
  assertEqual(drafts[1].treadles, 6);
});

test('draftPath uses the last two digits of the number', () => {
  assertEqual(draftPath('hw-12871'), 'drafts/71/hw-12871.wif');
  assertEqual(draftPath('hw-7'), 'drafts/07/hw-7.wif');
});

test('shardsFor keeps only shards a loom can weave', () => {
  const summary = { shards: { '02': 5, '04': 9, '08': 3, '16': 1 } };
  assertEqual(shardsFor(summary, 4), ['02', '04']);
  assertEqual(shardsFor(summary), ['02', '04', '08', '16']);
});

test('default sort is oldest book first, then figures in natural order', () => {
  assertEqual(ids(filterDrafts(drafts, {}, books)), ['hw-305', 'hw-7', 'hw-2', 'hw-10']);
});

test('filters by shafts, treadles, threading and float', () => {
  assertEqual(ids(filterDrafts(drafts, { maxShafts: 4 }, books)), ['hw-305', 'hw-2', 'hw-10']);
  assertEqual(ids(filterDrafts(drafts, { maxShafts: 4, maxTreadles: 4 }, books)), ['hw-305', 'hw-10']);
  assertEqual(ids(filterDrafts(drafts, { threading: 'point' }, books)), ['hw-2']);
  assertEqual(ids(filterDrafts(drafts, { maxFloat: 3 }, books)), ['hw-305', 'hw-10']);
  assertEqual(ids(filterDrafts(drafts, { book: 1 }, books)), ['hw-2', 'hw-10']);
});

test('search matches every word across title, names and book', () => {
  assertEqual(ids(filterDrafts(drafts, { query: 'whig' }, books)), ['hw-7']);
  assertEqual(ids(filterDrafts(drafts, { query: 'atwater figure 2' }, books)), ['hw-2']);
  assertEqual(ids(filterDrafts(drafts, { query: 'bronson plate' }, books)), ['hw-305', 'hw-7']);
});

test('filter round-trips through URL params and omits defaults', () => {
  const f = { ...DEFAULT_FILTER, maxShafts: 4, threading: 'point', query: 'rose path' };
  const params = filterToParams(f);
  assertEqual(params.toString(), 'query=rose+path&maxShafts=4&threading=point');
  assertEqual(filterFromParams(params), f);
  assertEqual(filterFromParams(new URLSearchParams('maxShafts=abc')).maxShafts, 0);
});

test('hitTest maps pixels to ends, shafts, treadles and picks', () => {
  const d = createDraft({ shafts: 4, treadles: 6, numEnds: 10, numPicks: 8 });
  const layout = layoutDraft(d, 10);
  const R = layout.regions;
  // American numbering: end 1 is the rightmost column; shaft 1 the bottom row.
  assertEqual(hitTest(d, layout, R.threading.x + 95, R.threading.y + 35), { region: 'threading', col: 9, row: 3, end: 1, shaft: 1 });
  assertEqual(hitTest(d, layout, R.tieup.x + 5, R.tieup.y + 5), { region: 'tieup', col: 0, row: 0, shaft: 4, treadle: 1 });
  assertEqual(hitTest(d, layout, R.side.x + 25, R.side.y + 5), { region: 'side', col: 2, row: 0, pick: 1, treadle: 3 });
  assertEqual(hitTest(d, layout, R.drawdown.x + 5, R.drawdown.y + 75), { region: 'drawdown', col: 0, row: 7, end: 10, pick: 8 });
  assertEqual(hitTest(d, layout, R.tieup.x + 5, R.drawdown.y + R.drawdown.h + 50), null);
});
