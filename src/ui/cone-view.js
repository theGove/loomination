// "Yarn on a cone": estimate how much yarn is left from the weight of a cone
// or tube, the kind of yarn, and the core's size and material.

import { coreWeight, yarnOnCore, CORE_MATERIALS, GRAMS_PER_POUND } from '../core/cone.js';
import { YARNS, yarnById } from '../core/yarns.js';
import { addToStash } from './ai-view.js';
import { escapeHtml } from './html.js';

const KEY = 'loomination.cone';
const DEFAULTS = {
  yarn: 'cotton-8-2', ypp: 0,
  weight: 500, weightUnit: 'g',
  shape: 'cone', material: 'cardboard', units: 'in',
  length: 6.5, baseDiameter: 2.75, topDiameter: 1, thicknessMm: 2,
  emptyGrams: 0, // a weighed empty core overrides the estimate
};
const TO_GRAMS = { g: 1, oz: GRAMS_PER_POUND / 16, lb: GRAMS_PER_POUND };
const TO_CM = { in: 2.54, cm: 1 };

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Not remembered; fine for this visit.
  }
}

export function mountConeEstimator(root, { aiUrl }) {
  const state = load();
  const yarnOptions = `${YARNS.map((y) => `<option value="${y.id}">${escapeHtml(y.name)} (${y.ypp.toLocaleString('en-US')} yd/lb)</option>`).join('')}<option value="custom">Other (enter yards per pound)</option>`;
  const materials = Object.entries(CORE_MATERIALS).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('');

  root.classList.add('ldm', 'ldm-loom', 'ldm-cone');
  root.innerHTML = `
    <form class="ldm-loom-form" aria-label="Cone or tube">
      <h2>The yarn</h2>
      <label class="ldm-field">Kind of yarn <select name="yarn">${yarnOptions}</select></label>
      <label class="ldm-field" data-custom>Yards per pound <input type="number" name="ypp" min="1" max="50000"></label>
      <div class="ldm-row ldm-weight">
        <label class="ldm-field">Weight with the core <input type="number" name="weight" min="0" step="any"></label>
        <label class="ldm-field">Unit <select name="weightUnit"><option value="g">grams</option><option value="oz">ounces</option><option value="lb">pounds</option></select></label>
      </div>
      <h2>The core</h2>
      <label class="ldm-field">Shape <select name="shape"><option value="cone">Cone</option><option value="tube">Tube</option></select></label>
      <label class="ldm-field">Material <select name="material">${materials}</select></label>
      <label class="ldm-field">Measure in <select name="units"><option value="in">inches</option><option value="cm">centimetres</option></select></label>
      <div class="ldm-sizes">
        <label>Length (height) <input type="number" name="length" min="0" step="any"></label>
        <label><span data-base-label>Base diameter</span> <input type="number" name="baseDiameter" min="0" step="any"></label>
        <label data-cone>Top diameter <input type="number" name="topDiameter" min="0" step="any"></label>
        <label>Wall thickness, mm <input type="number" name="thicknessMm" min="0" step="any"></label>
      </div>
      <label class="ldm-field">Or: weight of an empty core, grams <input type="number" name="emptyGrams" min="0" step="any" placeholder="optional, more accurate"></label>
      <p class="ldm-hint">Remembered in this browser.</p>
    </form>
    <article class="ldm-instructions" aria-live="polite"></article>`;

  const form = root.querySelector('form');
  const out = root.querySelector('.ldm-instructions');
  for (const el of form.elements) {
    if (el.name in state) el.value = state[el.name] === 0 && ['ypp', 'emptyGrams'].includes(el.name) ? '' : state[el.name];
  }

  form.addEventListener('input', (e) => {
    const el = e.target;
    if (!(el.name in DEFAULTS)) return;
    state[el.name] = el.tagName === 'SELECT' ? el.value : Math.max(0, Number(el.value) || 0);
    save(state);
    render();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  out.addEventListener('click', (e) => {
    if (!e.target.closest('[data-stash]')) return;
    const known = yarnById(state.yarn);
    const n = addToStash(known ? { yarn: known.id, yards: Math.round(last.yards) } : { yarn: 'custom', name: 'Yarn', ypp: state.ypp, yards: Math.round(last.yards) });
    e.target.closest('[data-stash]').replaceWith(Object.assign(document.createElement('span'), {
      className: 'ldm-hint',
      innerHTML: `Added to your stash as Y${n}. ${aiUrl ? `<a href="${aiUrl}">Open Ask your AI</a>` : ''}`,
    }));
  });

  let last = null;
  function render() {
    form.querySelector('[data-custom]').hidden = state.yarn !== 'custom';
    form.querySelector('[data-cone]').hidden = state.shape !== 'cone';
    form.querySelector('[data-base-label]').textContent = state.shape === 'cone' ? 'Base diameter' : 'Diameter';

    const known = yarnById(state.yarn);
    const ypp = known ? known.ypp : state.ypp;
    const cm = TO_CM[state.units];
    const grossGrams = state.weight * TO_GRAMS[state.weightUnit];
    const estimated = coreWeight({
      shape: state.shape,
      length: state.length * cm,
      baseDiameter: state.baseDiameter * cm,
      topDiameter: state.topDiameter * cm,
      thickness: state.thicknessMm / 10,
      material: state.material,
    });
    const core = state.emptyGrams ? { grams: state.emptyGrams } : estimated;
    if (!ypp) {
      out.innerHTML = '<p>Enter the yarn’s yards per pound (it’s usually on the cone’s label).</p>';
      return;
    }
    const r = yarnOnCore({ grossGrams, core, ypp });
    last = r;
    const fmt = (n) => Math.round(n).toLocaleString('en-US');
    const yarnName = known ? known.name : 'this yarn';
    out.innerHTML = r.yards > 0 ? `
      <p class="ldm-big">About <strong>${fmt(r.yards)} yards</strong> <span class="ldm-hint">(${fmt(r.meters)} m)</span></p>
      <p>Likely between ${fmt(r.low)} and ${fmt(r.high)} yards.</p>
      <table class="ldm-table ldm-calc">
        <tr><th scope="row">Weight with the core</th><td>${fmt(grossGrams)} g</td><td class="ldm-hint">${(grossGrams / GRAMS_PER_POUND).toFixed(2)} lb</td></tr>
        <tr><th scope="row">${state.emptyGrams ? 'Empty core (weighed)' : 'Core, estimated'}</th><td>− ${fmt(core.grams)} g</td><td class="ldm-hint">${state.emptyGrams ? '' : `${fmt(estimated.low)}–${fmt(estimated.high)} g for ${CORE_MATERIALS[state.material].name.toLowerCase()}`}</td></tr>
        <tr class="ldm-total"><th scope="row">Yarn</th><td>${fmt(r.netGrams)} g</td><td>${(r.netGrams / GRAMS_PER_POUND).toFixed(2)} lb</td></tr>
        <tr><th scope="row">× ${escapeHtml(yarnName)}</th><td>${ypp.toLocaleString('en-US')} yd/lb</td><td></td></tr>
      </table>
      <p class="ldm-hint">The range allows for how dense cores are and for small differences in yardage between dye lots. Weighing an empty core of the same kind narrows it.</p>
      <button type="button" data-stash>Add to my stash</button>`
      : '<p>The weight is no more than the core’s, so there’s little or no yarn left. Check the weight and the core size.</p>';
  }
  render();
}
