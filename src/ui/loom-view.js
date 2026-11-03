// "Set up my loom": the weaver's loom profile (kept in this browser) and
// printable instructions for weaving one draft on that loom.
//
// The draft comes from the library (loom.html#library=hw-12871) or, by
// default, the draft currently open in the designer.

import { parseWif } from '../core/wif.js';
import { planForLoom, runs, sleyFor } from '../core/loom.js';
import { createLibrary } from './library-data.js';
import { loadCurrent } from './saved-drafts.js';
import { starterDraft } from './editor-view.js';
import { escapeHtml } from './html.js';

const LOOM_KEY = 'loomination.loom';
export const DEFAULT_LOOM = { type: 'floor', shafts: 4, treadles: 6, shed: 'jack', reeds: [8, 10, 12], epi: 0 };

function loadLoom() {
  try {
    return { ...DEFAULT_LOOM, ...JSON.parse(localStorage.getItem(LOOM_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_LOOM };
  }
}

function saveLoom(loom) {
  try {
    localStorage.setItem(LOOM_KEY, JSON.stringify(loom));
  } catch {
    // Not saved; the page still works for this visit.
  }
}

export function mountLoomSetup(root, { libraryBase, designerUrl }) {
  let loom = loadLoom();
  let draft = null;
  let source = '';

  root.classList.add('ldm', 'ldm-loom');
  root.innerHTML = `
    <form class="ldm-loom-form" aria-label="Your loom">
      <h2>Your loom</h2>
      <label class="ldm-field">Kind of loom <select name="type">
        <option value="floor">Floor loom (treadles)</option>
        <option value="table">Table loom (levers)</option>
      </select></label>
      <label class="ldm-field">Shafts <input type="number" name="shafts" min="2" max="40"></label>
      <label class="ldm-field" data-floor>Treadles <input type="number" name="treadles" min="2" max="40"></label>
      <label class="ldm-field" data-floor>Shed <select name="shed">
        <option value="jack">Jack loom (shafts rise)</option>
        <option value="counterbalance">Counterbalance</option>
        <option value="countermarch">Countermarch</option>
      </select></label>
      <label class="ldm-field">Reeds you own (dents per inch) <input type="text" name="reeds" inputmode="decimal" placeholder="8, 10, 12"></label>
      <label class="ldm-field">Sett, ends per inch <input type="number" name="epi" min="0" max="200" step="0.5" placeholder="optional"></label>
      <p class="ldm-hint">Saved in this browser for next time.</p>
    </form>
    <article class="ldm-instructions" aria-live="polite"><p class="ldm-status">Loading…</p></article>`;

  const form = root.querySelector('form');
  const out = root.querySelector('.ldm-instructions');

  const fill = () => {
    form.type.value = loom.type;
    form.shafts.value = loom.shafts;
    form.treadles.value = loom.treadles;
    form.shed.value = loom.shed;
    form.reeds.value = loom.reeds.join(', ');
    form.epi.value = loom.epi || '';
    root.querySelectorAll('[data-floor]').forEach((el) => { el.hidden = loom.type !== 'floor'; });
  };
  fill();

  form.addEventListener('input', () => {
    loom = {
      type: form.type.value,
      shafts: clampInt(form.shafts.value, 2, 40, loom.shafts),
      treadles: clampInt(form.treadles.value, 2, 40, loom.treadles),
      shed: form.shed.value,
      reeds: form.reeds.value.split(/[\s,;]+/).map(Number).filter((n) => n > 0 && n <= 100),
      epi: Math.max(0, Number(form.epi.value) || 0),
    };
    root.querySelectorAll('[data-floor]').forEach((el) => { el.hidden = loom.type !== 'floor'; });
    saveLoom(loom);
    render();
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  const libraryId = new URLSearchParams(location.hash.slice(1)).get('library');
  if (libraryId) {
    createLibrary(libraryBase).wifText(libraryId)
      .then((text) => {
        draft = parseWif(text).draft;
        source = `library draft ${libraryId}`;
        render();
      })
      .catch((err) => { out.innerHTML = `<p>Could not load library draft ${escapeHtml(libraryId)}: ${escapeHtml(err.message)}</p>`; });
  } else {
    draft = loadCurrent() ?? starterDraft();
    source = 'the draft open in the designer';
    render();
  }

  function render() {
    if (!draft) return;
    const plan = planForLoom(draft, loom);
    const title = draft.meta.title || 'Untitled draft';
    const editLink = designerUrl
      ? `<a href="${escapeHtml(libraryId ? `${designerUrl}#library=${encodeURIComponent(libraryId)}` : designerUrl)}">${libraryId ? 'Open in designer' : 'Edit in designer'}</a>`
      : '';
    out.innerHTML = `
      <header class="ldm-instr-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p class="ldm-hint">Instructions for ${escapeHtml(source)} on your ${loomName(loom)}. ${editLink}</p>
        </div>
        <button type="button" data-print>Print</button>
      </header>
      ${plan.problems.length ? `<div class="ldm-problems">${plan.problems.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}</div>` : ''}
      ${plan.notes.length ? `<ul class="ldm-notes-list">${plan.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : ''}
      ${threadingSection(draft, plan)}
      ${sleySection(draft, plan, loom)}
      ${plan.tieup ? tieupSection(plan, loom) : ''}
      ${plan.picks ? picksSection(plan) : ''}`;
    out.querySelector('[data-print]').addEventListener('click', () => window.print());
  }
}

function loomName(loom) {
  if (loom.type === 'table') return `${loom.shafts}-shaft table loom`;
  const shed = { jack: 'jack', counterbalance: 'counterbalance', countermarch: 'countermarch' }[loom.shed];
  return `${loom.shafts}-shaft, ${loom.treadles}-treadle ${shed} loom`;
}

// --- Sections --------------------------------------------------------------

function threadingSection(draft, plan) {
  const { unit, times, extra, total } = plan.threading;
  if (!total) return '<section><h3>Threading</h3><p>The draft has no threaded ends.</p></section>';
  const shafts = plan.shaftsNeeded;
  const from = draft.display.endNumbering === 'ltr' ? 'left' : 'right';
  const grid = unit.length <= 48 ? threadingGrid(unit, shafts, draft.display.endNumbering !== 'ltr') : '';
  return `
    <section>
      <h3>Threading</h3>
      <p>${total} ends, starting with end 1 at the ${from}. Shaft 1 is the shaft nearest you.</p>
      ${grid}
      <p class="ldm-seq">${repeatText(times, extra, unit.length, 'end')}</p>
      <p class="ldm-seq ldm-mono">${groups(unit, 4).map((g) => g.join(' ')).join('  |  ')}</p>
      <h4>Heddles per shaft</h4>
      <table class="ldm-table"><tr><th scope="row">Shaft</th>${plan.heddles.map((_, i) => `<td>${i + 1}</td>`).join('')}</tr>
        <tr><th scope="row">Heddles</th>${plan.heddles.map((n) => `<td>${n}</td>`).join('')}</tr></table>
      <p class="ldm-hint">Add a few spare heddles on each shaft. Floating selvedges, if you use them, are extra.</p>
    </section>`;
}

// One repeat of the threading as a grid, shaft 1 at the bottom.
function threadingGrid(unit, shafts, rightToLeft) {
  const cols = rightToLeft ? [...unit].reverse() : unit;
  const rows = [];
  for (let s = shafts; s >= 1; s--) {
    rows.push(`<tr><th scope="row">${s}</th>${cols.map((v) => `<td class="${v === s ? 'on' : ''}">${v === s ? s : ''}</td>`).join('')}</tr>`);
  }
  return `<div class="ldm-scroll"><table class="ldm-grid-table" aria-label="One repeat of the threading">${rows.join('')}</table></div>`;
}

function sleySection(draft, plan, loom) {
  if (!loom.epi) {
    return '<section><h3>Sleying the reed</h3><p class="ldm-hint">Enter a sett (ends per inch) to get a sley pattern for your reeds.</p></section>';
  }
  const sley = sleyFor(loom.epi, loom.reeds);
  const width = plan.threading.total / loom.epi;
  let how;
  if (!sley) {
    how = `None of your reeds (${loom.reeds.join(', ') || 'none entered'}) gives a simple pattern for ${loom.epi} ends per inch.`;
  } else if (sley.pattern.length === 1) {
    how = `Use your ${sley.reed}-dent reed with ${sley.pattern[0]} end${sley.pattern[0] === 1 ? '' : 's'} in every dent.`;
  } else {
    how = `Use your ${sley.reed}-dent reed, sleying ${sley.pattern.join(', ')} ends in successive dents, then repeat.`;
  }
  return `
    <section>
      <h3>Sleying the reed</h3>
      <p>${escapeHtml(how)}</p>
      <p class="ldm-hint">At ${loom.epi} ends per inch, the ${plan.threading.total} ends in this draft are ${width.toFixed(1)} inches wide in the reed.</p>
    </section>`;
}

function tieupSection(plan, loom) {
  const { columns, ties } = plan.tieup;
  const shafts = loom.shafts;
  const mark = (tie, s) => {
    if (tie.rise?.includes(s)) return '<td class="on" title="rising tie">●</td>';
    if (tie.sink?.includes(s)) return `<td class="${loom.shed === 'counterbalance' ? 'on' : 'sink'}" title="sinking tie">○</td>`;
    return '<td></td>';
  };
  const rows = [];
  for (let s = shafts; s >= 1; s--) rows.push(`<tr><th scope="row">${s}</th>${ties.map((t) => mark(t, s)).join('')}</tr>`);
  rows.push(`<tr><th scope="row"></th>${columns.map((_, i) => `<th scope="col">${i + 1}</th>`).join('')}</tr>`);
  const legend = {
    jack: '● tie this shaft to the treadle (it rises).',
    counterbalance: '○ tie this shaft to the treadle (it sinks).',
    countermarch: '● tie to the upper lams (rises); ○ tie to the lower lams (sinks).',
  }[loom.shed];
  return `
    <section>
      <h3>Tie-up</h3>
      <div class="ldm-scroll"><table class="ldm-grid-table ldm-tieup" aria-label="Tie-up: shafts by treadles">${rows.join('')}</table></div>
      <p class="ldm-hint">Shafts up the side, treadles along the bottom, treadle 1 at the left. ${legend}</p>
    </section>`;
}

function picksSection(plan) {
  const { kind, unit, times, extra, total } = plan.picks;
  const word = kind === 'levers' ? 'Lift levers' : 'Treadle';
  const lines = runs(unit).map(({ value, count, start }) => {
    const picks = count === 1 ? `Pick ${start + 1}` : `Picks ${start + 1}–${start + count}`;
    const what = value.length ? `${word.toLowerCase()} ${joinAnd(value)}` : 'no shafts (an empty shed; check the draft)';
    const feet = kind === 'treadles' && value.length > 1 ? ' together' : '';
    return `<li><span class="ldm-pick">${picks}</span> ${escapeHtml(what)}${feet}</li>`;
  });
  return `
    <section>
      <h3>${kind === 'levers' ? 'Lifting sequence' : 'Treadling'}</h3>
      <p>${total} picks. ${repeatText(times, extra, unit.length, 'pick')}</p>
      <ol class="ldm-picks${lines.length > 12 ? ' ldm-long' : ''}">${lines.join('')}</ol>
    </section>`;
}

// --- Text helpers ------------------------------------------------------------

function repeatText(times, extra, unitLength, noun) {
  if (times <= 1 && !extra) return 'No repeat; the whole sequence is listed.';
  const plural = (n) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  const verb = noun === 'end' ? 'Thread' : 'Weave';
  const rest = extra ? `, then the first ${plural(extra)} once more` : '';
  return `${verb} the ${plural(unitLength)} below ${times} time${times === 1 ? '' : 's'}${rest}.`;
}

function groups(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function joinAnd(list) {
  if (list.length <= 1) return String(list[0] ?? '');
  return `${list.slice(0, -1).join(', ')} & ${list.at(-1)}`;
}

function clampInt(v, lo, hi, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}
