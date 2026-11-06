// Thread length calculator: estimate how much yarn is left from the weight of
// a cone or tube, the yarn's fiber and count, and the core's size and material.
// Yards per pound come from a known yarn's usual figure when there is one,
// otherwise from the count (8/2, 2/8 …) in the fiber's count system.

import { coreWeight, yarnOnCore, yppFromSample, sampleAdvice, SCALES, SAMPLE_STEPS, MIN_SAMPLE_YARDS, CORE_MATERIALS, GRAMS_PER_POUND } from '../core/cone.js';
import { FIBERS, COUNT_SYSTEMS, fiberById, presetsForFiber, presetFor, yppFromCount, countFromYpp, yarnById } from '../core/yarns.js';
import { addToStash } from './ai-view.js';
import { escapeHtml } from './html.js';
import * as sync from './sync.js';

const KEY = 'cone';
const DEFAULTS = {
  // Which tab: the yarn's count is known, or a measured length is weighed.
  yarnMode: 'known',
  fiber: 'cotton', count: '8/2', system: '', // system '' = the fiber's usual one
  ypp: 0, // typed yards per pound; overrides the count
  sampleLength: 0, sampleUnit: 'yd', sampleGrams: 0, scaleStep: '1',
  weight: 500, weightUnit: 'g',
  shape: 'cone', material: 'cardboard', units: 'in',
  length: 6.5, baseDiameter: 2.75, topDiameter: 1, thicknessMm: 2,
  // Which tab: an empty core was weighed, or its weight is estimated from its size.
  coreMode: 'estimate',
  emptyGrams: 0,
};
const TO_GRAMS = { g: 1, oz: GRAMS_PER_POUND / 16, lb: GRAMS_PER_POUND };
const TO_CM = { in: 2.54, cm: 1 };
const TO_YARDS = { yd: 1, m: 1 / 0.9144 };
const OPTIONAL = ['ypp', 'emptyGrams', 'sampleLength', 'sampleGrams'];

function load() {
  const got = sync.get(KEY);
  const saved = got && typeof got === 'object' ? { ...got } : {};
  // Before fiber + count, one "yarn" preset id (or 'custom' with its ypp).
  if (saved.yarn && !saved.fiber) {
    const known = yarnById(saved.yarn);
    if (known) Object.assign(saved, { fiber: known.kind, count: known.count ?? known.name, ypp: 0 });
    else Object.assign(saved, { fiber: 'other', count: '' });
  }
  delete saved.yarn;
  // Before the tabs, whatever was filled in was used.
  if (!saved.yarnMode && saved.sampleLength > 0 && saved.sampleGrams > 0) saved.yarnMode = 'sample';
  if (!saved.coreMode && saved.emptyGrams > 0) saved.coreMode = 'known';
  return { ...DEFAULTS, ...saved };
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const isCount = (text) => /\d/.test(text) && /^[\d\s./\-x×]+$/i.test(String(text).trim());

const sampleOf = (state) => yppFromSample({
  yards: state.sampleLength * TO_YARDS[state.sampleUnit],
  grams: state.sampleGrams,
  scaleStep: Number(state.scaleStep) || 1,
});

// Yards per pound for the current choices. On the sample tab, from the weighed
// length; otherwise a typed figure, then the yarn's usual figure, then its count.
// { ypp, spread?, source: 'sample' | 'typed' | 'label' | 'count' | null, preset, theory, systemId, name }
function resolve(state) {
  const fiber = fiberById(state.fiber);
  const preset = presetFor(fiber.id, state.count);
  const systemId = state.system || preset?.system || fiber.systems[0] || '';
  const theory = systemId ? yppFromCount(systemId, state.count) : null;
  const usual = preset && systemId === (preset.system ?? fiber.systems[0] ?? '') ? preset : null;
  const count = String(state.count).trim();
  const name = usual ? usual.name
    : count ? `${count} ${fiber.noun}` : 'this yarn';
  if (state.yarnMode === 'sample') {
    const sample = sampleOf(state);
    const weighed = { preset: null, theory: null, systemId: fiber.systems[0] ?? '', name: fiber.noun === 'yarn' ? 'weighed yarn' : `weighed ${fiber.noun}` };
    return sample ? { ...weighed, ...sample, source: 'sample' } : { ...weighed, ypp: 0, source: null };
  }
  const base = { preset: usual, theory, systemId, name };
  if (state.ypp) return { ...base, ypp: state.ypp, source: 'typed' };
  if (usual) return { ...base, ypp: usual.ypp, source: 'label' };
  if (theory) return { ...base, ypp: theory.ypp, source: 'count' };
  return { ...base, ypp: 0, source: null };
}

// "840 × 8 ÷ 4 plies", the count's arithmetic in its system.
function arithmetic(t) {
  return `${fmt(t.base)} × ${t.count}${t.plies > 1 ? ` ÷ ${t.plies} plies` : ''}`;
}

function save(state) {
  sync.set(KEY, state);
}

// A tab set: buttons that choose state[name], each showing its own panel.
function tabList(name, label, tabs) {
  return `<div class="ldm-tabs" role="tablist" aria-label="${escapeHtml(label)}">${tabs.map(([value, text]) =>
    `<button type="button" role="tab" id="ldm-cone-${name}-${value}" aria-controls="ldm-cone-${name}-${value}-panel" data-tab="${name}" value="${value}">${escapeHtml(text)}</button>`).join('')}</div>`;
}
const tabPanel = (name, value, html) =>
  `<div class="ldm-tabpanel" role="tabpanel" id="ldm-cone-${name}-${value}-panel" aria-labelledby="ldm-cone-${name}-${value}" data-panel="${name}">${html}</div>`;

export function mountConeEstimator(root, { aiUrl }) {
  const state = load();
  const fiberOptions = FIBERS.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
  const materials = Object.entries(CORE_MATERIALS).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('');

  root.classList.add('ldm', 'ldm-loom', 'ldm-cone');
  root.innerHTML = `
    <form class="ldm-loom-form" aria-label="Cone or tube">
      <h2>The yarn</h2>
      <label class="ldm-field">Fiber <select name="fiber">${fiberOptions}</select></label>
      ${tabList('yarnMode', 'How you know the yarn', [['known', 'Known count'], ['sample', 'Weigh a sample']])}
      ${tabPanel('yarnMode', 'known', `
        <label class="ldm-field"><span data-count-label>Count</span> <input type="text" name="count" list="ldm-cone-counts" autocomplete="off" spellcheck="false"></label>
        <datalist id="ldm-cone-counts"></datalist>
        <label class="ldm-field" data-system>Count system <select name="system"></select></label>
        <label class="ldm-field">Yards per pound <input type="number" name="ypp" min="1" max="100000" step="any"></label>
        <p class="ldm-hint" data-ypp-note></p>`)}
      ${tabPanel('yarnMode', 'sample', `
        <p class="ldm-hint">No label? Measure off a length of the yarn and weigh it.</p>
        <div class="ldm-row ldm-weight">
          <label class="ldm-field">Length <input type="number" name="sampleLength" min="0" step="any"></label>
          <label class="ldm-field">Unit <select name="sampleUnit"><option value="yd">yards</option><option value="m">metres</option></select></label>
        </div>
        <label class="ldm-field">Its weight, grams <input type="number" name="sampleGrams" min="0" step="any"></label>
        <label class="ldm-field">Scale <select name="scaleStep">${SCALES.map((sc) => `<option value="${sc.step}">${escapeHtml(sc.name)}</option>`).join('')}</select></label>
        <div class="ldm-hint" data-sample-note></div>`)}
      <div class="ldm-row ldm-weight">
        <label class="ldm-field">Weight with the core <input type="number" name="weight" min="0" step="any"></label>
        <label class="ldm-field">Unit <select name="weightUnit"><option value="g">grams</option><option value="oz">ounces</option><option value="lb">pounds</option></select></label>
      </div>
      <h2>The core</h2>
      ${tabList('coreMode', 'How you know the core’s weight', [['known', 'Known weight'], ['estimate', 'Estimate from its size']])}
      ${tabPanel('coreMode', 'known', `
        <label class="ldm-field">Empty core, grams <input type="number" name="emptyGrams" min="0" step="any"></label>
        <p class="ldm-hint">Weigh an empty cone or tube of the same kind. It’s the most accurate way.</p>`)}
      ${tabPanel('coreMode', 'estimate', `
        <label class="ldm-field">Shape <select name="shape"><option value="cone">Cone</option><option value="tube">Tube</option></select></label>
        <label class="ldm-field">Material <select name="material">${materials}</select></label>
        <label class="ldm-field">Measure in <select name="units"><option value="in">inches</option><option value="cm">centimetres</option></select></label>
        <div class="ldm-sizes">
          <label>Length (height) <input type="number" name="length" min="0" step="any"></label>
          <label><span data-base-label>Base diameter</span> <input type="number" name="baseDiameter" min="0" step="any"></label>
          <label data-cone>Top diameter <input type="number" name="topDiameter" min="0" step="any"></label>
          <label>Wall thickness, mm <input type="number" name="thicknessMm" min="0" step="any"></label>
        </div>`)}
      <p class="ldm-hint">Remembered in this browser.</p>
    </form>
    <article class="ldm-instructions" aria-live="polite"></article>`;

  const form = root.querySelector('form');
  const out = root.querySelector('.ldm-instructions');
  for (const el of form.elements) {
    if (el.name in state) el.value = state[el.name] === 0 && OPTIONAL.includes(el.name) ? '' : state[el.name];
  }

  // Tabs: click or arrow keys choose one; only its panel shows.
  function showTabs() {
    for (const tab of form.querySelectorAll('[role=tab]')) {
      const on = state[tab.dataset.tab] === tab.value;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      form.querySelector(`#${tab.getAttribute('aria-controls')}`).hidden = !on;
    }
  }
  function chooseTab(tab) {
    state[tab.dataset.tab] = tab.value;
    save(state);
    showTabs();
    render();
  }
  form.addEventListener('click', (e) => {
    const tab = e.target.closest('[role=tab]');
    if (tab) chooseTab(tab);
  });
  form.addEventListener('keydown', (e) => {
    const tab = e.target.closest('[role=tab]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = [...tab.parentElement.children];
    const i = tabs.indexOf(tab);
    const to = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: tabs.length - 1 }[e.key];
    const next = tabs[(to + tabs.length) % tabs.length];
    e.preventDefault();
    next.focus();
    chooseTab(next);
  });
  showTabs();

  form.addEventListener('input', (e) => {
    const el = e.target;
    if (!(el.name in DEFAULTS)) return;
    state[el.name] = el.type === 'number' ? Math.max(0, Number(el.value) || 0) : el.value;
    // A new yarn starts from its own count, system and usual figure. A typed
    // count like 10/2 carries over to the new fiber.
    if (el.name === 'fiber') {
      if (!isCount(state.count) || !fiberById(state.fiber).systems.length) state.count = '';
      fillCounts();
    }
    if (el.name === 'fiber' || el.name === 'count') {
      state.system = '';
      state.ypp = 0;
      form.elements.ypp.value = '';
      fillSystems();
    }
    save(state);
    render();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  out.addEventListener('click', (e) => {
    if (!e.target.closest('[data-stash]')) return;
    const y = resolve(state);
    const n = addToStash(y.source === 'label' ? { yarn: y.preset.id, yards: Math.round(last.yards) } : { yarn: 'custom', name: y.name, ypp: Math.round(y.ypp), yards: Math.round(last.yards) });
    e.target.closest('[data-stash]').replaceWith(Object.assign(document.createElement('span'), {
      className: 'ldm-hint',
      innerHTML: `Added to your stash as Y${n}. ${aiUrl ? `<a href="${aiUrl}">Open Ask your AI</a>` : ''}`,
    }));
  });

  // The counts offered for a fiber, and a placeholder showing how they're written.
  function fillCounts() {
    const fiber = fiberById(state.fiber);
    const presets = presetsForFiber(fiber.id);
    const seen = new Set();
    form.querySelector('#ldm-cone-counts').innerHTML = presets.map((y) => {
      const value = y.count && !seen.has(y.count) ? y.count : y.name;
      seen.add(y.count);
      return `<option value="${escapeHtml(value)}">${escapeHtml(`${y.name}, ${fmt(y.ypp)} yd/lb`)}</option>`;
    }).join('');
    const sys = COUNT_SYSTEMS[fiber.systems[0]];
    const input = form.elements.count;
    input.placeholder = !sys ? 'choose from the list' : sys.order === 'ply/count' ? 'e.g. 2/8' : 'e.g. 8/2';
    form.querySelector('[data-count-label]').textContent = sys ? 'Count' : 'Weight';
    input.value = state.count;
  }

  // The count system, offered only when the fiber is sold in more than one.
  function fillSystems() {
    const fiber = fiberById(state.fiber);
    const select = form.elements.system;
    select.innerHTML = fiber.systems.map((id) => `<option value="${id}">${escapeHtml(COUNT_SYSTEMS[id].name)}</option>`).join('');
    select.value = resolve(state).systemId;
    form.querySelector('[data-system]').hidden = fiber.systems.length < 2;
  }

  fillCounts();
  fillSystems();

  // What a weighed sample says, and how long a sample to measure. Until there
  // is a sample, the advice is in grams; after, in yards of this yarn too.
  function sampleNote(y) {
    const step = Number(state.scaleStep) || 1;
    const sample = sampleOf(state);
    const advice = sampleAdvice({ ypp: sample?.ypp, scaleStep: step });
    const g = (n) => `${n < 1 ? n.toFixed(2) : n < 10 ? n.toFixed(1) : fmt(n)} g`;
    const finer = SCALES.find((sc) => sc.step < step);
    const finerYards = finer && advice.yards ? sampleAdvice({ ypp: sample?.ypp, scaleStep: finer.step }).yards : null;
    const tip = `<p>For a reliable figure, measure at least <strong>${fmt(advice.yards ?? MIN_SAMPLE_YARDS)} yards</strong> and make sure it weighs at least <strong>${g(advice.grams)}</strong>, ${SAMPLE_STEPS} times the scale’s ${step} g step, so its rounding stays within ±2%.${finerYards && finerYards < advice.yards * 0.8 ? ` On a ${finer.name.replace(/ \(.*\)/, '').toLowerCase()} scale (${finer.step} g), about ${fmt(finerYards)} yards would do.` : ''} Measure it relaxed, not stretched; a warping board or niddy-noddy makes a long length easy.</p>`;
    if (!sample) return tip;
    const pct = Math.round(sample.spread * 100);
    const tooSmall = state.sampleGrams < advice.grams;
    const yards = state.sampleLength * TO_YARDS[state.sampleUnit];
    let count = '';
    if (y.systemId && COUNT_SYSTEMS[y.systemId]) {
      const sys = COUNT_SYSTEMS[y.systemId];
      const plies = 2;
      const c = countFromYpp(y.systemId, sample.ypp, plies);
      const near = Math.max(1, Math.round(c));
      const written = (n) => (plies === 1 ? `${n}/1` : sys.order === 'ply/count' ? `${plies}/${n}` : `${n}/${plies}`);
      count = ` In ${sys.short} that’s about ${written(+c.toFixed(1))}${Math.abs(c / near - 1) <= 0.08 && near !== +c.toFixed(1) ? `, close to ${written(near)}` : ''}.`;
    }
    return `<p>${fmt(yards)} yards weighing ${g(state.sampleGrams)}: <strong>${fmt(sample.ypp)} yd/lb</strong>, within about ±${pct}%.${count}</p>`
      + (tooSmall ? `<p class="ldm-warn">That’s under the ${g(advice.grams)} this scale needs to be reliable. Measure a longer length.</p>` : '')
      + (tooSmall ? tip : '');
  }

  let last = null;
  function render() {
    form.querySelector('[data-cone]').hidden = state.shape !== 'cone';
    form.querySelector('[data-base-label]').textContent = state.shape === 'cone' ? 'Base diameter' : 'Diameter';

    const y = resolve(state);
    const ypp = y.ypp;
    form.elements.ypp.placeholder = y.source && y.source !== 'typed' ? fmt(ypp) : '';
    const differs = y.theory && y.preset && Math.abs(y.theory.ypp / y.preset.ypp - 1) > 0.01;
    form.querySelector('[data-ypp-note]').textContent = {
      typed: `Using the yards per pound you entered. Clear it to go back to ${y.preset ? `the usual ${fmt(y.preset.ypp)} for ${y.preset.name}` : y.theory ? `the count’s ${fmt(y.theory.ypp)}` : 'the count'}.`,
      label: `The usual figure for ${y.name}.${differs ? ` By the count alone it would be ${fmt(y.theory.ypp)} (${COUNT_SYSTEMS[y.systemId].short}: ${arithmetic(y.theory)}); makers’ yarns differ a little.` : ''} Type the label’s figure if yours says otherwise.`,
      count: y.theory ? `By the ${COUNT_SYSTEMS[y.systemId].short}: ${arithmetic(y.theory)} = ${fmt(y.theory.ypp)} yd/lb. Type the label’s figure if yours says otherwise.` : '',
    }[y.source] ?? '';
    form.querySelector('[data-sample-note]').innerHTML = sampleNote(y);
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
    const weighedCore = state.coreMode === 'known';
    const core = weighedCore ? { grams: state.emptyGrams } : estimated;
    if (weighedCore && !state.emptyGrams) {
      out.innerHTML = '<p>Enter the empty core’s weight, or choose “Estimate from its size”.</p>';
      return;
    }
    if (!ypp) {
      out.innerHTML = state.yarnMode === 'sample'
        ? '<p>Enter the length you measured and what it weighs.</p>'
        : fiberById(state.fiber).systems.length
        ? '<p>Type the yarn’s count, such as 8/2 (it’s usually on the cone’s label), or its yards per pound.</p>'
        : '<p>Choose a weight from the list, or enter the yarn’s yards per pound from its label.</p>';
      return;
    }
    const r = yarnOnCore({ grossGrams, core, ypp, spread: y.spread });
    last = r;
    out.innerHTML = r.yards > 0 ? `
      <p class="ldm-big">About <strong>${fmt(r.yards)} yards</strong> <span class="ldm-hint">(${fmt(r.meters)} m)</span></p>
      <p>Likely between ${fmt(r.low)} and ${fmt(r.high)} yards.</p>
      <table class="ldm-table ldm-calc">
        <tr><th scope="row">Weight with the core</th><td>${fmt(grossGrams)} g</td><td class="ldm-hint">${(grossGrams / GRAMS_PER_POUND).toFixed(2)} lb</td></tr>
        <tr><th scope="row">${weighedCore ? 'Empty core (weighed)' : 'Core, estimated'}</th><td>− ${fmt(core.grams)} g</td><td class="ldm-hint">${weighedCore ? '' : `${fmt(estimated.low)}–${fmt(estimated.high)} g for ${CORE_MATERIALS[state.material].name.toLowerCase()}`}</td></tr>
        <tr class="ldm-total"><th scope="row">Yarn</th><td>${fmt(r.netGrams)} g</td><td>${(r.netGrams / GRAMS_PER_POUND).toFixed(2)} lb</td></tr>
        <tr><th scope="row">× ${escapeHtml(y.name)}</th><td>${fmt(ypp)} yd/lb</td><td class="ldm-hint">${{ typed: 'as entered', sample: 'weighed', label: 'usual figure', count: 'from the count' }[y.source]}</td></tr>
      </table>
      <p class="ldm-hint">The range allows for ${weighedCore ? '' : 'how dense cores are and '}${y.source === 'sample' ? 'how precisely the sample was weighed' : 'small differences in yardage between dye lots and makers'}.${weighedCore ? '' : ' Weighing an empty core of the same kind narrows it.'}</p>
      <button type="button" data-stash>Add to my stash</button>`
      : '<p>The weight is no more than the core’s, so there’s little or no yarn left. Check the weight and the core size.</p>';
  }
  render();
}
