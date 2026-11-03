// "Ask your AI": the weaver describes a goal and their yarn stash, copies a
// prompt into whatever chat AI they use, pastes the answer back, and sees
// each recommendation checked against their loom, their stash and
// Loomination's own warp arithmetic. No AI is called from here.

import { parseWif } from '../core/wif.js';
import { buildPrompt, selectCandidates, parseReply, draftFromAi, checkRecommendation } from '../core/ai-prompt.js';
import { repeatUnit } from '../core/loom.js';
import { cloneDraft } from '../core/draft.js';
import { yarnsByFiber, yarnById } from '../core/yarns.js';
import { createLibrary } from './library-data.js';
import { loadLoom } from './loom-profile.js';
import { setImport } from './saved-drafts.js';
import { paintThumbnail } from './draft-view.js';
import { escapeHtml } from './html.js';

const KEY = 'loomination.ai';
const DEFAULTS = {
  goal: { text: '', finishedWidth: 18, finishedLength: 28, pieces: 4 },
  stash: [
    { yarn: 'cotton-8-2', name: '', ypp: 0, color: 'natural', hex: '#f1ead8', yards: 4000 },
    { yarn: 'cotton-8-2', name: '', ypp: 0, color: 'navy', hex: '#24365e', yards: 2000 },
  ],
  maxDrafts: 40,
  reply: '',
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...saved, goal: { ...DEFAULTS.goal, ...saved.goal } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Not remembered; fine for this visit.
  }
}

// Add a yarn to the saved stash from another page (the cone estimator).
export function addToStash(entry) {
  const state = load();
  state.stash.push({ yarn: 'custom', name: '', ypp: 0, color: '', hex: '#888888', yards: 0, ...entry });
  save(state);
  return state.stash.length;
}

export function mountAiHelper(root, { libraryBase, designerUrl, loomUrl, warpUrl, coneUrl }) {
  const state = load();
  const loom = loadLoom();
  const lib = createLibrary(libraryBase);
  let candidates = [];
  let books = new Map();

  root.classList.add('ldm', 'ldm-ai');
  root.innerHTML = `
    <section class="ldm-step">
      <h2><span>1</span> Your loom</h2>
      <p>${escapeHtml(loomSummary(loom))} ${loomUrl ? `<a href="${loomUrl}">Change on the Loom setup page</a>` : ''}</p>
    </section>
    <section class="ldm-step">
      <h2><span>2</span> What do you want to make?</h2>
      <label class="ldm-field">Describe it <textarea name="text" rows="3" placeholder="e.g. Four kitchen towels, something with a bit of texture, nothing too fussy for a beginner"></textarea></label>
      <div class="ldm-sizes ldm-goal-size">
        <label>Finished width, in <input type="number" name="finishedWidth" min="1" max="200" step="0.5"></label>
        <label>Finished length, in <input type="number" name="finishedLength" min="1" max="2000" step="0.5"></label>
        <label>Pieces <input type="number" name="pieces" min="1" max="100"></label>
      </div>
    </section>
    <section class="ldm-step">
      <h2><span>3</span> Your yarn</h2>
      <div class="ldm-scroll"><table class="ldm-table ldm-stash">
        <thead><tr><th>Id</th><th>Yarn</th><th>Color</th><th></th><th>Yards</th><th></th></tr></thead>
        <tbody></tbody>
      </table></div>
      <button type="button" data-act="add-yarn">Add yarn</button>
      ${coneUrl ? `<p class="ldm-hint">Don't know how many yards are left? <a href="${coneUrl}">Estimate from the cone's weight</a>.</p>` : ''}
    </section>
    <section class="ldm-step">
      <h2><span>4</span> Ask your AI</h2>
      <p>Copy this prompt into ChatGPT, Claude, Gemini or any chat AI. Loomination doesn't send it anywhere.</p>
      <div class="ldm-row">
        <button type="button" class="ldm-primary" data-act="copy">Copy prompt</button>
        <label class="ldm-inline">Library drafts to include <select name="maxDrafts">
          <option value="0">None</option><option value="20">20</option><option value="40">40</option><option value="80">80</option>
        </select></label>
        <span class="ldm-copied" aria-live="polite"></span>
      </div>
      <details><summary>Show the prompt</summary><textarea class="ldm-prompt" rows="14" readonly></textarea></details>
    </section>
    <section class="ldm-step">
      <h2><span>5</span> Paste the AI's answer</h2>
      <textarea class="ldm-reply" rows="8" placeholder="Paste the whole reply here, including the json block at the end."></textarea>
      <div class="ldm-row"><button type="button" class="ldm-primary" data-act="check">Check the answer</button></div>
      <div class="ldm-results" aria-live="polite"></div>
    </section>`;

  const $ = (sel) => root.querySelector(sel);
  const promptBox = $('.ldm-prompt');
  const replyBox = $('.ldm-reply');
  const results = $('.ldm-results');

  for (const name of ['text', 'finishedWidth', 'finishedLength', 'pieces']) root.querySelector(`[name=${name}]`).value = state.goal[name];
  $('[name=maxDrafts]').value = String(state.maxDrafts);
  replyBox.value = state.reply;
  renderStash();

  // --- Stash table ---------------------------------------------------------

  function renderStash() {
    const options = (sel) => `${yarnsByFiber().map((g) => `<optgroup label="${escapeHtml(g.fiber)}">${g.yarns.map((y) => `<option value="${y.id}"${y.id === sel ? ' selected' : ''}>${escapeHtml(y.name)}</option>`).join('')}</optgroup>`).join('')}<option value="custom"${sel === 'custom' ? ' selected' : ''}>Other…</option>`;
    $('.ldm-stash tbody').innerHTML = state.stash.map((y, i) => `
      <tr data-row="${i}">
        <th scope="row">Y${i + 1}</th>
        <td><select data-k="yarn" aria-label="Yarn Y${i + 1}">${options(y.yarn)}</select>
          <span ${y.yarn === 'custom' ? '' : 'hidden'}><input type="text" data-k="name" value="${escapeHtml(y.name)}" placeholder="Yarn" aria-label="Yarn name"> <input type="number" data-k="ypp" value="${y.ypp || ''}" placeholder="yd/lb" aria-label="Yards per pound" min="1"></span></td>
        <td><input type="text" data-k="color" value="${escapeHtml(y.color)}" aria-label="Color name Y${i + 1}" size="10"></td>
        <td><input type="color" data-k="hex" value="${y.hex}" aria-label="Color swatch Y${i + 1}"></td>
        <td><input type="number" data-k="yards" value="${y.yards}" min="0" step="50" aria-label="Yards of Y${i + 1}"></td>
        <td><button type="button" data-act="remove-yarn" aria-label="Remove Y${i + 1}">Remove</button></td>
      </tr>`).join('');
  }

  // Stash entries as the prompt and checks see them.
  const stashForAi = () => state.stash.map((y, i) => {
    const known = yarnById(y.yarn);
    return {
      id: `Y${i + 1}`,
      name: known ? known.name : y.name || 'yarn',
      color: y.color,
      hex: y.hex,
      ypp: known ? known.ypp : y.ypp,
      yards: y.yards,
      plain: known?.plain ?? 0,
      twill: known?.twill ?? 0,
    };
  });

  root.addEventListener('input', (e) => {
    const el = e.target;
    const row = el.closest('[data-row]');
    if (row && el.dataset.k) {
      const y = state.stash[Number(row.dataset.row)];
      y[el.dataset.k] = el.type === 'number' ? Math.max(0, Number(el.value) || 0) : el.value;
      if (el.dataset.k === 'yarn') renderStash();
    } else if (el.name in state.goal) {
      state.goal[el.name] = el.name === 'text' ? el.value : Math.max(1, Number(el.value) || 1);
    } else if (el.name === 'maxDrafts') {
      state.maxDrafts = Number(el.value);
    } else if (el === replyBox) {
      state.reply = el.value;
    }
    save(state);
    if (el !== replyBox) refreshPrompt();
  });

  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'add-yarn') {
      state.stash.push({ yarn: 'cotton-8-2', name: '', ypp: 0, color: '', hex: '#888888', yards: 1000 });
    } else if (act === 'remove-yarn') {
      state.stash.splice(Number(e.target.closest('[data-row]').dataset.row), 1);
    } else if (act === 'copy') {
      await copyPrompt();
      return;
    } else if (act === 'check') {
      checkReply();
      return;
    } else {
      return;
    }
    save(state);
    renderStash();
    refreshPrompt();
  });

  // --- Prompt --------------------------------------------------------------

  const ready = Promise.all([lib.drafts(loom.shafts), lib.books()])
    .then(([rows, bookMap]) => {
      books = bookMap;
      candidates = rows;
    })
    .catch(() => { candidates = []; }) // the prompt still works without library drafts
    .then(refreshPrompt);

  function currentPrompt() {
    const picked = state.maxDrafts ? selectCandidates(candidates, loom, { limit: state.maxDrafts }) : [];
    return buildPrompt({ loom, stash: stashForAi(), goal: state.goal, candidates: picked, books });
  }

  function refreshPrompt() {
    promptBox.value = currentPrompt();
  }

  async function copyPrompt() {
    await ready;
    const text = currentPrompt();
    promptBox.value = text;
    const note = $('.ldm-copied');
    try {
      await navigator.clipboard.writeText(text);
      note.textContent = 'Copied. Paste it into your AI, then paste its answer below.';
    } catch {
      $('details').open = true;
      promptBox.select();
      note.textContent = 'Select-all and copy the prompt below (your browser blocked automatic copying).';
    }
  }

  // --- Checking the reply ------------------------------------------------------

  async function checkReply() {
    await ready;
    const { recommendations, errors } = parseReply(replyBox.value);
    if (errors.length) {
      results.innerHTML = `<p class="ldm-problems">${escapeHtml(errors[0])}</p>`;
      return;
    }
    const stash = stashForAi();
    results.innerHTML = '';
    for (const rec of recommendations) {
      const card = document.createElement('article');
      card.className = 'ldm-rec';
      results.append(card);
      const { draft, unit, source, problem } = await resolveDraft(rec, stash);
      let { checks } = checkRecommendation(rec, { draft, threadingUnit: unit ?? [], loom, stash, goal: state.goal });
      if (problem) {
        // The specific problem replaces the generic "no usable draft" note.
        checks = [{ level: 'error', text: problem }, ...checks.filter((c) => draft || c.text !== 'No usable draft was given.')];
      }
      renderCard(card, rec, draft, source, checks, stash);
    }
  }

  async function resolveDraft(rec, stash) {
    const warp = stash.find((y) => y.id === rec.warpYarn);
    const weft = stash.find((y) => y.id === rec.weftYarn);
    if (rec.draftId) {
      try {
        const draft = parseWif(await lib.wifText(rec.draftId)).draft;
        // Show it in the recommended yarn colors when it is a simple two-color
        // draft, unless warp and weft would be the same color and hide the pattern.
        const recolorable = draft.palette.length === 2 && warp && weft && warp.hex.toLowerCase() !== weft.hex.toLowerCase();
        const colored = recolorable ? recolor(draft, warp.hex, weft.hex) : draft;
        const row = candidates.find((d) => d.id === rec.draftId);
        const book = row && books.get(row.book);
        return {
          draft: colored,
          unit: repeatUnit(draft.threading.filter((s) => s > 0)).unit,
          source: `Library draft ${rec.draftId}${book ? `: ${book.title} (${book.date}), ${row.title}` : ''}`,
        };
      } catch {
        return { draft: null, problem: `Library draft "${rec.draftId}" was not found. The AI may have made up the id.` };
      }
    }
    if (rec.draft) {
      const { draft, unit, errors } = draftFromAi(rec.draft, { warpColor: rgb(warp?.hex), weftColor: rgb(weft?.hex) });
      if (!draft) return { draft: null, problem: `The AI's draft couldn't be read: ${errors.join(' ')}` };
      draft.meta.title = rec.title;
      draft.meta.notes = rec.rationale;
      draft.meta.source = 'Suggested by an AI through Loomination';
      return { draft, unit, source: 'A draft the AI wrote', problem: errors[0] };
    }
    return { draft: null, problem: 'The recommendation has neither a draftId nor a draft.' };
  }

  function renderCard(card, rec, draft, source, checks, stash) {
    const yarn = (id) => {
      const y = stash.find((s) => s.id === id);
      return y ? `${id}, ${escapeHtml(y.name)}${y.color ? ` ${escapeHtml(y.color)}` : ''}` : escapeHtml(id ?? '?');
    };
    const icon = { ok: '✓', warn: '!', error: '✗' };
    const worst = checks.some((c) => c.level === 'error') ? 'error' : checks.some((c) => c.level === 'warn') ? 'warn' : 'ok';
    card.innerHTML = `
      <div class="ldm-rec-thumb">${draft ? '<canvas role="img" aria-label="Drawdown"></canvas>' : ''}</div>
      <div class="ldm-rec-body">
        <h3>${escapeHtml(rec.title)} <span class="ldm-verdict ldm-${worst}">${{ ok: 'Checks out', warn: 'Check the notes', error: 'Has problems' }[worst]}</span></h3>
        <p class="ldm-hint">${escapeHtml(source ?? '')}</p>
        ${rec.rationale ? `<p>${escapeHtml(rec.rationale)}</p>` : ''}
        <p>Warp ${yarn(rec.warpYarn)} · Weft ${yarn(rec.weftYarn)} · ${rec.epi ?? '?'} ends and ${rec.ppi ?? rec.epi ?? '?'} picks per inch</p>
        <ul class="ldm-checks">${checks.map((c) => `<li class="ldm-${c.level}"><span aria-hidden="true">${icon[c.level]}</span> ${escapeHtml(c.text)}</li>`).join('')}</ul>
        <div class="ldm-row">
          ${draft && designerUrl ? '<button type="button" data-open>Open in designer</button>' : ''}
          ${rec.draftId && draft && loomUrl ? `<a class="ldm-button" href="${loomUrl}#library=${encodeURIComponent(rec.draftId)}">Loom setup</a>` : ''}
          ${rec.draftId && draft && warpUrl ? `<a class="ldm-button" href="${warpUrl}#library=${encodeURIComponent(rec.draftId)}">Plan the warp</a>` : ''}
        </div>
      </div>`;
    if (draft) paintThumbnail(card.querySelector('canvas'), draft, 140);
    card.querySelector('[data-open]')?.addEventListener('click', () => {
      const d = cloneDraft(draft);
      if (!d.meta.title) d.meta.title = rec.title;
      setImport(d);
      location.href = `${designerUrl}#import=1`;
    });
  }
}

function loomSummary(loom) {
  const width = loom.widthIn ? `, ${loom.widthIn} in weaving width` : '';
  if (loom.type === 'table') return `${loom.shafts}-shaft table loom${width}.`;
  return `${loom.shafts}-shaft, ${loom.treadles}-treadle ${loom.shed} floor loom${width}.`;
}

function recolor(draft, warpHex, weftHex) {
  const d = cloneDraft(draft);
  // Two-color drafts: the warp color is the one most ends use.
  const warpIndex = d.warpColors.filter((c) => c === 1).length >= d.warpColors.length / 2 ? 1 : 0;
  d.palette[warpIndex] = rgb(warpHex);
  d.palette[1 - warpIndex] = rgb(weftHex);
  return d;
}

const rgb = (hex) => (/^#[0-9a-f]{6}$/i.test(hex ?? '') ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : [128, 128, 128]);
