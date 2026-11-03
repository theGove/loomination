import { test, assert, assertEqual } from './harness.js';
import { drawdown } from '../src/core/drawdown.js';
import { buildPrompt, selectCandidates, extractJson, parseReply, draftFromAi, checkRecommendation, SCHEMA_EXAMPLE } from '../src/core/ai-prompt.js';
import { planWarp, DEFAULT_PROJECT } from '../src/core/warp-calc.js';

const loom = { type: 'floor', shafts: 4, treadles: 6, shed: 'jack', reeds: [12], widthIn: 24 };
const stash = [
  { id: 'Y1', name: '8/2 cotton', color: 'natural', ypp: 3360, yards: 6000, plain: 20, twill: 24 },
  { id: 'Y2', name: '8/2 cotton', color: 'navy', ypp: 3360, yards: 1000, plain: 20, twill: 24 },
];
const goal = { text: 'Kitchen towels', finishedWidth: 18, finishedLength: 28, pieces: 4 };
const row = (id, book, shafts, treadles, float = 2, flags = 1) => ({
  id, book, title: `Figure ${id}`, names: '', shafts, treadles, ends: 32, picks: 32, unitEnds: 4, unitPicks: 4, warpFloat: float, weftFloat: float, colors: 2, flags,
});

test('candidates fit the loom and spread across books', () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => row(`a${i}`, 1, 4, 4)),
    ...Array.from({ length: 3 }, (_, i) => row(`b${i}`, 2, 4, 6)),
    row('big', 3, 8, 8), row('treadles', 3, 4, 10), row('floaty', 3, 4, 4, 12),
  ];
  const picked = selectCandidates(rows, loom, { limit: 8 });
  assertEqual(picked.length, 8);
  assertEqual(new Set(picked.map((d) => d.id)).size, 8, 'no duplicates');
  assertEqual(picked.filter((d) => d.book === 2).length, 3, 'the small book is fully represented');
  assert(!picked.some((d) => ['big', 'treadles', 'floaty'].includes(d.id)), 'drafts that do not fit are left out');
  // A table loom ignores treadle counts.
  assert(selectCandidates(rows, { ...loom, type: 'table' }, { limit: 100 }).some((d) => d.id === 'treadles'));
});

test('prompt carries the facts, our numbers, the drafts and the schema', () => {
  const prompt = buildPrompt({ loom, stash, goal, candidates: [row('hw-1', 1, 4, 4)], books: new Map([[1, { title: 'Book', authors: 'Atwater', date: '1928' }]]) });
  assert(prompt.includes('4-shaft, 6-treadle jack floor loom'));
  assert(prompt.includes('Y2: 8/2 cotton, navy, 1,000 yards on hand'));
  const p = planWarp({ project: { ...DEFAULT_PROJECT, finishedWidth: 18, finishedLength: 28, pieces: 4 }, epi: 24, ppi: 24 });
  assert(prompt.includes(`Y1 at 24 ends per inch (typical for twill): ${p.ends} ends`), 'pre-computed numbers match the calculator');
  assert(prompt.includes('hw-1 | 4 | 4 | 4x4 | 2 | straight | Atwater, Book (1928) Figure hw-1'));
  assert(prompt.includes('"recommendations"'));
  assert(prompt.includes('ids from my stash (Y1, Y2)'));
});

test('JSON is found in fenced blocks, bare text, and with chat-style damage', () => {
  assertEqual(extractJson('Here you go:\n```json\n{"a": 1}\n```\nEnjoy!'), { a: 1 });
  assertEqual(extractJson('First {not json} then {"b": [1, 2,],}'), { b: [1, 2] });
  assertEqual(extractJson('```\n{“title”: “Towels”}\n```'), { title: 'Towels' });
  assertEqual(extractJson('Example: ```json {"x":1} ``` final: ```json {"y":2} ```'), { y: 2 }, 'the last block wins');
  assertEqual(extractJson('{"s": "a } inside a string"}'), { s: 'a } inside a string' });
  assertEqual(extractJson('no json here'), null);
});

test('parseReply reads recommendations and tolerates numbers as strings', () => {
  const reply = `Some prose.\n\`\`\`json\n${JSON.stringify({ recommendations: [{ title: 'Towels', draftId: 'hw-1', warpYarn: 'Y1', weftYarn: 'Y1', epi: '24', ppi: 24, warpYards: 2800 }] })}\n\`\`\``;
  const { recommendations, errors } = parseReply(reply);
  assertEqual(errors, []);
  assertEqual(recommendations[0].epi, 24);
  assertEqual(recommendations[0].draft, null);
  assert(parseReply('Sorry, I cannot help').errors[0].includes('No JSON'));
  assert(parseReply('```json\n{"foo": 1}\n```').errors[0].includes('recommendations'));
});

test('the schema example itself parses', () => {
  const { recommendations } = parseReply(`\`\`\`json\n${JSON.stringify(SCHEMA_EXAMPLE)}\n\`\`\``);
  assertEqual(recommendations.length, 2);
  const { draft, errors } = draftFromAi(recommendations[1].draft);
  assertEqual(errors, []);
  assertEqual(draft.numEnds, 32);
  // 2/2 twill: each pick steps one end.
  const dd = drawdown(draft);
  assertEqual(dd.warpOnTop[1].slice(1, 5), dd.warpOnTop[0].slice(0, 4));
});

test('draftFromAi accepts single numbers for treadling and rejects junk', () => {
  const { draft, errors } = draftFromAi({ threading: [1, 2], tieup: [[1], [2]], treadling: [1, 2] });
  assertEqual(errors, []);
  assertEqual(draft.treadling[0], [1]);
  assert(draftFromAi({ threading: 'abc' }).errors.length > 0);
  const lp = draftFromAi({ threading: [1, 2, 3], liftplan: [[1], [2, 3]] });
  assertEqual(lp.draft.mode, 'liftplan');
});

test('checks flag wrong yardage, short stash, too many shafts and too wide', () => {
  const { draft } = draftFromAi(SCHEMA_EXAMPLE.recommendations[1].draft);
  const base = { draftId: null, warpYarn: 'Y1', weftYarn: 'Y2', epi: 24, ppi: 24 };
  const r1 = checkRecommendation({ ...base, warpYards: 500 }, { draft, threadingUnit: [1, 2, 3, 4], loom, stash, goal });
  assert(r1.checks.some((c) => c.level === 'warn' && c.text.includes('The AI said 500 yd of warp')));
  assert(r1.checks.some((c) => c.level === 'error' && c.text.includes('of Y2')), 'navy weft is short');
  assert(r1.checks.some((c) => c.level === 'ok' && c.text.startsWith('Fits your 4 shafts')));

  // 4,000 yd of Y1 covers the warp (about 2,760) but not warp plus weft (about 5,380).
  const smaller = [{ ...stash[0], yards: 4000 }, stash[1]];
  const r2 = checkRecommendation({ ...base, weftYarn: 'Y1', warpYards: r1.plan.warp.yards }, { draft, threadingUnit: [1, 2, 3, 4], loom: { ...loom, shafts: 2 }, stash: smaller, goal });
  assert(r2.checks.some((c) => c.level === 'error' && c.text.includes('needs 4 shafts')));
  assert(r2.checks.some((c) => c.level === 'ok' && c.text.startsWith('Warp yardage agrees')));
  assert(r2.checks.some((c) => c.level === 'error' && c.text.includes('Needs') && c.text.includes('of Y1')), 'warp plus weft from one yarn is counted together');

  const r3 = checkRecommendation({ ...base, warpYarn: 'Y9' }, { draft, loom: { ...loom, widthIn: 12 }, stash, goal });
  assert(r3.checks.some((c) => c.text.includes('"Y9" isn\'t in your stash')));
  assert(r3.checks.some((c) => c.text.includes('your loom weaves 12 in')));
});
