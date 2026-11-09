// Step 1, "Choose a draft": every way to get the draft the rest of the steps
// work on. Browse the library, pick one of My drafts, open a .wif or .json
// file, read one from a picture, ask an AI, or start blank. Whatever is chosen
// becomes the working draft (saved-drafts.js) and opens in the designer.

import { createDraft, normalizeDraft } from '../core/draft.js';
import { readDraftFile } from './editor-view.js';
import * as saved from './saved-drafts.js';
import { paintThumbnail } from './draft-view.js';
import { teatherApi } from './sync.js';
import { escapeHtml, working } from './html.js';
import { log } from './debug.js';

const isSignedIn = () => !!teatherApi()?.isSignedIn();

export function mountStart(root, { libraryUrl, designerUrl, aiUrl, imageToWifUrl }) {
  const current = saved.loadCurrent();

  root.classList.add('ldm', 'ldm-start');
  root.innerHTML = `
    <h2>Choose a draft</h2>
    <p class="ldm-hint">Everything else (designing, setting up your loom, planning the warp) works on the draft you choose here.</p>
    ${current ? `
      <section class="ldm-continue">
        <canvas role="img" aria-label="Drawdown of your current draft"></canvas>
        <div>
          <h3>Keep working on “${escapeHtml(current.meta.title || 'Untitled draft')}”</h3>
          <p class="ldm-hint">${current.shafts} shafts · ${current.numEnds} ends × ${current.numPicks} picks</p>
          <a class="ldm-button ldm-primary" href="${escapeHtml(designerUrl)}">Continue</a>
        </div>
      </section>` : ''}
    <div class="ldm-choices">
      ${libraryUrl ? `<a class="ldm-choice" href="${escapeHtml(libraryUrl)}"><strong>Browse the library</strong><span>Thousands of historical drafts from public-domain weaving books.</span></a>` : ''}
      <button type="button" class="ldm-choice" data-act="mine"><strong>My drafts</strong><span>Drafts you've saved, in this browser or your Google Drive.</span></button>
      <button type="button" class="ldm-choice" data-act="open"><strong>Open a file</strong><span>A .wif file from any weaving program, or a Loomination .json file.</span></button>
      ${imageToWifUrl ? `<a class="ldm-choice" href="${escapeHtml(imageToWifUrl)}"><strong>From a picture</strong><span>Read a draft from a clean image of a drawdown.</span></a>` : ''}
      ${aiUrl ? `<a class="ldm-choice" href="${escapeHtml(aiUrl)}"><strong>Ask your AI</strong><span>Describe what you want to make and let a chat AI suggest drafts.</span></a>` : ''}
      <button type="button" class="ldm-choice" data-act="blank"><strong>Start blank</strong><span>An empty 4-shaft draft to design from scratch.</span></button>
    </div>
    <section class="ldm-mine-section" hidden>
      <h3>My drafts</h3>
      <p class="ldm-hint" data-mine-note></p>
      <ul class="ldm-mine"></ul>
    </section>
    <p class="ldm-status" aria-live="polite"></p>
    <input type="file" accept=".wif,.json,.txt" hidden>`;

  const $ = (sel) => root.querySelector(sel);
  const status = $('.ldm-status');
  const fileInput = $('input[type=file]');
  const mine = $('.ldm-mine-section');
  if (current) paintThumbnail($('.ldm-continue canvas'), current, 96);

  // Make it the working draft and go on to the designer.
  async function use(draft, id = null) {
    // Already the working draft (perhaps with newer changes): just carry on.
    if (id && id === saved.loadCurrentId() && current) {
      location.href = designerUrl;
      return;
    }
    try {
      const kept = await saved.chooseDraft(draft, id);
      log('draft', `chose "${draft.meta.title || 'untitled'}"${kept ? `; kept "${kept}" in My drafts` : ''}`);
      saved.setNotice(`Now working on “${draft.meta.title || 'Untitled draft'}”.${kept ? ` Your previous draft, “${kept}”, is in My drafts.` : ''}`);
      location.href = designerUrl;
    } catch (err) {
      status.textContent = `Could not switch drafts: ${err.message}`;
    }
  }

  const actions = {
    open: () => fileInput.click(),
    mine: () => showMine(),
    blank() {
      const d = createDraft({ shafts: 4, treadles: 4, numEnds: 32, numPicks: 32, palette: [[246, 241, 228], [38, 70, 120]] });
      d.meta.title = 'New draft';
      use(d);
    },
  };
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (btn && actions[btn.dataset.act]) actions[btn.dataset.act]();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const { draft } = readDraftFile(await file.text(), file.name);
      if (!draft.meta.title) draft.meta.title = file.name.replace(/\.[^.]+$/, '');
      use(draft);
    } catch (err) {
      status.textContent = `Could not open ${file.name}: ${err.message}`;
    }
  });

  // My drafts shows this browser's copies at once, then checks Drive.
  async function showMine() {
    const note = $('[data-mine-note]');
    mine.hidden = false;
    renderMine(saved.localDrafts());
    mine.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (!isSignedIn()) {
      note.textContent = 'Saved in this browser. Sign in with "Save to Google Drive" to keep them in your Drive as .wif files.';
      return;
    }
    const done = working(note, 'Checking your Google Drive…');
    const list = await saved.listDrafts();
    done();
    note.textContent = 'Each draft is a .wif file in the Loomination folder of your Google Drive.';
    renderMine(list);
  }

  function renderMine(list) {
    const ul = $('.ldm-mine');
    ul.innerHTML = list.length ? '' : '<li class="ldm-hint">Nothing saved yet. Use Save in the designer to keep a draft here.</li>';
    for (const item of list) {
      const li = document.createElement('li');
      li.innerHTML = `<span><strong></strong><br><small></small></span>
        <button type="button" data-use>Use this draft</button> <button type="button" data-remove>Delete</button>`;
      li.querySelector('strong').textContent = item.title || 'Untitled';
      li.querySelector('small').textContent = `${item.draft.shafts} shafts · saved ${new Date(item.saved).toLocaleString()}${item.pending ? ' · not in Drive yet' : ''}`;
      li.querySelector('[data-use]').addEventListener('click', () => use(normalizeDraft(item.draft), item.id));
      li.querySelector('[data-remove]').addEventListener('click', async () => {
        if (!confirm(`Delete “${item.title || 'Untitled'}” from My drafts?`)) return;
        await saved.deleteDraft(item.id);
        if (saved.loadCurrentId() === item.id) saved.setCurrentId(null);
        renderMine(saved.localDrafts());
      });
      ul.append(li);
    }
  }

  // Signed in: upload drafts saved while offline or signed out. Quietly.
  if (isSignedIn()) saved.listDrafts();
}
