// Warp planner: how many ends, how long a warp, and how much yarn of each
// color, for a project woven from one draft. Inputs are remembered (and synced
// when signed in; see sync.js); the arithmetic lives in core/warp-calc.js.

import { repeatUnit, sleyFor } from '../core/loom.js';
import { planWarp, structureOf, DEFAULT_PROJECT } from '../core/warp-calc.js';
import { yarnsByFiber, yarnById } from '../core/yarns.js';
import { loadPageDraft } from './page-draft.js';
import { listLooms, loadLoom, chooseLoom, loomOptions } from './loom-profile.js';
import { escapeHtml } from './html.js';
import * as sync from './sync.js';

const PLAN_KEY = 'warpPlan';
const DEFAULTS = {
  ...DEFAULT_PROJECT,
  warpYarn: 'cotton-8-2',
  warpYpp: 0,          // used when warpYarn is 'custom'
  weftYarn: 'same',
  weftYpp: 0,
  epi: 0,              // 0 = suggested from the yarn and structure
  ppi: 0,              // 0 = same as epi
  onHand: {},          // 'warp-1' -> yards
};
// Fields shown as percentages in the form and stored as fractions.
const PERCENT = ['drawIn', 'shrinkWidth', 'takeUp', 'shrinkLength', 'weftTakeUp'];

function loadInputs() {
  const saved = sync.get(PLAN_KEY);
  return { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
}

function saveInputs(inputs) {
  sync.set(PLAN_KEY, inputs);
}

export function mountWarpPlanner(root, { startUrl, coneUrl }) {
  let inputs = loadInputs();
  const draft = loadPageDraft();
  const looms = listLooms();
  let loom = loadLoom(looms);

  const yarnOptions = (extra = '') => `${extra}${yarnsByFiber().map((g) => `<optgroup label="${escapeHtml(g.fiber)}">${g.yarns.map((y) => `<option value="${y.id}">${escapeHtml(y.name)}</option>`).join('')}</optgroup>`).join('')}<option value="custom">Other (enter yards per pound)</option>`;
  const num = (name, label, attrs = '') => `<label class="ldm-field">${label} <input type="number" name="${name}" ${attrs}></label>`;

  root.classList.add('ldm', 'ldm-loom', 'ldm-warp');
  root.innerHTML = `
    <form class="ldm-loom-form" aria-label="Project">
      <h2>Project</h2>
      ${looms.length > 1 ? `<label class="ldm-field">Loom <select name="loom">${loomOptions(looms, loom.id)}</select></label>` : ''}
      <div class="ldm-sizes">
        ${num('finishedWidth', 'Finished width, in', 'min="1" max="200" step="0.5"')}
        ${num('finishedLength', 'Finished length, in', 'min="1" max="2000" step="0.5"')}
        ${num('pieces', 'Pieces', 'min="1" max="100"')}
        ${num('allowance', 'Hems or fringe per piece, in', 'min="0" max="100" step="0.5"')}
        ${num('sampling', 'Sampling, in', 'min="0" max="200"')}
        ${num('loomWaste', 'Loom waste, in', 'min="0" max="200"')}
      </div>
      <h2>Yarn</h2>
      <label class="ldm-field">Warp <select name="warpYarn">${yarnOptions()}</select></label>
      <span data-custom="warp">${num('warpYpp', 'Warp yards per pound', 'min="1" max="50000"')}</span>
      <label class="ldm-field">Weft <select name="weftYarn">${yarnOptions('<option value="same">Same as warp</option>')}</select></label>
      <span data-custom="weft">${num('weftYpp', 'Weft yards per pound', 'min="1" max="50000"')}</span>
      <div class="ldm-sizes">
        ${num('epi', 'Ends per inch', 'min="0" max="200" step="0.5"')}
        ${num('ppi', 'Picks per inch', 'min="0" max="200" step="0.5"')}
      </div>
      <details>
        <summary>Shrinkage and take-up</summary>
        <div class="ldm-sizes">
          ${num('drawIn', 'Draw-in, %', 'min="0" max="40"')}
          ${num('shrinkWidth', 'Width shrinkage, %', 'min="0" max="40"')}
          ${num('takeUp', 'Warp take-up, %', 'min="0" max="40"')}
          ${num('shrinkLength', 'Length shrinkage, %', 'min="0" max="40"')}
          ${num('weftTakeUp', 'Weft take-up, %', 'min="0" max="40"')}
        </div>
      </details>
      <label class="ldm-inline"><input type="checkbox" name="floatingSelvedges"> Floating selvedges</label>
      <label class="ldm-inline"><input type="checkbox" name="balance"> Balance the threading</label>
      <p class="ldm-hint">Remembered in this browser.</p>
    </form>
    <article class="ldm-instructions" aria-live="polite"><p class="ldm-status">Loading…</p></article>`;

  const form = root.querySelector('form');
  const out = root.querySelector('.ldm-instructions');

  for (const el of form.elements) {
    if (!el.name || !(el.name in inputs)) continue;
    const v = inputs[el.name];
    if (el.type === 'checkbox') el.checked = Boolean(v);
    else if (PERCENT.includes(el.name)) el.value = Math.round(v * 1000) / 10;
    // 0 means "not set" for these, so leave the box empty to show the placeholder.
    else el.value = v === 0 && ['epi', 'ppi', 'warpYpp', 'weftYpp'].includes(el.name) ? '' : v;
  }
  const showCustom = () => {
    root.querySelector('[data-custom=warp]').hidden = form.warpYarn.value !== 'custom';
    root.querySelector('[data-custom=weft]').hidden = form.weftYarn.value !== 'custom';
  };
  showCustom();

  form.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.name || !(el.name in DEFAULTS)) return;
    if (el.type === 'checkbox') inputs[el.name] = el.checked;
    else if (el.tagName === 'SELECT') inputs[el.name] = el.value;
    else if (PERCENT.includes(el.name)) inputs[el.name] = Math.min(0.4, Math.max(0, (Number(el.value) || 0) / 100));
    else inputs[el.name] = Math.max(0, Number(el.value) || 0);
    showCustom();
    saveInputs(inputs);
    render();
  });
  form.loom?.addEventListener('change', () => {
    chooseLoom(form.loom.value);
    loom = loadLoom(looms);
    render();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  out.addEventListener('input', (e) => {
    const key = e.target.dataset.onhand;
    if (!key) return;
    inputs.onHand = { ...inputs.onHand, [key]: Math.max(0, Number(e.target.value) || 0) };
    saveInputs(inputs);
    updateStatus(e.target.closest('tr'), key);
  });

  if (draft) render();
  else out.innerHTML = `<p>No draft chosen yet. ${startUrl ? `<a class="ldm-button ldm-primary" href="${escapeHtml(startUrl)}">Choose a draft</a>` : ''}</p>`;

  function render() {
    if (!draft) return;
    const warpYarn = yarnById(inputs.warpYarn);
    const weftYarn = inputs.weftYarn === 'same' ? warpYarn : yarnById(inputs.weftYarn);
    const warpYpp = inputs.warpYarn === 'custom' ? inputs.warpYpp : warpYarn?.ypp ?? 0;
    const weftYpp = inputs.weftYarn === 'same' ? warpYpp : inputs.weftYarn === 'custom' ? inputs.weftYpp : weftYarn?.ypp ?? 0;

    const structure = structureOf(draft);
    const suggested = warpYarn ? warpYarn[structure] : 0;
    const epi = inputs.epi || suggested;
    const ppi = inputs.ppi || epi;
    form.epi.placeholder = suggested ? String(suggested) : 'required';
    form.ppi.placeholder = epi ? String(epi) : '';

    if (!epi) {
      out.innerHTML = '<p>Enter the ends per inch for your yarn to plan the warp.</p>';
      return;
    }
    const threadingUnit = repeatUnit(draft.threading.filter((s) => s > 0)).unit;
    const plan = planWarp({
      project: inputs, epi, ppi, threadingUnit,
      warpColors: draft.warpColors, weftColors: draft.weftColors, warpYpp, weftYpp,
    });

    const sley = sleyFor(epi, loom.reeds);
    const tooWide = loom.widthIn && plan.widthInReed > loom.widthIn;
    const settNote = inputs.epi
      ? `${epi} ends per inch (your setting).`
      : `${epi} ends per inch: a typical sett for ${escapeHtml(warpYarn?.name ?? 'this yarn')} in ${structure === 'plain' ? 'plain weave' : 'twill'}. Weave a sample to be sure.`;
    const endsParts = [];
    if (plan.repeats) endsParts.push(`${plan.repeats} repeats of ${threadingUnit.length} ends`);
    else endsParts.push(`${plan.patternEnds} ends`);
    if (plan.balance) endsParts.push(`${plan.balance} to balance`);
    if (plan.selvedges) endsParts.push(`${plan.selvedges} floating selvedges`);

    const title = draft.meta.title || 'Untitled draft';
    out.innerHTML = `
      <header class="ldm-instr-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p class="ldm-hint">Warp plan on ${escapeHtml(loom.name)}.</p>
        </div>
        <button type="button" data-print>Print</button>
      </header>
      <dl class="ldm-facts ldm-summary">
        <div><dt>Ends</dt><dd>${plan.ends}</dd></div>
        <div><dt>Width in reed</dt><dd>${inches(plan.widthInReed)}</dd></div>
        <div><dt>Warp length</dt><dd>${length(plan.warpLength / 36)} (${inches(plan.warpLength)})</dd></div>
        <div><dt>Warp yarn</dt><dd>${yards(plan.warp.yards)}</dd></div>
        <div><dt>Weft yarn</dt><dd>${yards(plan.weft.yards)}</dd></div>
      </dl>
      ${tooWide ? `<p class="ldm-problems">The warp is ${inches(plan.widthInReed)} wide in the reed, wider than the ${loom.widthIn}-inch weaving width of ${escapeHtml(loom.name)}.</p>` : ''}
      <section>
        <h3>Sett and width</h3>
        <p>${settNote}</p>
        <p>${plan.ends} ends: ${endsParts.join(' + ')}. They are ${inches(plan.widthInReed)} wide in the reed, for ${inches(inputs.finishedWidth)} finished.</p>
        <p>${sley ? sleyText(sley) : `None of your reeds (${loom.reeds.join(', ') || 'none entered on the Loom setup page'}) gives a simple sley for ${epi} ends per inch.`}</p>
        <p class="ldm-hint">Weft at ${ppi} picks per inch${inputs.ppi ? '' : ', the same as the sett, for a balanced cloth'}.</p>
      </section>
      <section>
        <h3>Warp length</h3>
        <table class="ldm-table ldm-calc">
          <tr><th scope="row">Each piece on the loom</th><td>${inches(plan.wovenPerPiece)}</td><td class="ldm-hint">${inches(inputs.finishedLength)} + ${inches(inputs.allowance)} hems or fringe, plus take-up and shrinkage</td></tr>
          <tr><th scope="row">× ${inputs.pieces} piece${inputs.pieces === 1 ? '' : 's'}</th><td>${inches(plan.wovenPerPiece * inputs.pieces)}</td><td></td></tr>
          <tr><th scope="row">Sampling</th><td>${inches(inputs.sampling)}</td><td></td></tr>
          <tr><th scope="row">Loom waste</th><td>${inches(inputs.loomWaste)}</td><td></td></tr>
          <tr class="ldm-total"><th scope="row">Warp length</th><td>${inches(plan.warpLength)}</td><td>${length(plan.warpLength / 36)}</td></tr>
        </table>
      </section>
      ${yarnSection('Warp', 'warp', plan.warp.byColor, 'ends', draft, warpYpp)}
      ${yarnSection('Weft', 'weft', plan.weft.byColor, 'picks', draft, weftYpp)}
      <p class="ldm-hint">Yardage includes take-up, shrinkage and loom waste but no spare. "Enough" means at least 10% more than needed.${coneUrl ? ` Not sure what's on a cone? <a href="${coneUrl}">Estimate it from its weight</a>.` : ''}</p>`;
    out.querySelector('[data-print]').addEventListener('click', () => window.print());
    out.querySelectorAll('[data-onhand]').forEach((el) => updateStatus(el.closest('tr'), el.dataset.onhand));
  }

  function yarnSection(label, kind, rows, unit, draft, ypp) {
    const body = rows.map((c) => {
      const key = `${kind}-${c.color}`;
      const have = inputs.onHand[key] ?? '';
      return `<tr data-need="${c.yards}">
        <td><span class="ldm-dot" style="background:${hex(draft.palette[c.color] ?? [0, 0, 0])}"></span> Color ${c.color + 1}</td>
        <td>${c[unit].toLocaleString()}</td>
        <td>${yards(c.yards)}</td>
        <td>${ypp ? weight(c.pounds) : '<span class="ldm-hint">enter yards per pound</span>'}</td>
        <td><input type="number" min="0" step="10" data-onhand="${key}" value="${have}" aria-label="${label} color ${c.color + 1} yards on hand" placeholder="yd"></td>
        <td class="ldm-have"></td>
      </tr>`;
    }).join('');
    return `
      <section>
        <h3>${label} yarn</h3>
        <div class="ldm-scroll">
          <table class="ldm-table ldm-yarn">
            <tr><th>Color</th><th>${unit === 'ends' ? 'Ends' : 'Picks'}</th><th>Yards</th><th>Weight</th><th>On hand</th><th></th></tr>
            ${body}
          </table>
        </div>
      </section>`;
  }

  function updateStatus(row, key) {
    const cell = row.querySelector('.ldm-have');
    const need = Number(row.dataset.need);
    const have = inputs.onHand[key];
    if (!have) {
      cell.textContent = '';
      cell.className = 'ldm-have';
    } else if (have >= need * 1.1) {
      cell.textContent = 'Enough';
      cell.className = 'ldm-have ldm-ok';
    } else if (have >= need) {
      cell.textContent = 'Just enough';
      cell.className = 'ldm-have ldm-tight';
    } else {
      cell.textContent = `Short ${Math.ceil(need - have).toLocaleString()} yd`;
      cell.className = 'ldm-have ldm-short';
    }
  }
}

function sleyText(sley) {
  if (sley.pattern.length === 1) return `Sley your ${sley.reed}-dent reed ${sley.pattern[0]} per dent.`;
  return `Sley your ${sley.reed}-dent reed ${sley.pattern.join(', ')} in successive dents, repeating.`;
}

const inches = (n) => `${(Math.round(n * 10) / 10).toLocaleString()} in`;
const yards = (n) => `${Math.ceil(n).toLocaleString()} yd`;
// A length to measure out (not yarn to buy), so one decimal rather than rounding up.
const length = (yd) => `${(Math.round(yd * 10) / 10).toLocaleString()} yd`;

function weight(pounds) {
  if (pounds == null) return '';
  const grams = pounds * 453.592;
  const lb = pounds >= 1 ? `${pounds.toFixed(2)} lb` : `${(pounds * 16).toFixed(1)} oz`;
  return `${lb} (${Math.ceil(grams).toLocaleString()} g)`;
}

const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
