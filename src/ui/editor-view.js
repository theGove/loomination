// The draft designer: the four-part draft on a canvas with click-and-drag
// editing, a side panel for palette, sizes and settings, undo/redo, autosave,
// "My drafts" in localStorage, and open/save as WIF or JSON.
//
// All changes go through the store as pure edits from core/edits.js; this file
// only turns pointer and keyboard input into those edits.

import { createDraft, normalizeDraft, FORMAT_VERSION } from '../core/draft.js';
import { parseWif, toWif } from '../core/wif.js';
import { renderDrawdown } from '../core/render.js';
import * as E from '../core/edits.js';
import { createStore } from './store.js';
import { createLibrary } from './library-data.js';
import { layoutDraft, paintDraft, hitTest } from './draft-view.js';
import * as saved from './saved-drafts.js';

export function starterDraft() {
  let d = createDraft({ shafts: 4, treadles: 4, numEnds: 32, numPicks: 32, palette: [[246, 241, 228], [38, 70, 120]] });
  d = E.straightDraw(d, { from: 0, to: 31 });
  [[1, 2], [2, 3], [3, 4], [4, 1]].forEach((shafts, t) => shafts.forEach((s) => { d = E.setTieup(d, s, t + 1, true); }));
  d = E.straightTreadling(d, { from: 0, to: 31 });
  return E.setMeta(d, { title: '2/2 twill' });
}

export function mountEditor(root, { libraryBase, loomUrl, warpUrl, imageToWifUrl }) {
  const store = createStore(saved.loadCurrent() ?? starterDraft());
  const ui = {
    tool: 'draw',      // 'draw' | 'select'
    color: 1,          // palette index used for painting color bars
    view: 'color',
    floatLimit: 0,
    major: 4,
    cell: 0,           // 0 until first fit
    selection: null,   // { axis, from, to }
    clipboard: null,
    savedId: saved.loadCurrentId(),
  };
  let layout = null;

  root.classList.add('ldm', 'ldm-editor');
  root.innerHTML = `
    <div class="ldm-editbar" role="toolbar" aria-label="Designer">
      <div class="ldm-group">
        <button type="button" data-act="new">New</button>
        <button type="button" data-act="open">Open…</button>
        ${imageToWifUrl ? `<a class="ldm-button" href="${imageToWifUrl}" title="Turn a picture of a drawdown into a WIF file, then Open it here">From an image…</a>` : ''}
        <button type="button" data-act="mine">My drafts</button>
        <button type="button" data-act="keep" title="Save to My drafts in this browser">Save</button>
        <button type="button" data-act="wif">Download .wif</button>
        <button type="button" data-act="json" title="Loomination's own format">.json</button>
        <button type="button" data-act="png">.png</button>
        ${loomUrl ? `<a class="ldm-button" href="${loomUrl}" title="Threading, tie-up and treadling for your loom">Loom setup</a>` : ''}
        ${warpUrl ? `<a class="ldm-button" href="${warpUrl}" title="Ends, warp length and yarn amounts">Warp plan</a>` : ''}
      </div>
      <div class="ldm-group">
        <button type="button" data-act="undo" title="Undo (Ctrl+Z)">Undo</button>
        <button type="button" data-act="redo" title="Redo (Ctrl+Y)">Redo</button>
      </div>
      <div class="ldm-group ldm-seg" role="radiogroup" aria-label="Tool">
        <button type="button" data-tool="draw" role="radio" title="Click and drag to fill or clear cells">Draw</button>
        <button type="button" data-tool="select" role="radio" title="Drag across ends or picks to select them (or Shift+drag)">Select</button>
      </div>
      <div class="ldm-group">
        <label>View <select data-ui="view">
          <option value="color">Color</option><option value="interlacement">Interlacement</option><option value="back">Back of cloth</option>
        </select></label>
        <label>Long floats <select data-ui="floatLimit">
          <option value="0">Off</option>${[3, 4, 5, 6, 7, 9].map((n) => `<option value="${n}">Over ${n}</option>`).join('')}
        </select></label>
        <label>Lines every <select data-ui="major"><option value="4">4</option><option value="8">8</option></select></label>
        <button type="button" data-act="zoom-out" aria-label="Zoom out">−</button>
        <button type="button" data-act="zoom-in" aria-label="Zoom in">+</button>
      </div>
    </div>
    <div class="ldm-editor-body">
      <aside class="ldm-panel">
        <label class="ldm-field">Title <input type="text" data-meta="title"></label>
        <section>
          <h3>Colors</h3>
          <div class="ldm-swatches" role="radiogroup" aria-label="Painting color"></div>
          <div class="ldm-row">
            <label class="ldm-inline">Edit <input type="color" data-ui="colorEdit"></label>
            <button type="button" data-act="add-color">Add</button>
            <button type="button" data-act="remove-color">Remove</button>
          </div>
          <p class="ldm-hint">Click a swatch, then click or drag along the color bars.</p>
        </section>
        <section class="ldm-selection" hidden>
          <h3 class="ldm-sel-title"></h3>
          <div class="ldm-row">
            <button type="button" data-act="copy">Copy</button>
            <button type="button" data-act="paste">Paste</button>
            <button type="button" data-act="delete">Delete</button>
            <button type="button" data-act="insert">Insert before</button>
          </div>
          <div class="ldm-row">
            <button type="button" data-act="repeat">Repeat</button>
            <label class="ldm-inline">× <input type="number" data-ui="repeatTimes" value="1" min="1" max="50"></label>
          </div>
          <div class="ldm-row">
            <button type="button" data-act="straight">Straight</button>
            <button type="button" data-act="point">Point</button>
            <button type="button" data-act="clear-range">Clear</button>
          </div>
          <button type="button" data-act="deselect" class="ldm-link">Clear selection (Esc)</button>
        </section>
        <section>
          <h3>Size</h3>
          <div class="ldm-sizes">
            <label>Shafts <input type="number" data-size="shafts" min="1" max="${E.LIMITS.shafts}"></label>
            <label>Treadles <input type="number" data-size="treadles" min="1" max="${E.LIMITS.treadles}"></label>
            <label>Ends <input type="number" data-size="numEnds" min="1" max="${E.LIMITS.ends}"></label>
            <label>Picks <input type="number" data-size="numPicks" min="1" max="${E.LIMITS.picks}"></label>
          </div>
        </section>
        <section>
          <h3>Loom</h3>
          <label class="ldm-field">Pattern <select data-opt="mode">
            <option value="treadle">Tie-up and treadling</option><option value="liftplan">Lift plan (table or dobby loom)</option>
          </select></label>
          <label class="ldm-field">Shed <select data-opt="risingShed">
            <option value="true">Rising (jack loom)</option><option value="false">Sinking (counterbalance)</option>
          </select></label>
          <label class="ldm-field">End 1 is at the <select data-opt="endNumbering">
            <option value="rtl">Right (American)</option><option value="ltr">Left</option>
          </select></label>
          <button type="button" data-act="as-drawn-in" title="Treadle in the same order as the threading">Treadle as drawn in</button>
        </section>
        <label class="ldm-field">Notes <textarea data-meta="notes" rows="4"></textarea></label>
      </aside>
      <div class="ldm-work">
        <p class="ldm-readout" aria-live="polite">&nbsp;</p>
        <div class="ldm-canvas-wrap"><canvas role="img" aria-label="Draft editor"></canvas></div>
      </div>
    </div>
    <input type="file" accept=".wif,.json,.txt" hidden>
    <dialog class="ldm-dialog">
      <form method="dialog">
        <h3>My drafts</h3>
        <p class="ldm-hint">Saved in this browser only. Download a .wif to keep a copy elsewhere.</p>
        <ul class="ldm-mine"></ul>
        <button value="close">Close</button>
      </form>
    </dialog>`;

  const $ = (sel) => root.querySelector(sel);
  const canvas = $('canvas');
  const wrap = $('.ldm-canvas-wrap');
  const readout = $('.ldm-readout');
  const fileInput = $('input[type=file]');
  const dialog = $('dialog');

  // --- Rendering -----------------------------------------------------------

  let frame = 0;
  const repaint = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const draft = store.get();
      if (!ui.cell) ui.cell = fitCell(draft);
      clampSelection(draft);
      layout = paintDraft(canvas, draft, ui);
      syncPanel(draft);
    });
  };

  function fitCell(draft) {
    const room = wrap.parentElement.clientWidth - 26; // wrap padding + border
    let cell = 16;
    while (cell > 6 && layoutDraft(draft, cell).width > room) cell--;
    return cell;
  }

  function clampSelection(draft) {
    const s = ui.selection;
    if (!s) return;
    const n = s.axis === 'ends' ? draft.numEnds : draft.numPicks;
    if (s.from >= n) ui.selection = null;
    else s.to = Math.min(s.to, n - 1);
  }

  function syncPanel(draft) {
    const set = (el, value) => {
      if (el !== document.activeElement && el.value !== String(value)) el.value = String(value);
    };
    for (const el of root.querySelectorAll('[data-size]')) set(el, draft[el.dataset.size]);
    set($('[data-opt=mode]'), draft.mode);
    set($('[data-opt=risingShed]'), draft.risingShed);
    set($('[data-opt=endNumbering]'), draft.display.endNumbering);
    for (const el of root.querySelectorAll('[data-meta]')) set(el, draft.meta[el.dataset.meta] ?? '');
    set($('[data-ui=view]'), ui.view);
    set($('[data-ui=floatLimit]'), ui.floatLimit);
    set($('[data-ui=major]'), ui.major);
    $('[data-ui=colorEdit]').value = hex(draft.palette[ui.color] ?? [0, 0, 0]);
    $('[data-act=undo]').disabled = !store.canUndo();
    $('[data-act=redo]').disabled = !store.canRedo();
    $('[data-act=remove-color]').disabled = draft.palette.length <= 1;
    for (const btn of root.querySelectorAll('[data-tool]')) btn.setAttribute('aria-checked', String(btn.dataset.tool === ui.tool));

    const swatches = $('.ldm-swatches');
    if (ui.color >= draft.palette.length) ui.color = draft.palette.length - 1;
    swatches.innerHTML = draft.palette.map((rgb, i) => `<button type="button" role="radio" class="ldm-swatch"
      data-color="${i}" aria-checked="${i === ui.color}" aria-label="Color ${i + 1}" style="background:${hex(rgb)}"></button>`).join('');

    const sel = ui.selection;
    $('.ldm-selection').hidden = !sel;
    if (sel) {
      const noun = sel.axis === 'ends' ? 'End' : 'Pick';
      $('.ldm-sel-title').textContent = sel.from === sel.to
        ? `${noun} ${sel.from + 1}` : `${noun}s ${sel.from + 1}–${sel.to + 1} (${sel.to - sel.from + 1})`;
      $('[data-act=paste]').disabled = !ui.clipboard || ui.clipboard.axis !== sel.axis;
    }
  }

  store.subscribe(repaint);
  store.subscribe((draft) => saved.saveCurrentSoon(draft));
  saved.saveCurrentSoon(store.get());
  new ResizeObserver(() => repaint()).observe(wrap.parentElement);
  repaint();

  // --- Pointer editing -----------------------------------------------------

  let drag = null; // { kind, value, last: {x, y}, anchor }

  const pointAt = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !layout) return;
    const p = pointAt(e);
    const hit = hitTest(store.get(), layout, p.x, p.y);
    if (!hit) return;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    const selecting = ui.tool === 'select' || e.shiftKey || hit.region === 'drawdown';
    if (selecting) {
      drag = { kind: 'select', anchor: hit, start: p, last: p };
      select(hit, hit, p, p);
      return;
    }
    drag = { kind: 'draw', region: hit.region, value: drawValue(store.get(), hit), last: p };
    store.begin();
    applyDraw(hit);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!layout) return;
    const p = pointAt(e);
    const draft = store.get();
    const hit = hitTest(draft, layout, p.x, p.y);
    showReadout(hit);
    if (!drag) return;
    if (drag.kind === 'select') {
      const clamped = hitTest(draft, layout, ...clampToRegion(drag.anchor.region, p));
      if (clamped) select(drag.anchor, clamped, drag.start, p);
      return;
    }
    // Step along the path so a fast drag doesn't skip cells.
    const steps = Math.ceil(Math.hypot(p.x - drag.last.x, p.y - drag.last.y) / (layout.cell / 2));
    for (let i = 1; i <= steps; i++) {
      const x = drag.last.x + ((p.x - drag.last.x) * i) / steps;
      const y = drag.last.y + ((p.y - drag.last.y) * i) / steps;
      const h = hitTest(store.get(), layout, x, y);
      if (h && h.region === drag.region) applyDraw(h);
    }
    drag.last = p;
  });

  const endDrag = () => {
    if (drag?.kind === 'draw') store.end();
    drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { if (!drag) showReadout(null); });

  // What a drag does, decided by the first cell: fill if it was empty, clear if it was filled.
  function drawValue(draft, hit) {
    switch (hit.region) {
      case 'threading': return draft.threading[hit.end - 1] === hit.shaft ? 0 : hit.shaft;
      case 'tieup': return !draft.tieup[hit.shaft - 1][hit.treadle - 1];
      case 'side': return draft.mode === 'liftplan'
        ? !draft.liftplan[hit.pick - 1].includes(hit.shaft)
        : !draft.treadling[hit.pick - 1].includes(hit.treadle);
      default: return ui.color;
    }
  }

  function applyDraw(hit) {
    const v = drag.value;
    switch (hit.region) {
      case 'threading':
        // Filling moves the end to this shaft; clearing empties any end dragged over.
        store.apply(E.setThreading, hit.end - 1, v === 0 ? 0 : hit.shaft);
        break;
      case 'tieup': store.apply(E.setTieup, hit.shaft, hit.treadle, v); break;
      case 'side':
        if (store.get().mode === 'liftplan') store.apply(E.setLift, hit.pick - 1, hit.shaft, v);
        else store.apply(E.setTreadle, hit.pick - 1, hit.treadle, v);
        break;
      case 'warpColors': store.apply(E.setWarpColor, hit.end - 1, ui.color); break;
      case 'weftColors': store.apply(E.setWeftColor, hit.pick - 1, ui.color); break;
      default: break;
    }
  }

  // Keep a selection drag inside the region it started in, so dragging past
  // the edge still extends the selection.
  function clampToRegion(name, p) {
    const r = layout.regions[name];
    return [Math.min(Math.max(p.x, r.x), r.x + r.w - 1), Math.min(Math.max(p.y, r.y), r.y + r.h - 1)];
  }

  function select(a, b, start, p) {
    let axis;
    if (a.region === 'threading' || a.region === 'warpColors') axis = 'ends';
    else if (a.region === 'side' || a.region === 'weftColors') axis = 'picks';
    else if (a.region === 'drawdown') axis = Math.abs(p.y - start.y) > Math.abs(p.x - start.x) ? 'picks' : 'ends';
    else return; // tie-up has no ends or picks
    const key = axis === 'ends' ? 'end' : 'pick';
    const i = a[key] - 1;
    const j = b[key] - 1;
    ui.selection = { axis, from: Math.min(i, j), to: Math.max(i, j) };
    repaint();
  }

  function showReadout(hit) {
    if (!hit) {
      readout.innerHTML = '&nbsp;';
      return;
    }
    const parts = [];
    if (hit.end) parts.push(`End ${hit.end}`);
    if (hit.pick) parts.push(`pick ${hit.pick}`);
    if (hit.shaft) parts.push(`shaft ${hit.shaft}`);
    if (hit.treadle) parts.push(`treadle ${hit.treadle}`);
    const text = parts.join(', ');
    readout.textContent = text.charAt(0).toUpperCase() + text.slice(1);
  }

  let statusTimer = 0;
  function status(message) {
    readout.textContent = message;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => showReadout(null), 4000);
  }

  // --- Actions -------------------------------------------------------------

  const actions = {
    new() {
      const d = createDraft({ shafts: 4, treadles: 4, numEnds: 32, numPicks: 32, palette: store.get().palette });
      store.apply(d);
      ui.savedId = null;
      saved.setCurrentId(null);
      ui.selection = null;
      status('New draft. Undo brings back the previous one.');
    },
    open: () => fileInput.click(),
    mine: () => showMine(),
    keep() {
      const draft = store.get();
      try {
        ui.savedId = saved.saveDraft(draft, ui.savedId);
        saved.setCurrentId(ui.savedId);
        status(`Saved “${draft.meta.title || 'Untitled'}” to My drafts.`);
      } catch (err) {
        status(`Not saved: ${err.message} Download a .wif instead.`);
      }
    },
    wif: () => download(`${fileName()}.wif`, toWif(store.get()), 'text/plain'),
    json: () => download(`${fileName()}.json`, JSON.stringify({ ...store.get(), formatVersion: FORMAT_VERSION }, null, 1), 'application/json'),
    png() {
      // 8px cells plus a grid line, shrunk for very large drafts so the image
      // stays under ~16 million pixels (a 1744-thread draft would be ~1 GB).
      const draft = store.get();
      const pitch = Math.max(1, Math.min(9, Math.floor(Math.sqrt(16_000_000 / Math.max(1, draft.numEnds * draft.numPicks)))));
      const gridLine = pitch >= 4 ? 1 : 0;
      const img = renderDrawdown(draft, { cellSize: pitch - gridLine, gridLine, gridColor: [160, 160, 160] });
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
      c.toBlob((blob) => downloadBlob(`${fileName()}.png`, blob), 'image/png');
    },
    undo: () => store.undo(),
    redo: () => store.redo(),
    'zoom-in': () => zoom(1),
    'zoom-out': () => zoom(-1),
    'add-color'() {
      store.apply(E.addPaletteColor, [128, 128, 128]);
      ui.color = store.get().palette.length - 1;
      repaint();
    },
    'remove-color'() {
      const n = store.get().palette.length;
      if (n <= 1) return;
      store.apply(E.removePaletteColor, ui.color, ui.color === 0 ? 1 : 0);
      ui.color = Math.max(0, ui.color - 1);
    },
    copy() {
      if (!ui.selection) return;
      ui.clipboard = E.copyRange(store.get(), ui.selection.axis, ui.selection);
      status(`Copied ${ui.clipboard.length} ${ui.selection.axis === 'ends' ? 'end' : 'pick'}${ui.clipboard.length === 1 ? '' : 's'}.`);
      repaint();
    },
    paste() {
      const { selection: s, clipboard: clip } = ui;
      if (!s || !clip || clip.axis !== s.axis) return;
      store.apply(E.paste, clip, s.from);
      ui.selection = { axis: s.axis, from: s.from, to: s.from + clip.length - 1 };
    },
    delete() {
      const s = ui.selection;
      if (!s) return;
      const n = s.axis === 'ends' ? store.get().numEnds : store.get().numPicks;
      if (s.to - s.from + 1 >= n) return status('A draft needs at least one end and one pick.');
      store.apply(E.remove, s.axis, s);
      ui.selection = null;
    },
    insert() {
      const s = ui.selection;
      if (!s) return;
      store.apply(E.insert, s.axis, s.from, s.to - s.from + 1);
    },
    repeat() {
      const s = ui.selection;
      if (!s) return;
      const times = Math.min(50, Math.max(1, parseInt($('[data-ui=repeatTimes]').value, 10) || 1));
      store.apply(E.repeat, s.axis, s, times);
    },
    straight() {
      const s = ui.selection;
      if (s) store.apply(s.axis === 'ends' ? E.straightDraw : E.straightTreadling, s);
    },
    point() {
      const s = ui.selection;
      if (s) store.apply(s.axis === 'ends' ? E.pointDraw : E.pointTreadling, s);
    },
    'clear-range'() {
      const s = ui.selection;
      if (!s) return;
      // Keep the colors; only the threading or treadling is cleared.
      const clip = E.copyRange(store.get(), s.axis, s);
      if (s.axis === 'ends') {
        clip.threading = clip.threading.map(() => 0);
      } else {
        clip.treadling = clip.treadling.map(() => []);
        clip.liftplan = clip.liftplan.map(() => []);
      }
      store.apply(E.paste, clip, s.from);
    },
    deselect() {
      ui.selection = null;
      repaint();
    },
    'as-drawn-in': () => store.apply(E.treadleAsDrawnIn),
  };

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !root.contains(btn)) return;
    if (btn.dataset.act && actions[btn.dataset.act]) actions[btn.dataset.act]();
    if (btn.dataset.tool) {
      ui.tool = btn.dataset.tool;
      repaint();
    }
    if (btn.dataset.color !== undefined) {
      ui.color = Number(btn.dataset.color);
      repaint();
    }
  });

  function zoom(dir) {
    ui.cell = Math.min(32, Math.max(3, ui.cell + dir * (ui.cell >= 8 ? 2 : 1)));
    repaint();
  }

  // Panel inputs.
  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.size) {
      store.apply(E.resize, { [el.dataset.size]: el.value });
    } else if (el.dataset.opt === 'mode') {
      store.apply(E.setMode, el.value);
      const d = store.get();
      if (d.mode === 'treadle' && d.treadles > 12) status(`Converting the lift plan needed ${d.treadles} treadles.`);
    } else if (el.dataset.opt) {
      store.apply(E.setOption, el.dataset.opt, el.dataset.opt === 'risingShed' ? el.value === 'true' : el.value);
    } else if (el.dataset.meta) {
      store.apply(E.setMeta, { [el.dataset.meta]: el.value });
    } else if (el.dataset.ui === 'colorEdit') {
      store.end();
    } else if (el.dataset.ui) {
      ui[el.dataset.ui] = el.dataset.ui === 'view' ? el.value : Number(el.value);
      repaint();
    }
  });
  // Live color editing while the picker is open, undone as one step.
  root.addEventListener('input', (e) => {
    if (e.target.dataset.ui !== 'colorEdit') return;
    store.begin();
    store.apply(E.setPaletteColor, ui.color, rgbFromHex(e.target.value));
  });

  // --- Keyboard ------------------------------------------------------------

  document.addEventListener('keydown', (e) => {
    if (!root.isConnected || dialog.open) return;
    if (e.target.closest?.('input, textarea, select')) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    let handled = true;
    if (mod && key === 'z' && !e.shiftKey) store.undo();
    else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) store.redo();
    else if (mod && key === 'c') actions.copy();
    else if (mod && key === 'v') actions.paste();
    else if ((key === 'delete' || key === 'backspace') && ui.selection) actions.delete();
    else if (key === 'escape' && ui.selection) actions.deselect();
    else handled = false;
    if (handled) e.preventDefault();
  });

  // --- Files and saved drafts ----------------------------------------------

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const { draft, warnings } = readDraftFile(await file.text(), file.name);
      if (!draft.meta.title) draft.meta.title = file.name.replace(/\.[^.]+$/, '');
      loadDraft(draft);
      status(warnings.length ? `Opened ${file.name}. ${warnings.length} note(s): ${warnings[0]}` : `Opened ${file.name}.`);
    } catch (err) {
      status(`Could not open ${file.name}: ${err.message}`);
    }
  });

  function loadDraft(draft, savedId = null) {
    ui.selection = null;
    ui.cell = 0;
    ui.savedId = savedId;
    saved.setCurrentId(savedId);
    store.apply(draft);
  }

  function showMine() {
    const list = saved.listDrafts();
    const ul = $('.ldm-mine');
    ul.innerHTML = list.length ? '' : '<li class="ldm-hint">Nothing saved yet. Use Save to keep a draft here.</li>';
    for (const item of list) {
      const li = document.createElement('li');
      li.innerHTML = `<span><strong></strong><br><small></small></span>
        <button type="button" data-open>Open</button> <button type="button" data-remove>Delete</button>`;
      li.querySelector('strong').textContent = item.title || 'Untitled';
      li.querySelector('small').textContent = `${item.draft.shafts} shafts · saved ${new Date(item.saved).toLocaleString()}`;
      li.querySelector('[data-open]').addEventListener('click', () => {
        loadDraft(normalizeDraft(item.draft), item.id);
        dialog.close();
        status(`Opened “${item.title || 'Untitled'}”. Undo brings back the previous draft.`);
      });
      li.querySelector('[data-remove]').addEventListener('click', () => {
        if (!confirm(`Delete “${item.title || 'Untitled'}” from My drafts?`)) return;
        saved.deleteDraft(item.id);
        if (ui.savedId === item.id) ui.savedId = null;
        showMine();
      });
      ul.append(li);
    }
    if (!dialog.open) dialog.showModal();
  }
  // Keep an open "My drafts" list current when another computer or tab saves.
  saved.onDraftsChange(() => {
    if (dialog.open) showMine();
  });

  // Open a library draft named in the URL (designer.html#library=hw-12871), or
  // one handed over by another page (designer.html#import=1).
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('import')) {
    history.replaceState(null, '', location.pathname + location.search);
    const draft = saved.takeImport();
    if (draft) {
      loadDraft(draft);
      status(`Opened “${draft.meta.title || 'Untitled'}”. Undo brings back your previous draft.`);
    }
  }
  const libraryId = params.get('library');
  if (libraryId) {
    history.replaceState(null, '', location.pathname + location.search);
    createLibrary(libraryBase).wifText(libraryId)
      .then((text) => {
        loadDraft(parseWif(text).draft);
        status(`Opened ${store.get().meta.title || libraryId} from the library. Undo brings back your previous draft.`);
      })
      .catch((err) => status(`Could not open library draft ${libraryId}: ${err.message}`));
  }

  function fileName() {
    return (store.get().meta.title || 'draft').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'draft';
  }
}

// A .json file in our format, or WIF text.
export function readDraftFile(text, name = '') {
  const trimmed = text.trimStart();
  if (name.toLowerCase().endsWith('.json') || trimmed.startsWith('{')) {
    return { draft: normalizeDraft(JSON.parse(trimmed)), warnings: [] };
  }
  return parseWif(text);
}

function download(name, text, type) {
  downloadBlob(name, new Blob([text], { type }));
}

function downloadBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const rgbFromHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
