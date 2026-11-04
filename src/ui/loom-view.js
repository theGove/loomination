// "Set up my loom": the weaver's looms (they can own several and pick one) and
// printable instructions for weaving one draft on the chosen loom.
//
// The draft comes from the library (loom.html#library=hw-12871) or, by
// default, the draft currently open in the designer.

import { planForLoom, runs, sleyFor } from '../core/loom.js';
import { loadPageDraft } from './page-draft.js';
import { escapeHtml } from './html.js';
import { log, timed } from './debug.js';
import { listLooms, loadLoom, saveLoom, chooseLoom, deleteLoom, unusedName, loomOptions, DEFAULT_LOOM } from './loom-profile.js';

export function mountLoomSetup(root, { libraryBase, designerUrl, warpUrl }) {
  let looms = listLooms();
  let loom = loadLoom(looms);
  let draft = null;
  let source = '';

  root.classList.add('ldm', 'ldm-loom');
  root.innerHTML = `
    <form class="ldm-loom-form" aria-label="Your loom">
      <h2>Your looms</h2>
      <label class="ldm-field">Weave on <select name="chosen"></select></label>
      <div class="ldm-loom-actions">
        <button type="button" data-act="add">Add a loom</button>
        <button type="button" data-act="delete">Delete</button>
      </div>
      <label class="ldm-field">Name <input type="text" name="name" maxlength="60" autocomplete="off"></label>
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
      <label class="ldm-field">Weaving width, inches <input type="number" name="widthIn" min="0" max="200" step="0.5" placeholder="optional"></label>
      <label class="ldm-field">Reeds you own (dents per inch) <input type="text" name="reeds" inputmode="decimal" placeholder="8, 10, 12"></label>
      <label class="ldm-field">Sett, ends per inch <input type="number" name="epi" min="0" max="200" step="0.5" placeholder="optional"></label>
      <p class="ldm-hint">Saved for next time, and on your Google Drive when you sign in.</p>
    </form>
    <article class="ldm-instructions" aria-live="polite"><p class="ldm-status">Loading…</p></article>`;

  const form = root.querySelector('form');
  const out = root.querySelector('.ldm-instructions');

  const fill = () => {
    // Before anything is saved, the picker shows the default loom being edited.
    form.chosen.innerHTML = loomOptions(loom.id ? looms : [loom], loom.id);
    form.querySelector('[data-act=delete]').hidden = !loom.id;
    form.name.value = loom.name;
    form.type.value = loom.type;
    form.shafts.value = loom.shafts;
    form.treadles.value = loom.treadles;
    form.shed.value = loom.shed;
    form.reeds.value = loom.reeds.join(', ');
    form.epi.value = loom.epi || '';
    form.widthIn.value = loom.widthIn || '';
    root.querySelectorAll('[data-floor]').forEach((el) => { el.hidden = loom.type !== 'floor'; });
  };
  fill();

  form.addEventListener('input', (e) => {
    if (e.target.name === 'chosen') return;
    loom = {
      id: loom.id,
      name: form.name.value.trim() || loom.name,
      type: form.type.value,
      shafts: clampInt(form.shafts.value, 2, 40, loom.shafts),
      treadles: clampInt(form.treadles.value, 2, 40, loom.treadles),
      shed: form.shed.value,
      reeds: form.reeds.value.split(/[\s,;]+/).map(Number).filter((n) => n > 0 && n <= 100),
      epi: Math.max(0, Number(form.epi.value) || 0),
      widthIn: Math.max(0, Number(form.widthIn.value) || 0),
    };
    root.querySelectorAll('[data-floor]').forEach((el) => { el.hidden = loom.type !== 'floor'; });
    const isNew = !loom.id;
    loom = saveLoom(loom);
    if (isNew) chooseLoom(loom.id);
    looms = [...looms.filter((l) => l.id !== loom.id), loom];
    if (isNew) {
      form.chosen.innerHTML = loomOptions(looms, loom.id);
      form.querySelector('[data-act=delete]').hidden = false;
    } else if (e.target.name === 'name') {
      form.chosen.selectedOptions[0].textContent = loom.name;
    }
    render();
  });
  form.chosen.addEventListener('change', () => {
    chooseLoom(form.chosen.value);
    loom = loadLoom(looms);
    log('loom', `chose ${loom.name}: ${loom.shafts} shafts, ${loom.treadles} treadles, ${loom.type}`);
    fill();
    render();
  });
  form.querySelector('[data-act=add]').addEventListener('click', () => {
    if (!loom.id) loom = saveLoom(loom); // keep the loom they were editing
    loom = saveLoom({ ...DEFAULT_LOOM, name: unusedName(looms.length ? looms : [loom]) });
    chooseLoom(loom.id);
    looms = listLooms();
    fill();
    render();
    form.name.focus();
    form.name.select();
  });
  form.querySelector('[data-act=delete]').addEventListener('click', () => {
    if (!window.confirm(`Delete "${loom.name}"? Your drafts are not affected.`)) return;
    deleteLoom(loom.id);
    looms = looms.filter((l) => l.id !== loom.id);
    loom = looms[0] || { ...DEFAULT_LOOM, id: '' };
    if (loom.id) chooseLoom(loom.id);
    fill();
    render();
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  let libraryId = null;
  loadPageDraft(libraryBase)
    .then((page) => {
      ({ draft, source, libraryId } = page);
      render();
    })
    .catch((err) => { out.innerHTML = `<p>Could not load the draft: ${escapeHtml(err.message)}</p>`; });

  function render() {
    if (!draft) return;
    const plan = timed('loom', `plan for ${loom.shafts}-shaft ${loom.type} loom, ${loom.treadles} treadles`, () => planForLoom(draft, loom));
    const title = draft.meta.title || 'Untitled draft';
    const editLink = designerUrl
      ? `<a href="${escapeHtml(libraryId ? `${designerUrl}#library=${encodeURIComponent(libraryId)}` : designerUrl)}">${libraryId ? 'Open in designer' : 'Edit in designer'}</a>`
      : '';
    const warpLink = warpUrl
      ? ` · <a href="${escapeHtml(libraryId ? `${warpUrl}#library=${encodeURIComponent(libraryId)}` : warpUrl)}">Plan the warp</a>`
      : '';
    out.innerHTML = `
      <header class="ldm-instr-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p class="ldm-hint">Instructions for ${escapeHtml(source)} on ${loomName(loom)}. ${editLink}${warpLink}</p>
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
  const shed = { jack: 'jack', counterbalance: 'counterbalance', countermarch: 'countermarch' }[loom.shed];
  const kind = loom.type === 'table'
    ? `${loom.shafts}-shaft table loom`
    : `${loom.shafts}-shaft, ${loom.treadles}-treadle ${shed} loom`;
  return `${escapeHtml(loom.name)} (your ${kind})`;
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
      ${loom.widthIn && width > loom.widthIn ? `<p class="ldm-problems">That is wider than your loom's ${loom.widthIn}-inch weaving width.</p>` : ''}
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
