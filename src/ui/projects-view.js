// My Projects: a record of each piece woven. The list (projects.html) shows a
// card per project; a project (projects.html#p=<id>) has tabs for the plan it
// was woven from, measurements at each stage, yarns and wet finishing, a
// journal, and photos. Projects print as a sheet (Save as PDF), download as a
// standalone .html file, or bind together into a book.

import { normalizeDraft } from '../core/draft.js';
import {
  STATUSES, JOURNAL_KINDS, FINISHING_METHODS, WATER_TEMPS, DRYING, statusName, kindName,
  newProject, projectFrom, statusAfter, comparison, factorsForPlan, coverPhoto, newItemId,
} from '../core/project.js';
import { withWarpDefaults } from '../core/warp-plan.js';
import { myProjects as store, currentSnapshot, recoverCurrentProject, WARP_PLAN_KEY } from './my-projects.js';
import { localDrafts } from './my-drafts.js';
import { loadCurrent, loadCurrentId, chooseDraft, setCurrentProject, setNotice } from './saved-drafts.js';
import { paintThumbnail } from './draft-view.js';
import { preparePhoto, imageFiles } from './photo.js';
import { projectDocument, bookDocument, printDocument, downloadDocument, draftImages } from './project-export.js';
import { inches, day, projectSheetHtml, SHEET_CSS } from './project-sheet.js';
import { escapeHtml as e, working, whileWorking } from './html.js';
import * as sync from './sync.js';
import { log } from './debug.js';

const SAVE_DELAY = 2500; // ms after the last change before it goes to Drive
const todayIso = () => new Date().toISOString().slice(0, 10);
const options = (list, value) => list.map(([v, label]) => `<option value="${e(v)}"${v === value ? ' selected' : ''}>${e(label)}</option>`).join('');
const datalist = (id, list) => `<datalist id="${id}">${list.filter(Boolean).map((v) => `<option value="${e(v)}">`).join('')}</datalist>`;
const pct = (f) => (f == null ? '—' : `${Math.round(f * 1000) / 10}%`);

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = value;
}

export function mountProjects(root, { startUrl, designerUrl, warpUrl }) {
  root.classList.add('ldm', 'ldm-projects');
  let leave = () => {}; // tidy up the view being left (and flush the open project)
  let flash = null; // a message for the next project shown

  function route() {
    leave();
    leave = () => {};
    if (!store.signedIn()) {
      showSignIn();
      return;
    }
    const params = new URLSearchParams(location.hash.slice(1));
    const id = params.get('p');
    if (params.has('new')) {
      const snap = currentSnapshot();
      if (snap) {
        const p = newProject(snap, { draftId: loadCurrentId() });
        store.put(p);
        setCurrentProject(p.id);
        store.flush(p.id);
        history.replaceState(null, '', `#p=${p.id}`);
        leave = showProject(p.id) || leave;
        return;
      }
      history.replaceState(null, '', location.pathname);
    }
    if (id) {
      leave = showProject(id) || leave;
    } else {
      leave = showList();
    }
    window.scrollTo(0, 0);
  }
  const signIn = async () => {
    const T = sync.teatherApi();
    if (!T) {
      alert("Google Drive saving isn't available on this page right now. Try again later.");
      return false;
    }
    try {
      await T.signIn();
      return true;
    } catch (err) {
      if (err && !['cancelled', 'timeout'].includes(err.code)) alert(err.message || 'Sign-in did not finish.');
      return false;
    }
  };

  window.addEventListener('hashchange', route);
  sync.teatherApi()?.onAuthChange?.(() => route());
  route();

  // My Projects lives in the weaver's Google Drive, so it needs sign-in.
  function showSignIn() {
    const available = !!sync.teatherApi();
    root.innerHTML = `
      <header class="ldm-proj-head">
        <h2>My Projects</h2>
        <p>A record of what you've woven: the plan, how it measured up, the yarns, the finishing, a journal and photos.</p>
      </header>
      <section class="ldm-proj-signin">
        <p><strong>Sign in first.</strong> My Projects is kept in your own Google Drive, so you need to sign in with “Save to Google Drive” to use it.</p>
        ${available
          ? '<button type="button" class="ldm-primary">Sign in with Google</button>'
          : '<p class="ldm-hint">Google sign-in can’t be reached right now. Check your connection and reload the page.</p>'}
      </section>`;
    root.querySelector('.ldm-proj-signin button')?.addEventListener('click', async (ev) => {
      const done = working(ev.target, 'Signing in…');
      if (await signIn()) route();
      else done();
    });
  }

  // ---------------------------------------------------------------- list

  function showList() {
    const current = loadCurrent();
    let filter = 'all';
    root.innerHTML = `
      <header class="ldm-proj-head">
        <div>
          <h2>My Projects</h2>
          <p class="ldm-hint">A record of what you've woven: the plan, how it measured up, the yarns, the finishing, a journal and photos.</p>
        </div>
      </header>
      <div class="ldm-row ldm-proj-new">
        ${current
          ? `<button type="button" class="ldm-primary" data-act="new-current">New project from my current plan</button>`
          : `<a class="ldm-button" href="${e(startUrl)}">Choose a draft to start a project</a>`}
        <button type="button" data-act="new-draft">New project from a saved draft</button>
        <button type="button" data-act="book">Make a book of my projects</button>
      </div>
      ${current ? `<p class="ldm-hint">Your current plan is “${e(current.meta.title || 'Untitled draft')}” with the settings on the Warp plan page.</p>` : ''}
      <section class="ldm-proj-drafts" hidden>
        <h3>Start from a saved draft</h3>
        <p class="ldm-hint">The project uses your current warp plan settings and loom; adjust them later with “Adjust the plan”.</p>
        <ul class="ldm-mine"></ul>
      </section>
      <form class="ldm-proj-book" hidden>
        <h3>A book of my projects</h3>
        <p class="ldm-hint">A title page, contents, a chapter for each project and an index of the yarns used. Print it and choose “Save as PDF”, or download it as a web page to keep, share or print later.</p>
        <div class="ldm-sizes">
          <label class="ldm-field">Title <input name="title" value="My Weaving Projects"></label>
          <label class="ldm-field">Subtitle or your name <input name="subtitle" placeholder="optional"></label>
        </div>
        <fieldset class="ldm-proj-checks">
          <legend>Include</legend>
          ${STATUSES.map(([k, label]) => `<label class="ldm-inline"><input type="checkbox" name="status" value="${k}"${['finished', 'given'].includes(k) ? ' checked' : ''}> ${e(label)}</label>`).join('')}
        </fieldset>
        <div class="ldm-sizes">
          <label class="ldm-field">Order <select name="order"><option value="old">Oldest first</option><option value="new">Newest first</option></select></label>
          <label class="ldm-field">Photos <select name="photos"><option value="all">All photos</option><option value="cover">Cover photo only</option><option value="none">No photos</option></select></label>
        </div>
        <div class="ldm-row">
          <button type="button" class="ldm-primary" data-act="book-print">Print / Save as PDF</button>
          <button type="button" data-act="book-html">Download HTML</button>
        </div>
        <p class="ldm-hint" data-book-note></p>
      </form>
      <div class="ldm-row ldm-proj-filter">
        <label class="ldm-inline">Show <select data-filter><option value="all">All projects</option>${options(STATUSES)}</select></label>
        <span class="ldm-hint" data-note></span>
      </div>
      <div class="ldm-grid ldm-proj-grid"></div>
      <p class="ldm-status" aria-live="polite"></p>`;

    const $ = (s) => root.querySelector(s);
    const status = $('.ldm-status');
    const note = $('[data-note]');

    function renderCards(list) {
      const grid = $('.ldm-proj-grid');
      const shown = list.filter((p) => filter === 'all' || p.status === filter);
      grid.innerHTML = '';
      if (!list.length) {
        grid.innerHTML = '<p class="ldm-hint">No projects yet. Start one from your current plan, or from the Warp plan page with “Save to My Projects”.</p>';
        return;
      }
      if (!shown.length) grid.innerHTML = '<p class="ldm-hint">None with that status.</p>';
      for (const p of shown) {
        const a = document.createElement('a');
        a.className = 'ldm-card ldm-proj-card';
        a.href = `#p=${encodeURIComponent(p.id)}`;
        a.innerHTML = `<div class="ldm-thumb"><canvas role="img" aria-label="Drawdown"></canvas></div>
          <span class="ldm-card-title"></span>
          <span class="ldm-card-meta"></span>`;
        a.querySelector('.ldm-card-title').textContent = p.title || 'Untitled project';
        a.querySelector('.ldm-card-meta').textContent = `${statusName(p.status)} · ${p.completed ? day(p.completed) : p.started ? day(p.started) : day(p.created)}`;
        const thumb = a.querySelector('.ldm-thumb');
        const canvas = thumb.querySelector('canvas');
        if (p.snapshot?.draft?.numEnds) paintThumbnail(canvas, p.snapshot.draft, 160);
        const cover = coverPhoto(p);
        if (cover) {
          store.photoUrl(cover.thumb).then((url) => {
            if (!url) return;
            const img = new Image();
            img.alt = cover.caption || '';
            img.src = url;
            thumb.replaceChildren(img);
          });
        }
        grid.append(a);
      }
    }

    $('[data-filter]').addEventListener('change', (ev) => {
      filter = ev.target.value;
      renderCards(store.local());
    });

    const actions = {
      'new-current'() {
        const snap = currentSnapshot();
        if (!snap) return;
        const p = newProject(snap, { draftId: loadCurrentId() });
        store.put(p);
        setCurrentProject(p.id);
        store.flush(p.id);
        location.hash = `p=${p.id}`;
      },
      'new-draft'() {
        const sec = $('.ldm-proj-drafts');
        sec.hidden = !sec.hidden;
        const ul = sec.querySelector('ul');
        const drafts = localDrafts();
        ul.innerHTML = drafts.length ? '' : '<li class="ldm-hint">No saved drafts yet. Save one in the designer first.</li>';
        for (const d of drafts) {
          const li = document.createElement('li');
          li.innerHTML = '<span><strong></strong><br><small></small></span> <button type="button">Start a project</button>';
          li.querySelector('strong').textContent = d.title || 'Untitled';
          li.querySelector('small').textContent = `${d.draft.shafts} shafts · saved ${new Date(d.saved).toLocaleDateString()}`;
          li.querySelector('button').addEventListener('click', () => {
            const p = newProject(currentSnapshot(normalizeDraft(d.draft)), { draftId: d.id });
            store.put(p);
            store.flush(p.id);
            location.hash = `p=${p.id}`;
          });
          ul.append(li);
        }
      },
      book() {
        const form = $('.ldm-proj-book');
        form.hidden = !form.hidden;
        if (!form.hidden) form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      },
      'book-print': () => makeBook(true),
      'book-html': () => makeBook(false),
    };
    const onListClick = (ev) => {
      const b = ev.target.closest('[data-act]');
      if (b && actions[b.dataset.act]) actions[b.dataset.act]();
    };
    root.addEventListener('click', onListClick);

    async function makeBook(print) {
      const form = $('.ldm-proj-book');
      const bookNote = form.querySelector('[data-book-note]');
      const statuses = [...form.querySelectorAll('[name=status]:checked')].map((i) => i.value);
      const list = store.local()
        .filter((p) => statuses.includes(p.status))
        .sort((a, b) => (a.completed || a.started || '').localeCompare(b.completed || b.started || '') || a.created - b.created);
      if (form.order.value === 'new') list.reverse();
      if (!list.length) {
        bookNote.textContent = 'No projects have the statuses chosen.';
        return;
      }
      const photos = form.photos.value;
      const title = form.title.value.trim() || 'My Weaving Projects';
      form.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      const doneButton = working(form.querySelector(`[data-act=${print ? 'book-print' : 'book-html'}]`));
      const doneNote = working(bookNote);
      bookNote.textContent = `Putting together ${list.length} project${list.length === 1 ? '' : 's'}…`;
      try {
        const html = await bookDocument(photos === 'none' ? list.map((p) => ({ ...p, photos: [] })) : list, store, {
          title,
          subtitle: form.subtitle.value.trim(),
          allPhotos: photos === 'all',
          onPhoto: (done, total) => { bookNote.textContent = `Fetching photos ${done} of ${total}…`; },
        });
        if (print) printDocument(html);
        else downloadDocument(title, html);
        doneNote();
        bookNote.textContent = print
          ? 'In the print window, choose “Save as PDF” as the printer to keep a PDF.'
          : 'Downloaded. Open the file in any browser to read or print it.';
        if (photos !== 'none' && !store.signedIn() && list.some((p) => p.photos.length)) bookNote.textContent += ' Photos were left out: sign in with “Save to Google Drive” to include them.';
      } catch (err) {
        doneNote();
        bookNote.textContent = `Could not make the book: ${err.message}`;
      } finally {
        doneNote();
        doneButton();
        form.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      }
    }

    renderCards(store.local());
    if (store.signedIn()) {
      const done = working(note, 'Checking your Google Drive…');
      recoverCurrentProject().then(() => store.list()).then((list) => {
        if (!root.contains(note)) return;
        done();
        note.textContent = '';
        renderCards(list);
      });
    } else {
      note.textContent = 'Kept in this browser. Sign in with “Save to Google Drive” to keep projects (and add photos) in your Drive.';
    }
    return () => root.removeEventListener('click', onListClick);
  }

  // ------------------------------------------------------------- project

  function showProject(id) {
    let project = store.get(id);
    if (!project) {
      root.innerHTML = `<p><a class="ldm-back" href="#">← My Projects</a></p><p data-missing>That project isn't in this browser.</p>`;
      if (store.signedIn()) {
        const msg = root.querySelector('[data-missing]');
        const done = working(msg, 'Looking for this project in your Google Drive…');
        store.recover(id, [loadCurrent()?.meta.title || 'Untitled project', ''])
          .then(() => store.list())
          .then(() => {
            if (new URLSearchParams(location.hash.slice(1)).get('p') !== id) return;
            if (store.get(id)) route();
            else {
              done();
              msg.textContent = "That project isn't in this browser or your Google Drive. It may have been deleted.";
            }
          });
      }
      return null;
    }
    let tab = 'overview';
    let timer = 0;
    const shown = new Map(); // photo id -> object URL already on the page (for Ctrl+P)
    let saveState = '';
    let saveBusy = false;

    // ---- saving ----
    const statusEl = () => root.querySelector('[data-save]');
    function showSave(text, busy = false) {
      saveState = text;
      saveBusy = busy;
      const el = statusEl();
      if (el) {
        el.textContent = text;
        el.classList.toggle('ldm-working', busy);
      }
    }
    function changed() {
      project = store.put(project);
      showSave(store.signedIn() ? 'Saving…' : 'Saved in this browser', store.signedIn());
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DELAY);
    }
    async function flush() {
      clearTimeout(timer);
      timer = 0;
      const r = await store.flush(project.id);
      if (r.where === 'drive') showSave('Saved in your Google Drive');
      else if (r.where === 'copy') showSave('This project was changed on another computer, so your changes were saved as a copy in My Projects.');
      else showSave(store.signedIn() ? "Saved in this browser; couldn't reach your Google Drive (will retry)." : 'Saved in this browser');
    }
    const onHide = () => { if (timer) flush(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);

    // ---- page ----
    function render() {
      const p = project;
      const s = p.snapshot ?? {};
      const plan = s.plan;
      const w = withWarpDefaults(s.warpPlan);
      const signedIn = store.signedIn();
      const planned = p.status === 'planned';
      const tabs = [['overview', 'Overview'], ['measure', 'Measurements'], ['yarn', 'Yarn & finishing'], ['journal', `Journal${p.journal.length ? ` (${p.journal.length})` : ''}`], ['photos', `Photos${p.photos.length ? ` (${p.photos.length})` : ''}`]];
      root.innerHTML = `
        <p><a class="ldm-back" href="#">← My Projects</a></p>
        <header class="ldm-proj-top">
          <label class="ldm-proj-title"><span class="ldm-visually-hidden">Project name</span><input data-f="title" value="${e(p.title)}" placeholder="Project name"></label>
          <label class="ldm-inline">Status <select data-f="status">${options(STATUSES, p.status)}</select></label>
          <span class="ldm-hint${saveBusy ? ' ldm-working' : ''}" data-save aria-live="polite">${e(saveState)}</span>
          <div class="ldm-actions">
            <button type="button" data-act="print">Print / Save as PDF</button>
            <button type="button" data-act="html">Download HTML</button>
            <button type="button" data-act="delete">Delete</button>
          </div>
        </header>
        <p class="ldm-hint" data-export-note></p>
        <div class="ldm-tabs" role="tablist" aria-label="Project">${tabs.map(([k, label]) =>
          `<button type="button" role="tab" id="ldm-proj-${k}" aria-controls="ldm-proj-${k}-panel" aria-selected="${tab === k}" tabindex="${tab === k ? 0 : -1}" value="${k}">${e(label)}</button>`).join('')}</div>
        ${panel('overview', overviewHtml(p, s, plan, w, planned))}
        ${panel('measure', measureHtml(p, s))}
        ${panel('yarn', yarnHtml(p))}
        ${panel('journal', journalHtml(p, signedIn))}
        ${panel('photos', photosHtml(p, signedIn))}
        <input type="file" accept="image/*" multiple hidden data-photo-input>`;
      const dd = root.querySelector('[data-dd]');
      if (dd && s.draft?.numEnds) paintThumbnail(dd, s.draft, 220);
      renderCompare();
      loadImages();
    }

    const panel = (k, html) => `<div class="ldm-tabpanel" role="tabpanel" id="ldm-proj-${k}-panel" aria-labelledby="ldm-proj-${k}"${tab === k ? '' : ' hidden'}>${html}</div>`;

    function overviewHtml(p, s, plan, w, planned) {
      const loom = s.loom;
      const fact = (k, v) => (v ? `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>` : '');
      return `
        <div class="ldm-proj-overview">
          <div class="ldm-proj-pics">
            <div data-cover-slot></div>
            ${s.draft?.numEnds ? '<canvas data-dd role="img" aria-label="Drawdown"></canvas>' : ''}
          </div>
          <div class="ldm-proj-main">
            <dl class="ldm-facts">
              ${fact('Draft', s.draft ? `${s.draft.meta?.title || 'Untitled'} · ${s.draft.shafts} shafts` : '')}
              ${fact('Loom', loom?.name)}
              ${fact('Warp', s.warpYarnName)}
              ${fact('Weft', s.weftYarnName)}
              ${fact('Sett', s.epi ? `${s.epi} epi · ${s.ppi} ppi` : '')}
              ${fact('Ends', plan ? String(plan.ends) : '')}
              ${fact('Width in reed', plan ? inches(plan.widthInReed) : '')}
              ${fact('Warp length', plan ? `${Math.round(plan.warpLength / 3.6) / 10} yd` : '')}
              ${fact('Planned size', `${w.pieces} × ${inches(w.finishedWidth)} by ${inches(w.finishedLength)}`)}
            </dl>
            ${p.basedOn ? `<p class="ldm-hint">Based on <a href="#p=${encodeURIComponent(p.basedOn.id)}">${e(p.basedOn.title || 'an earlier project')}</a>.</p>` : ''}
            ${plan ? '' : '<p class="ldm-hint">No warp plan numbers: the sett was missing when this was saved. Use “Adjust the plan” to finish it.</p>'}
            <div class="ldm-sizes">
              <label class="ldm-field">Started <input type="date" data-f="started" value="${e(p.started)}"></label>
              <label class="ldm-field">Finished <input type="date" data-f="completed" value="${e(p.completed)}"></label>
            </div>
            <label class="ldm-field">Tags <input data-f="tags" data-type="tags" value="${e(p.tags.join(', '))}" placeholder="e.g. towels, gift, overshot"></label>
            <label class="ldm-field">Notes <textarea data-f="notes" rows="4" placeholder="What it's for, what you were trying, anything to remember">${e(p.notes)}</textarea></label>
            <label class="ldm-field">Lessons learned <textarea data-f="lessons" rows="3" placeholder="What would you do differently next time?">${e(p.lessons)}</textarea></label>
          </div>
        </div>
        <div class="ldm-row ldm-proj-actions">
          <button type="button" data-act="designer">Open the draft in the designer</button>
          ${planned ? '<button type="button" data-act="adjust">Adjust the plan</button>' : ''}
          <button type="button" data-act="again" class="ldm-primary">Start a new project from this one</button>
        </div>
        <p class="ldm-hint">“Start a new project from this one” keeps the draft, loom, yarns and finishing, and uses this project's measured draw-in, take-up and shrinkage in the new warp plan.</p>
        <p class="ldm-hint" data-act-note></p>`;
    }

    function measureHtml(p, s) {
      const m = p.measurements;
      const f = (k, label, attrs = 'step="0.125"') => `<label class="ldm-field">${label} <input type="number" min="0" ${attrs} data-f="measurements.${k}" data-type="number" value="${m[k] ?? ''}"></label>`;
      return `
        <p class="ldm-hint">Measure in inches. Width across the middle of the cloth; length of one piece, without hems or fringe. On the loom, a contrasting thread woven in at the start and end of each piece makes the length easy to find again later.</p>
        <div class="ldm-proj-stages">
          <fieldset><legend>In the reed</legend>${f('widthInReed', 'Width')}</fieldset>
          <fieldset><legend>On the loom, under tension</legend>${f('widthOnLoom', 'Width at the fell')}${f('lengthWovenOnLoom', 'Length woven')}${f('ppiActual', `Picks per inch${s.ppi ? ` (planned ${s.ppi})` : ''}`, 'step="0.5"')}</fieldset>
          <fieldset><legend>Off the loom, before washing</legend>${f('widthOffLoom', 'Width')}${f('lengthOffLoom', 'Length')}</fieldset>
          <fieldset><legend>After wet finishing</legend>${f('widthFinished', 'Width')}${f('lengthFinished', 'Length')}</fieldset>
        </div>
        <div data-compare></div>
        <div class="ldm-row">
          <button type="button" data-act="apply">Use these in my next warp plan</button>
        </div>
        <p class="ldm-hint" data-apply-note></p>`;
    }

    function renderCompare() {
      const box = root.querySelector('[data-compare]');
      if (!box) return;
      const c = comparison(project);
      const anyMeasured = c.rows.some((r) => r.measured != null) || c.factors.widthOverall != null || c.factors.lengthOverall != null;
      if (!anyMeasured) {
        box.innerHTML = '<p class="ldm-hint">Fill in two stages to see the real draw-in, take-up and shrinkage next to what the plan assumed.</p>';
        return;
      }
      const diff = (r) => (r.measured == null || r.planned == null ? '' : r.measured > r.planned + 0.005 ? 'more than planned' : r.measured < r.planned - 0.005 ? 'less than planned' : 'as planned');
      const f = c.factors;
      box.innerHTML = `
        <table class="ldm-table ldm-proj-compare">
          <tr><th></th><th>Planned</th><th>Measured</th><th></th></tr>
          ${c.rows.map((r) => `<tr><th scope="row">${e(r.label)}</th><td>${pct(r.planned)}</td><td>${pct(r.measured)}</td><td class="ldm-hint">${diff(r)}</td></tr>`).join('')}
          ${c.sizes.map((r) => `<tr><th scope="row">${e(r.label)}</th><td>${inches(r.planned)}</td><td>${r.measured != null ? inches(r.measured) : '—'}</td><td></td></tr>`).join('')}
        </table>
        <p class="ldm-hint">${[
          f.widthOffLoom != null && `Width lost coming off the loom: ${pct(f.widthOffLoom)}.`,
          f.widthInWash != null && `Width lost in the wash: ${pct(f.widthInWash)}.`,
          f.widthOverall != null && `Reed to finished: ${pct(f.widthOverall)} narrower.`,
          f.lengthOverall != null && `Loom to finished: ${pct(f.lengthOverall)} shorter.`,
        ].filter(Boolean).join(' ')}</p>`;
    }

    function yarnHtml(p) {
      const fin = p.finishing;
      const row = (y, i) => `<tr>
          <td><select data-f="yarns.${i}.role" aria-label="For">${options([['warp', 'Warp'], ['weft', 'Weft'], ['other', 'Other']], y.role)}</select></td>
          <td><input data-f="yarns.${i}.name" value="${e(y.name)}" aria-label="Yarn" placeholder="8/2 cotton"></td>
          <td><input data-f="yarns.${i}.brand" value="${e(y.brand)}" aria-label="Brand" placeholder="maker"></td>
          <td class="ldm-proj-color"><input type="color" data-f="yarns.${i}.colorHex" value="${e(y.colorHex || '#ffffff')}" aria-label="Color swatch"><input data-f="yarns.${i}.colorName" value="${e(y.colorName)}" aria-label="Color name" placeholder="color"></td>
          <td><input data-f="yarns.${i}.dyeLot" value="${e(y.dyeLot)}" aria-label="Dye lot" class="ldm-short-in"></td>
          <td class="ldm-hint">${y.plannedYards ? `${Number(y.plannedYards).toLocaleString()} yd` : ''}</td>
          <td><input data-f="yarns.${i}.used" value="${e(y.used)}" aria-label="Used" placeholder="yd or g" class="ldm-short-in"></td>
          <td><input data-f="yarns.${i}.leftover" value="${e(y.leftover)}" aria-label="Left over" class="ldm-short-in"></td>
          <td><input data-f="yarns.${i}.cost" value="${e(y.cost)}" aria-label="Cost" class="ldm-short-in"></td>
          <td><button type="button" data-del-yarn="${i}" aria-label="Remove this yarn" title="Remove">×</button></td>
        </tr>`;
      return `
        <h3>Yarns</h3>
        <div class="ldm-scroll">
          <table class="ldm-table ldm-proj-yarns">
            <tr><th>For</th><th>Yarn</th><th>Brand</th><th>Color</th><th>Dye lot</th><th>Planned</th><th>Used</th><th>Left over</th><th>Cost</th><th></th></tr>
            ${p.yarns.map(row).join('')}
          </table>
        </div>
        <div class="ldm-row"><button type="button" data-act="add-yarn">Add a yarn</button></div>
        <h3>Wet finishing</h3>
        <div class="ldm-proj-finish">
          <label class="ldm-field">Method <input list="ldm-fin-method" data-f="finishing.method" value="${e(fin.method)}"></label>
          <label class="ldm-field">Water <input list="ldm-fin-water" data-f="finishing.waterTemp" value="${e(fin.waterTemp)}"></label>
          <label class="ldm-field">Agitation <input data-f="finishing.agitation" value="${e(fin.agitation)}" placeholder="gentle, by hand, gentle cycle…"></label>
          <label class="ldm-field">Minutes <input type="number" min="0" data-f="finishing.minutes" value="${e(fin.minutes)}"></label>
          <label class="ldm-field">Drying <input list="ldm-fin-dry" data-f="finishing.drying" value="${e(fin.drying)}"></label>
          <label class="ldm-field">Pressing <input data-f="finishing.pressing" value="${e(fin.pressing)}" placeholder="hot iron while damp…"></label>
          <label class="ldm-field">Hems or fringe <input data-f="finishing.edges" value="${e(fin.edges)}" placeholder="hemstitched, twisted fringe…"></label>
        </div>
        <label class="ldm-field">Finishing notes <textarea data-f="finishing.notes" rows="2">${e(fin.notes)}</textarea></label>
        ${datalist('ldm-fin-method', FINISHING_METHODS)}${datalist('ldm-fin-water', WATER_TEMPS)}${datalist('ldm-fin-dry', DRYING)}
        <h3>Time and cost</h3>
        <div class="ldm-proj-finish">
          <label class="ldm-field">Hours <input data-f="hours" value="${e(p.hours)}" placeholder="warping and weaving"></label>
          <label class="ldm-field">Cost of materials <input data-f="cost" value="${e(p.cost)}"></label>
          <label class="ldm-field">Made for <input data-f="recipient" value="${e(p.recipient)}" placeholder="a gift, a sale, ourselves…"></label>
        </div>`;
    }

    function journalHtml(p, signedIn) {
      const entries = [...p.journal].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return `
        <form class="ldm-proj-entry" data-entry-form>
          <div class="ldm-sizes">
            <label class="ldm-field">Date <input type="date" name="date" value="${todayIso()}" required></label>
            <label class="ldm-field">What happened <select name="kind">${options(JOURNAL_KINDS.map(([k, l]) => [k, l]), 'note')}</select></label>
          </div>
          <label class="ldm-field">Notes <textarea name="text" rows="3" placeholder="Tension trouble, a broken end, how the beat felt, a change you made…"></textarea></label>
          ${signedIn
            ? '<label class="ldm-field">Photos <input type="file" name="photos" accept="image/*" multiple></label>'
            : '<p class="ldm-hint">Sign in with “Save to Google Drive” to add photos to the journal.</p>'}
          <div class="ldm-row"><button type="submit" class="ldm-primary">Add to the journal</button></div>
        </form>
        <ol class="ldm-proj-journal">
          ${entries.map((j) => `<li data-entry="${e(j.id)}">
            <h4>${e(day(j.date))} · ${e(kindName(j.kind))} <button type="button" class="ldm-link" data-del-entry="${e(j.id)}">Delete</button></h4>
            ${j.text ? `<p>${e(j.text).replace(/\n/g, '<br>')}</p>` : ''}
            ${(j.photoIds ?? []).length ? `<div class="ldm-proj-thumbs">${j.photoIds.map((pid) => `<button type="button" class="ldm-proj-thumb" data-photo="${e(pid)}" aria-label="View photo"><img alt=""></button>`).join('')}</div>` : ''}
          </li>`).join('') || '<li class="ldm-hint">Nothing yet. Record each stage (warping, threading, weaving, cutting off, washing) as you go.</li>'}
        </ol>`;
    }

    function photosHtml(p, signedIn) {
      if (!signedIn) {
        return `<p>Photos are kept in your own Google Drive.</p>
          <div class="ldm-row"><button type="button" class="ldm-primary" data-act="signin">Sign in to add photos</button></div>
          ${p.photos.length ? `<p class="ldm-hint">This project has ${p.photos.length} photo${p.photos.length === 1 ? '' : 's'}; sign in to see them.</p>` : ''}`;
      }
      return `
        <div class="ldm-proj-drop" data-drop>
          <button type="button" class="ldm-primary" data-act="add-photos">Add photos</button>
          <span class="ldm-hint">or drop or paste pictures here. They're made smaller and saved in your Google Drive.</span>
        </div>
        <div class="ldm-proj-gallery">
          ${p.photos.map((ph) => `<figure data-photo-card="${e(ph.id)}">
            <button type="button" class="ldm-proj-thumb" data-photo="${e(ph.id)}" aria-label="View photo"><img alt="${e(ph.caption)}"></button>
            <input data-caption="${e(ph.id)}" value="${e(ph.caption)}" placeholder="Caption" aria-label="Caption">
            <div class="ldm-row">
              <label class="ldm-inline"><input type="radio" name="cover" value="${e(ph.id)}"${coverPhoto(p)?.id === ph.id ? ' checked' : ''}> Cover</label>
              <button type="button" class="ldm-link" data-del-photo="${e(ph.id)}">Delete</button>
            </div>
          </figure>`).join('')}
        </div>
        <dialog class="ldm-proj-viewer"><img alt=""><form method="dialog"><span class="ldm-hint" data-viewer-note></span><button>Close</button></form></dialog>`;
    }

    // Thumbnails and the cover, fetched from Drive.
    function loadImages() {
      for (const btn of root.querySelectorAll('[data-photo]')) {
        const ph = project.photos.find((x) => x.id === btn.dataset.photo);
        if (!ph) { btn.remove(); continue; }
        btn.classList.add('ldm-working');
        store.photoUrl(ph.thumb).then((url) => {
          btn.classList.remove('ldm-working');
          if (!url) return;
          btn.querySelector('img').src = url;
          if (!shown.has(ph.id)) shown.set(ph.id, url);
        });
      }
      const slot = root.querySelector('[data-cover-slot]');
      const cover = coverPhoto(project);
      if (slot && cover) {
        slot.innerHTML = '<p class="ldm-hint ldm-working">Loading the cover photo…</p>';
        store.photoUrl(cover.file).then((url) => {
          slot.innerHTML = '';
          if (!url) return;
          slot.innerHTML = `<figure class="ldm-proj-cover"><img alt="${e(cover.caption)}"></figure>`;
          slot.querySelector('img').src = url;
          shown.set(cover.id, url);
        });
      }
    }

    async function viewPhoto(id) {
      const ph = project.photos.find((x) => x.id === id);
      if (!ph) return;
      let dlg = root.querySelector('.ldm-proj-viewer');
      if (!dlg) {
        dlg = document.createElement('dialog');
        dlg.className = 'ldm-proj-viewer';
        dlg.innerHTML = '<img alt=""><form method="dialog"><span class="ldm-hint" data-viewer-note></span><button>Close</button></form>';
        root.append(dlg);
      }
      const img = dlg.querySelector('img');
      img.alt = ph.caption || '';
      img.src = (await store.photoUrl(ph.thumb)) || '';
      dlg.showModal();
      const done = working(dlg.querySelector('[data-viewer-note]'), 'Loading the full-size photo…');
      const full = await store.photoUrl(ph.file);
      done();
      dlg.querySelector('[data-viewer-note]').textContent = '';
      if (full) img.src = full;
    }

    // ---- photos ----
    async function addPhotos(files, { entry = null } = {}) {
      if (!files.length) return [];
      const note = root.querySelector('[data-export-note]');
      const added = [];
      const doneNote = working(note);
      const doneButton = working(root.querySelector('[data-act=add-photos]'));
      const failed = [];
      for (const [i, file] of files.entries()) {
        note.textContent = `Adding photo ${i + 1} of ${files.length}…`;
        try {
          const ph = await store.uploadPhoto(project.id, await preparePhoto(file), { caption: entry ? '' : file.name.replace(/\.[^.]+$/, '').replace(/^(IMG|DSC|PXL)[_-]?\d.*$/i, '') });
          project.photos.push(ph);
          added.push(ph);
        } catch (err) {
          failed.push(`Could not add ${file.name}: ${err.message}`);
          log('projects', `photo upload failed: ${err?.message ?? err}`);
        }
      }
      doneNote();
      doneButton();
      note.textContent = [added.length && !entry ? `Added ${added.length} photo${added.length === 1 ? '' : 's'}.` : '', ...failed].filter(Boolean).join(' ');
      if (added.length) changed();
      return added;
    }

    // ---- events ----
    function onInput(ev) {
      const el = ev.target;
      if (el.dataset.caption) {
        const ph = project.photos.find((x) => x.id === el.dataset.caption);
        if (ph) { ph.caption = el.value; changed(); }
        return;
      }
      if (el.name === 'cover' && el.type === 'radio') {
        project.photos.forEach((ph) => { ph.cover = ph.id === el.value; });
        changed();
        const slot = root.querySelector('[data-cover-slot]');
        if (slot) slot.innerHTML = '';
        loadImages();
        return;
      }
      const path = el.dataset.f;
      if (!path) return;
      let v = el.value;
      if (el.dataset.type === 'number') v = v === '' ? null : Math.max(0, Number(v) || 0);
      if (el.dataset.type === 'tags') v = v.split(',').map((t) => t.trim()).filter(Boolean);
      setPath(project, path, v);
      if (path === 'status' && ['finished', 'given'].includes(v) && !project.completed) {
        project.completed = todayIso();
        const c = root.querySelector('[data-f=completed]');
        if (c) c.value = project.completed;
      }
      if (path.startsWith('measurements.')) renderCompare();
      changed();
    }
    root.addEventListener('input', onInput);
    function onChange(ev) {
      if (ev.target.matches('[data-photo-input]')) {
        const files = [...ev.target.files];
        ev.target.value = '';
        addPhotos(files).then(render);
      } else if (ev.target.matches('[data-f=status]')) {
        render(); // "Adjust the plan" is only for planned projects
      }
    }
    root.addEventListener('change', onChange);

    const actions = {
      async print(btn) {
        await whileWorking(btn, () => exportDoc(true));
      },
      async html(btn) {
        await whileWorking(btn, () => exportDoc(false));
      },
      async delete(btn) {
        if (!confirm(`Delete “${project.title || 'this project'}”${project.photos.length ? ` and its ${project.photos.length} photo${project.photos.length === 1 ? '' : 's'}` : ''}? This can't be undone.`)) return;
        clearTimeout(timer);
        timer = 0;
        working(btn, 'Deleting…');
        await store.remove(project.id);
        location.hash = '';
      },
      async designer(btn) {
        const done = working(btn, 'Opening…');
        try {
          await chooseDraft(normalizeDraft(project.snapshot.draft), project.draftId);
          if (project.status === 'planned') setCurrentProject(project.id);
          setNotice(`Now working on the draft from your project “${project.title}”.`);
          location.href = designerUrl;
        } catch (err) {
          done();
          actNote(`Could not open the draft: ${err.message}`);
        }
      },
      async adjust(btn) {
        if (!confirm('Make this project\'s draft and warp settings your current plan, to change them on the Warp plan page?')) return;
        const done = working(btn, 'Opening…');
        try {
          await usePlan(project);
          location.href = warpUrl;
        } catch (err) {
          done();
          actNote(`Could not open the plan: ${err.message}`);
        }
      },
      async again(btn) {
        if (!confirm('Start a new project with this draft, loom, yarns and finishing? Its draft and warp settings become your current plan.')) return;
        const done = working(btn, 'Starting the new project…');
        const next = projectFrom(project);
        try {
          store.put(next);
          await usePlan(next);
          store.flush(next.id);
          flash = `New project started from “${project.title}”, using its measured shrinkage. It's now your current plan; check the sizes and `;
          location.hash = `p=${next.id}`;
        } catch (err) {
          done();
          actNote(`Could not start the new project: ${err.message}`);
        }
      },
      apply() {
        const f = factorsForPlan(project.measurements);
        const note = root.querySelector('[data-apply-note]');
        if (!Object.keys(f).length) {
          note.textContent = 'Fill in at least two stages first (for example on the loom and after wet finishing).';
          return;
        }
        sync.set(WARP_PLAN_KEY, { ...withWarpDefaults(sync.get(WARP_PLAN_KEY)), ...f });
        const names = { drawIn: 'draw-in', shrinkWidth: 'width shrinkage', takeUp: 'take-up', shrinkLength: 'length shrinkage' };
        note.innerHTML = `Your warp plan now uses ${Object.entries(f).map(([k, v]) => `${names[k]} ${pct(v)}`).join(', ')}. <a href="${e(warpUrl)}">Open the warp plan</a>`;
      },
      'add-yarn'() {
        project.yarns.push({ id: newItemId(), role: 'other', name: '', yarnId: '', colorHex: '#ffffff', colorName: '', brand: '', dyeLot: '', plannedYards: '', used: '', leftover: '', cost: '' });
        changed();
        render();
        root.querySelector(`[data-f="yarns.${project.yarns.length - 1}.name"]`)?.focus();
      },
      'add-photos'() {
        root.querySelector('[data-photo-input]').click();
      },
      async signin(btn) {
        const done = working(btn, 'Signing in…');
        if (await signIn()) render();
        else done();
      },
    };

    function actNote(text, warpLink = false) {
      const el = root.querySelector('[data-act-note]');
      if (!el) return;
      el.textContent = text;
      if (warpLink) {
        const a = document.createElement('a');
        a.href = warpUrl;
        a.textContent = 'open the warp plan';
        el.append(a, '.');
      }
    }

    async function usePlan(p) {
      await chooseDraft(normalizeDraft(p.snapshot.draft), p.draftId);
      setCurrentProject(p.id);
      const onHand = withWarpDefaults(sync.get(WARP_PLAN_KEY)).onHand;
      sync.set(WARP_PLAN_KEY, { ...withWarpDefaults(p.snapshot.warpPlan), onHand });
    }

    async function exportDoc(print) {
      const note = root.querySelector('[data-export-note]');
      const done = working(note, 'Preparing the project sheet…');
      try {
        const html = await projectDocument(project, store, {
          onPhoto: (done, total) => { note.textContent = `Fetching photos ${done} of ${total}…`; },
        });
        if (print) printDocument(html);
        else downloadDocument(project.title, html);
        done();
        note.textContent = print ? 'In the print window, choose “Save as PDF” as the printer to keep a PDF.' : 'Downloaded. Open the file in any browser to read or print it.';
        if (project.photos.length && !store.signedIn()) note.textContent += ' Photos were left out: sign in to include them.';
      } catch (err) {
        done();
        note.textContent = `Could not make the sheet: ${err.message}`;
      }
    }

    async function onClick(ev) {
      const tabBtn = ev.target.closest('[role=tab]');
      if (tabBtn && root.contains(tabBtn)) {
        tab = tabBtn.value;
        for (const t of root.querySelectorAll('[role=tab]')) {
          const on = t.value === tab;
          t.setAttribute('aria-selected', String(on));
          t.tabIndex = on ? 0 : -1;
          root.querySelector(`#${t.getAttribute('aria-controls')}`).hidden = !on;
        }
        return;
      }
      const act = ev.target.closest('[data-act]');
      if (act && actions[act.dataset.act]) {
        actions[act.dataset.act](act);
        return;
      }
      const delYarn = ev.target.closest('[data-del-yarn]');
      if (delYarn) {
        project.yarns.splice(Number(delYarn.dataset.delYarn), 1);
        changed();
        render();
        return;
      }
      const delEntry = ev.target.closest('[data-del-entry]');
      if (delEntry) {
        if (!confirm('Delete this journal entry?')) return;
        project.journal = project.journal.filter((j) => j.id !== delEntry.dataset.delEntry);
        changed();
        render();
        return;
      }
      const delPhoto = ev.target.closest('[data-del-photo]');
      if (delPhoto) {
        const ph = project.photos.find((x) => x.id === delPhoto.dataset.delPhoto);
        if (!ph || !confirm('Delete this photo?')) return;
        project.photos = project.photos.filter((x) => x !== ph);
        for (const j of project.journal) j.photoIds = (j.photoIds ?? []).filter((pid) => pid !== ph.id);
        changed();
        store.removePhoto(project.id, ph);
        render();
        return;
      }
      const photo = ev.target.closest('[data-photo]');
      if (photo) viewPhoto(photo.dataset.photo);
    }
    root.addEventListener('click', onClick);

    function onKey(ev) {
      const t = ev.target.closest('[role=tab]');
      if (!t || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
      const all = [...t.parentElement.children];
      const i = all.indexOf(t);
      const to = all[({ ArrowLeft: (i - 1 + all.length) % all.length, ArrowRight: (i + 1) % all.length, Home: 0, End: all.length - 1 })[ev.key]];
      ev.preventDefault();
      to.focus();
      to.click();
    }
    root.addEventListener('keydown', onKey);

    async function onSubmit(ev) {
      const form = ev.target.closest('[data-entry-form]');
      if (!form) return;
      ev.preventDefault();
      const files = form.photos ? [...form.photos.files] : [];
      const entry = { id: newItemId(), date: form.date.value || todayIso(), kind: form.kind.value, text: form.text.value.trim(), photoIds: [] };
      if (!entry.text && !files.length && entry.kind === 'note') return;
      working(form.querySelector('[type=submit]'), files.length ? `Adding ${files.length === 1 ? 'the photo' : `${files.length} photos`} and the entry…` : 'Adding…');
      const added = await addPhotos(files, { entry });
      entry.photoIds = added.map((ph) => ph.id);
      project.journal.push(entry);
      const before = project.status;
      project.status = statusAfter(project.status, entry.kind);
      if (project.status !== before && ['finished', 'given'].includes(project.status) && !project.completed) project.completed = entry.date;
      if (entry.kind === 'started' && !project.started) project.started = entry.date;
      changed();
      render();
    }
    root.addEventListener('submit', onSubmit);

    function dropTarget(ev) {
      return tab === 'photos' && store.signedIn();
    }
    function onDragOver(ev) {
      if (dropTarget(ev) && [...(ev.dataTransfer?.types ?? [])].includes('Files')) ev.preventDefault();
    }
    function onDrop(ev) {
      if (!dropTarget(ev)) return;
      const files = imageFiles(ev.dataTransfer);
      if (!files.length) return;
      ev.preventDefault();
      addPhotos(files).then(render);
    }
    function onPaste(ev) {
      if (!dropTarget(ev) || ev.target.closest?.('input, textarea')) return;
      const files = imageFiles(ev.clipboardData);
      if (!files.length) return;
      ev.preventDefault();
      addPhotos(files).then(render);
    }
    // Printing the page itself (Ctrl+P) prints the project sheet, not the form.
    function onBeforePrint() {
      if (!document.querySelector('style[data-sheet-css]')) {
        const style = document.createElement('style');
        style.media = 'print';
        style.dataset.sheetCss = '';
        style.textContent = SHEET_CSS;
        document.head.append(style);
      }
      let box = root.querySelector('.ldm-proj-print');
      if (!box) {
        box = document.createElement('div');
        box.className = 'ldm-proj-print';
        root.append(box);
      }
      box.innerHTML = projectSheetHtml(project, { images: { ...draftImages(project.snapshot?.draft), wif: null, photos: Object.fromEntries(shown) } });
      root.classList.add('ldm-printing');
    }
    const onAfterPrint = () => root.classList.remove('ldm-printing');
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);

    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);
    document.addEventListener('paste', onPaste);

    render();
    if (flash) {
      actNote(flash, true);
      flash = null;
    }
    // Pick up a newer version from Drive (and upload anything waiting).
    if (store.signedIn()) {
      store.list().then(() => {
        const fresh = store.get(id);
        if (fresh && fresh.updated > project.updated && !timer) {
          project = fresh;
          render();
        }
      });
    }

    return () => {
      if (timer) flush();
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
      root.classList.remove('ldm-printing');
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onChange);
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKey);
      root.removeEventListener('submit', onSubmit);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('drop', onDrop);
    };
  }
}
