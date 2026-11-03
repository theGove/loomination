// "Ask your AI": build a prompt a weaver can paste into any chat AI, and read
// the AI's answer back.
//
// The prompt carries the weaver's facts, numbers Loomination has already
// worked out (so the AI doesn't have to do arithmetic), library drafts that
// fit the loom, and a strict JSON answer format. The reply parser is lenient
// about how the JSON is wrapped, strict about what it contains, and every
// recommendation is re-checked with Loomination's own calculator.

import { createDraft, normalizeDraft } from './draft.js';
import { planWarp, DEFAULT_PROJECT } from './warp-calc.js';

// Index row flag bits (see library/README.md).
const STRAIGHT_THREADING = 1;
const POINT_THREADING = 4;

// --- Choosing library drafts to offer ------------------------------------------

// Drafts the loom can weave, spread across books so a short list still shows
// variety. rows are decoded index rows; books is a Map of id -> book.
export function selectCandidates(rows, loom, { limit = 60, maxFloat = 7 } = {}) {
  const fits = rows.filter((d) => d.shafts <= loom.shafts
    && (loom.type !== 'floor' || d.treadles <= loom.treadles)
    && Math.max(d.warpFloat, d.weftFloat) <= maxFloat);
  const byBook = new Map();
  for (const d of [...fits].sort((a, b) => a.book - b.book || a.id.localeCompare(b.id, undefined, { numeric: true }))) {
    if (!byBook.has(d.book)) byBook.set(d.book, []);
    byBook.get(d.book).push(d);
  }
  // Round-robin across books. Within a book, take drafts in a spread-out order
  // (golden-ratio stepping) so a few picks aren't all neighbouring figures.
  const queues = [...byBook.values()].map((list) => spreadOrder(list.length).map((i) => list[i]));
  const out = [];
  for (let round = 0; out.length < limit && queues.some((q) => round < q.length); round++) {
    for (const q of queues) {
      if (round < q.length && out.length < limit) out.push(q[round]);
    }
  }
  return out;
}

function spreadOrder(n) {
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => ((a * 0.618034) % 1) - ((b * 0.618034) % 1));
}

// --- Building the prompt ---------------------------------------------------------

export const SCHEMA_EXAMPLE = {
  recommendations: [
    {
      title: 'Short name for the project',
      draftId: 'hw-12871',
      draft: null,
      warpYarn: 'Y1',
      weftYarn: 'Y2',
      epi: 20,
      ppi: 20,
      warpYards: 2400,
      weftYards: 2100,
      rationale: 'One or two sentences on why this suits the goal and the stash.',
    },
    {
      title: 'A draft you write yourself',
      draftId: null,
      draft: { shafts: 4, threading: [1, 2, 3, 4], tieup: [[1, 2], [2, 3], [3, 4], [4, 1]], treadling: [[1], [2], [3], [4]] },
      warpYarn: 'Y1',
      weftYarn: 'Y1',
      epi: 24,
      ppi: 24,
      warpYards: 2700,
      weftYards: 2500,
      rationale: '...',
    },
  ],
};

const fmt = (n) => Math.round(n).toLocaleString('en-US');

// stash: [{ id: 'Y1', name, color, ypp, yards, plain?, twill? }]
// goal:  { text, finishedWidth, finishedLength, pieces }
// candidates: index rows; books: Map id -> book
export function buildPrompt({ loom, stash, goal, candidates, books = new Map() }) {
  const project = { ...DEFAULT_PROJECT, finishedWidth: goal.finishedWidth, finishedLength: goal.finishedLength, pieces: goal.pieces };
  const lines = [];
  const loomText = loom.type === 'table'
    ? `a ${loom.shafts}-shaft table loom (levers, so any lift plan works)`
    : `a ${loom.shafts}-shaft, ${loom.treadles}-treadle ${loom.shed === 'jack' ? 'jack' : loom.shed} floor loom`;
  lines.push(`I'm a handweaver. I weave on ${loomText}${loom.widthIn ? ` with a ${loom.widthIn}-inch weaving width` : ''}. Please recommend projects I can weave from the yarn I already have.`);
  lines.push('', 'GOAL', goal.text?.trim() || '(no description given)');
  lines.push(`Finished size: ${goal.finishedWidth} x ${goal.finishedLength} inches, ${goal.pieces} piece${goal.pieces === 1 ? '' : 's'}.`);

  lines.push('', 'MY YARN STASH');
  for (const y of stash) {
    lines.push(`${y.id}: ${y.name}${y.color ? `, ${y.color}` : ''}, ${fmt(y.yards)} yards on hand${y.ypp ? ` (${fmt(y.ypp)} yards per pound)` : ''}`);
  }

  const first = planWarp({ project, epi: 20, ppi: 20 });
  lines.push('', 'NUMBERS ALREADY WORKED OUT (by Loomination; use them instead of recalculating)');
  lines.push(`Allowing ${pct(project.drawIn)} draw-in, ${pct(project.shrinkWidth)} width shrinkage, ${pct(project.takeUp)} take-up, ${pct(project.shrinkLength)} length shrinkage, ${project.allowance} in hems or fringe per piece, ${project.sampling} in sampling and ${project.loomWaste} in loom waste:`);
  lines.push(`- Width in the reed: ${first.widthTarget.toFixed(1)} in. Warp length: ${(first.warpLength / 36).toFixed(1)} yards.`);
  for (const y of stash) {
    for (const [label, epi] of [['plain weave', y.plain], ['twill', y.twill]]) {
      if (!epi) continue;
      const p = planWarp({ project, epi, ppi: epi });
      lines.push(`- ${y.id} at ${epi} ends per inch (typical for ${label}): ${fmt(p.ends)} ends; warp ${fmt(p.warp.yards)} yd; weft ${fmt(p.weft.yards)} yd at ${epi} picks per inch.`);
    }
  }
  if (loom.widthIn && first.widthTarget > loom.widthIn) {
    lines.push(`- Note: that width in the reed is more than my loom's ${loom.widthIn} in; suggest a narrower project if needed.`);
  }

  if (candidates.length) {
    lines.push('', `LIBRARY DRAFTS THAT FIT MY LOOM (public-domain drafts from loomination.org; pick one by id, or write your own draft)`);
    lines.push('id | shafts | treadles | repeat (ends x picks) | longest float | threading | source');
    for (const d of candidates) {
      const b = books.get(d.book);
      const kind = d.flags & POINT_THREADING ? 'point' : d.flags & STRAIGHT_THREADING ? 'straight' : 'other';
      const src = b ? `${b.authors ? `${b.authors}, ` : ''}${b.title} (${b.date}) ${d.title}` : d.title;
      lines.push(`${d.id} | ${d.shafts} | ${d.treadles} | ${d.unitEnds}x${d.unitPicks} | ${Math.max(d.warpFloat, d.weftFloat)} | ${kind} | ${src}${d.names ? ` "${d.names}"` : ''}`);
    }
  }

  lines.push('', 'HOW TO ANSWER');
  lines.push('Give up to 3 recommendations. Explain them briefly in plain words, then end your answer with ONE ```json code block in exactly this shape:');
  lines.push('```json', JSON.stringify(SCHEMA_EXAMPLE, null, 2), '```');
  lines.push('Rules for the JSON:');
  lines.push(`- warpYarn and weftYarn must be ids from my stash (${stash.map((y) => y.id).join(', ')}).`);
  lines.push('- Use either "draftId" (a library id above) or "draft" (your own), and set the other to null.');
  lines.push(`- In "draft": threading is one repeat, the shaft (1-${loom.shafts}) of each warp end starting at end 1; tieup lists the shafts tied to each treadle for a rising shed (treadle 1 first); treadling is one repeat, the treadle(s) pressed for each pick.`);
  lines.push('- epi and ppi are ends and picks per inch; warpYards and weftYards are your totals for the whole project.');
  lines.push('- Each yarn\'s total use (warp plus weft) must not exceed what I have. Numbers only; no comments inside the JSON.');
  return lines.join('\n');
}

const pct = (f) => `${Math.round(f * 100)}%`;

// --- Reading the reply -------------------------------------------------------------

// Find the JSON object in a chat reply: the last fenced block that parses, or
// failing that the largest {...} that does. Tolerates smart quotes and
// trailing commas, which chat interfaces and models often introduce.
export function extractJson(text) {
  const tryParse = (s) => {
    const cleaned = s
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(cleaned);
    } catch {
      return undefined;
    }
  };
  const fenced = [...text.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  for (const block of fenced.reverse()) {
    const v = tryParse(block.trim());
    if (v && typeof v === 'object') return v;
  }
  const objects = balancedObjects(text).sort((a, b) => b.length - a.length);
  for (const s of objects) {
    const v = tryParse(s);
    if (v && typeof v === 'object') return v;
  }
  return null;
}

// Top-level {...} spans, skipping braces inside strings.
function balancedObjects(text) {
  const out = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"' || c === '”') inString = false;
      continue;
    }
    if (c === '"' || c === '“') inString = true;
    else if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}' && depth > 0) {
      depth--;
      if (depth === 0) out.push(text.slice(start, i + 1));
    }
  }
  return out;
}

// Parse a reply into recommendations. Returns { recommendations, errors }
// where errors explain anything that couldn't be read at all.
export function parseReply(text) {
  const json = extractJson(text ?? '');
  if (!json) return { recommendations: [], errors: ['No JSON block was found in the reply. Ask the AI to end its answer with the ```json block described in the prompt.'] };
  const list = Array.isArray(json) ? json : json.recommendations;
  if (!Array.isArray(list) || !list.length) return { recommendations: [], errors: ['The JSON has no "recommendations" list.'] };
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
  const recommendations = list.slice(0, 5).map((r, i) => ({
    title: typeof r?.title === 'string' && r.title.trim() ? r.title.trim() : `Recommendation ${i + 1}`,
    draftId: typeof r?.draftId === 'string' && r.draftId.trim() ? r.draftId.trim() : null,
    draft: r?.draft && typeof r.draft === 'object' ? r.draft : null,
    warpYarn: typeof r?.warpYarn === 'string' ? r.warpYarn.trim() : null,
    weftYarn: typeof r?.weftYarn === 'string' ? r.weftYarn.trim() : null,
    epi: num(r?.epi),
    ppi: num(r?.ppi),
    warpYards: num(r?.warpYards),
    weftYards: num(r?.weftYards),
    rationale: typeof r?.rationale === 'string' ? r.rationale.trim() : '',
  }));
  return { recommendations, errors: [] };
}

// Build a draft from the AI's own { shafts, threading, tieup, treadling }
// (one repeat each), tiled to at least `minSize` ends and picks for display.
// Returns { draft, unit, errors }.
export function draftFromAi(spec, { minSize = 32, warpColor = [40, 60, 110], weftColor = [240, 235, 220] } = {}) {
  const errors = [];
  const ints = (a) => Array.isArray(a) && a.every((v) => Number.isInteger(v));
  const lists = (a) => Array.isArray(a) && a.every((v) => Number.isInteger(v) || ints(v));
  const asList = (v) => (Array.isArray(v) ? v : [v]);

  const threading = spec?.threading;
  if (!ints(threading) || !threading.length) errors.push('threading must be a list of shaft numbers.');
  const tieup = spec?.tieup ?? [];
  const treadling = spec?.treadling ?? [];
  const liftplan = spec?.liftplan ?? null;
  if (liftplan ? !lists(liftplan) : (!lists(tieup) || !lists(treadling) || !treadling.length)) {
    errors.push('tieup and treadling must be lists of numbers (or give a liftplan).');
  }
  if (errors.length) return { draft: null, unit: null, errors };

  const shafts = Math.max(Number.isInteger(spec.shafts) ? spec.shafts : 0, ...threading, ...tieup.flat(), ...(liftplan ?? []).flat());
  const picksUnit = liftplan ? liftplan.map(asList) : treadling.map(asList);
  const treadles = liftplan ? 1 : Math.max(tieup.length, ...picksUnit.flat(), 1);
  const endReps = Math.max(1, Math.ceil(minSize / threading.length));
  const pickReps = Math.max(1, Math.ceil(minSize / picksUnit.length));
  const d = createDraft({
    shafts, treadles, numEnds: threading.length * endReps, numPicks: picksUnit.length * pickReps,
    palette: [weftColor, warpColor], mode: liftplan ? 'liftplan' : 'treadle',
  });
  for (let e = 0; e < d.numEnds; e++) d.threading[e] = threading[e % threading.length];
  tieup.forEach((list, t) => asList(list).forEach((s) => { if (s >= 1 && s <= shafts) d.tieup[s - 1][t] = true; }));
  for (let p = 0; p < d.numPicks; p++) d[liftplan ? 'liftplan' : 'treadling'][p] = [...picksUnit[p % picksUnit.length]];
  if (threading.some((s) => s < 0 || s > shafts)) errors.push('Some threading values are not valid shafts.');
  return { draft: normalizeDraft(d), unit: threading.filter((s) => s > 0), errors };
}

// --- Checking a recommendation ---------------------------------------------------

// Re-check one recommendation with Loomination's own numbers.
//   rec      from parseReply
//   draft    the resolved draft (library or draftFromAi), or null
//   threadingUnit  one threading repeat, for rounding ends
// Returns { checks: [{ level: 'ok'|'warn'|'error', text }], plan }.
export function checkRecommendation(rec, { draft, threadingUnit = [], loom, stash, goal }) {
  const checks = [];
  const add = (level, text) => checks.push({ level, text });
  const warp = stash.find((y) => y.id === rec.warpYarn);
  const weft = stash.find((y) => y.id === rec.weftYarn);
  if (!warp) add('error', `Warp yarn "${rec.warpYarn ?? ''}" isn't in your stash.`);
  if (!weft) add('error', `Weft yarn "${rec.weftYarn ?? ''}" isn't in your stash.`);

  if (!draft) {
    add('error', 'No usable draft was given.');
  } else {
    const shaftsUsed = Math.max(0, ...draft.threading);
    if (shaftsUsed > loom.shafts) add('error', `The draft needs ${shaftsUsed} shafts; your loom has ${loom.shafts}.`);
    else add('ok', `Fits your ${loom.shafts} shafts.`);
    if (loom.type === 'floor' && draft.mode !== 'liftplan' && draft.treadles > loom.treadles) {
      add('warn', `The draft uses ${draft.treadles} treadles; you have ${loom.treadles}. Loom setup will look for a tie-up that fits.`);
    }
  }

  if (!rec.epi || rec.epi <= 0) {
    add('error', 'No sett (epi) was given.');
    return { checks, plan: null };
  }
  if (warp?.plain && (rec.epi < warp.plain * 0.75 || rec.epi > warp.twill * 1.25)) {
    add('warn', `${rec.epi} ends per inch is unusual for ${warp.name} (typical: ${warp.plain}-${warp.twill}). Sample first.`);
  }

  const project = { ...DEFAULT_PROJECT, finishedWidth: goal.finishedWidth, finishedLength: goal.finishedLength, pieces: goal.pieces };
  const plan = planWarp({
    project, epi: rec.epi, ppi: rec.ppi || rec.epi, threadingUnit,
    warpColors: [0], weftColors: [0], warpYpp: warp?.ypp ?? 0, weftYpp: weft?.ypp ?? 0,
  });
  if (loom.widthIn && plan.widthInReed > loom.widthIn) {
    add('error', `${plan.widthInReed.toFixed(1)} in wide in the reed; your loom weaves ${loom.widthIn} in.`);
  }
  const compare = (label, theirs, ours) => {
    if (theirs == null) return;
    const off = Math.abs(theirs - ours) / Math.max(ours, 1);
    if (off > 0.15) add('warn', `The AI said ${fmt(theirs)} yd of ${label}; Loomination calculates ${fmt(ours)} yd.`);
    else add('ok', `${label[0].toUpperCase()}${label.slice(1)} yardage agrees (${fmt(ours)} yd).`);
  };
  compare('warp', rec.warpYards, plan.warp.yards);
  compare('weft', rec.weftYards, plan.weft.yards);

  // Stash: the same yarn may be used for warp and weft.
  const need = new Map();
  if (warp) need.set(warp.id, (need.get(warp.id) ?? 0) + plan.warp.yards);
  if (weft) need.set(weft.id, (need.get(weft.id) ?? 0) + plan.weft.yards);
  for (const [id, yards] of need) {
    const y = stash.find((s) => s.id === id);
    if (y.yards < yards) add('error', `Needs ${fmt(yards)} yd of ${id} (${y.name}); you have ${fmt(y.yards)}.`);
    else add('ok', `${id} (${y.name}): needs ${fmt(yards)} of your ${fmt(y.yards)} yd.`);
  }
  return { checks, plan };
}
