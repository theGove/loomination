import { test, assert, assertEqual, loadFixture } from './harness.js';
import { createDraft } from '../src/core/draft.js';
import { drawdown } from '../src/core/drawdown.js';
import { parseWif, toWif } from '../src/core/wif.js';

const FIXTURES = ['twill-0-999.wif', 'liftplan-only.wif', 'minimal.wif'];

function roundTrip(draft) {
  return parseWif(toWif(draft)).draft;
}

function sampleDraft() {
  const d = createDraft({ shafts: 4, treadles: 4, numEnds: 8, numPicks: 8, palette: [[255, 255, 255], [20, 40, 160], [200, 30, 30]] });
  d.threading = [1, 2, 3, 4, 3, 2, 1, 0];
  [[1, 2], [2, 3], [3, 4], [4, 1]].forEach((list, t) => list.forEach((s) => { d.tieup[s - 1][t] = true; }));
  d.treadling = [[1], [2], [3], [4], [1, 3], [], [2], [4]];
  d.warpColors = [1, 1, 2, 2, 1, 1, 2, 2];
  d.weftColors = [0, 0, 0, 2, 0, 0, 0, 2];
  d.meta = { ...d.meta, title: 'Point twill', notes: 'Line one\nLine two', source: 'Atwater 1928', sourceYear: 1928, page: '42', license: 'public-domain', transcribedBy: 'Loomination' };
  d.display.endNumbering = 'ltr';
  return d;
}

test('WIF round trip: built draft -> export -> import is identical', () => {
  const d = sampleDraft();
  assertEqual(roundTrip(d), d);
});

test('WIF round trip keeps liftplan mode and sinking shed', () => {
  const d = sampleDraft();
  d.mode = 'liftplan';
  d.risingShed = false;
  d.liftplan = d.treadling.map((_, p) => (p % 2 ? [2, 4] : [1, 3]));
  assertEqual(roundTrip(d), d);
});

for (const name of FIXTURES) {
  test(`WIF round trip: ${name} -> import -> export -> import is identical`, async () => {
    const { draft } = parseWif(await loadFixture(name));
    assertEqual(roundTrip(draft), draft);
  });
}

test('WIF import: mixed-case sections, comments and 0-999 color range', async () => {
  const { draft } = parseWif(await loadFixture('twill-0-999.wif'));
  assertEqual(draft.shafts, 4);
  assertEqual(draft.treadles, 6);
  assertEqual(draft.meta.title, '2/2 Twill Sampler');
  assertEqual(draft.palette, [[255, 255, 255], [0, 0, 0], [255, 0, 0]]);
  assertEqual(draft.warpColors, [2, 1, 1, 1, 1, 1, 1, 2], 'per-end colors override the warp default');
  assertEqual(draft.weftColors, new Array(8).fill(0));
  assertEqual(draft.tieup.map((row) => row.map(Number)), [
    [1, 0, 0, 1, 1, 0],
    [1, 1, 0, 0, 0, 1],
    [0, 1, 1, 0, 1, 0],
    [0, 0, 1, 1, 0, 1],
  ]);
});

test('WIF import keeps unknown sections and keys and writes them back out', async () => {
  const { draft } = parseWif(await loadFixture('twill-0-999.wif'));
  const names = draft.extraWifSections.map((s) => s.name);
  assertEqual(names, ['TEXT', 'WARP', 'WARP SPACING']);
  const text = toWif(draft);
  assert(text.includes('Author=Fixture'), 'TEXT Author kept');
  assert(text.includes('Units=Inches'), 'WARP Units kept');
  assert(/\[WARP SPACING\]\r\n1=0\.05\r\n2=0\.05/.test(text), 'WARP SPACING kept');
  assert(text.includes('WARP SPACING=true'), 'listed in CONTENTS');
});

test('WIF import: liftplan-only file with no colors uses defaults', async () => {
  const { draft, warnings } = parseWif(await loadFixture('liftplan-only.wif'));
  assertEqual(warnings, []);
  assertEqual(draft.mode, 'liftplan');
  assertEqual(draft.shafts, 8);
  assertEqual(draft.numPicks, 4);
  assertEqual(draft.liftplan[2], [1, 3, 5, 7]);
  assertEqual(drawdown(draft).warpOnTop[0].map(Number), [1, 1, 1, 1, 0, 0, 0, 0]);
});

test('WIF import: missing WEAVING/WARP/WEFT sections inferred from the data', async () => {
  const { draft, warnings } = parseWif(await loadFixture('minimal.wif'));
  assertEqual([draft.shafts, draft.treadles, draft.numEnds, draft.numPicks], [2, 2, 3, 2]);
  assertEqual(draft.threading, [1, 2, 1]);
  assert(warnings.some((w) => w.includes('End 3')), 'warns about multi-shaft end');
});

test('WIF import: Rising Shed=no gives a sinking-shed draft', () => {
  const text = toWif(sampleDraft()).replace('Rising Shed=true', 'Rising Shed=no');
  assertEqual(parseWif(text).draft.risingShed, false);
});

test('WIF import: real-world files listed in fixtures/real/manifest.json load without errors', async () => {
  const files = JSON.parse(await loadFixture('real/manifest.json'));
  for (const file of files) {
    const { draft } = parseWif(await loadFixture(`real/${file}`));
    assert(draft.numEnds > 0 && draft.numPicks > 0, `${file}: has ends and picks`);
    drawdown(draft);
    assertEqual(roundTrip(draft), draft, `${file}: round trip`);
  }
});
