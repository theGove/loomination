// Library browser: filters over the index shards, a grid of drafts with
// drawdown thumbnails, and a detail view of one draft.
//
// State lives in the URL hash so filtered lists and drafts can be linked to:
//   #maxShafts=4&threading=point      a filtered list
//   #draft=hw-12871&maxShafts=4       one draft (the list filter is kept for Back)

import { parseWif } from '../core/wif.js';
import { createLibrary, filterDrafts, filterFromParams, filterToParams, DEFAULT_FILTER } from './library-data.js';
import { layoutDraft, paintDraft, paintThumbnail, hitTest } from './draft-view.js';
import { escapeHtml } from './html.js';

const PAGE_SIZE = 60;

export function mountLibrary(root, { libraryBase, designerUrl, loomUrl, warpUrl }) {
  const lib = createLibrary(libraryBase);
  const parsed = new Map(); // id -> Promise<{ draft, warnings }>
  const loadDraft = (id) => {
    if (!parsed.has(id)) parsed.set(id, lib.wifText(id).then(parseWif));
    return parsed.get(id);
  };

  root.classList.add('ldm', 'ldm-library');
  root.innerHTML = `
    <form class="ldm-filters" role="search">
      <label class="ldm-search">Search
        <input type="search" name="query" placeholder="Title, name, book or author">
      </label>
      <label>Shafts <select name="maxShafts"></select></label>
      <label>Treadles <select name="maxTreadles"></select></label>
      <label>Threading <select name="threading">
        <option value="">Any</option><option value="straight">Straight draw</option><option value="point">Point draw</option>
      </select></label>
      <label>Longest float <select name="maxFloat"></select></label>
      <label>Book <select name="book"><option value="0">All books</option></select></label>
      <label>Sort <select name="sort">
        <option value="book">Book</option><option value="shafts">Shafts</option><option value="size">Repeat size</option>
      </select></label>
    </form>
    <p class="ldm-status" aria-live="polite"></p>
    <div class="ldm-grid"></div>
    <button type="button" class="ldm-more" hidden>Show more</button>
    <section class="ldm-detail" hidden></section>`;

  const $ = (sel) => root.querySelector(sel);
  const form = $('.ldm-filters');
  const status = $('.ldm-status');
  const grid = $('.ldm-grid');
  const more = $('.ldm-more');
  const detail = $('.ldm-detail');

  const options = (select, pairs) => {
    select.innerHTML = pairs.map(([v, label]) => `<option value="${v}">${escapeHtml(label)}</option>`).join('');
  };
  options(form.maxTreadles, [[0, 'Any'], ...[2, 4, 6, 8, 10, 12].map((n) => [n, `Up to ${n}`])]);
  options(form.maxFloat, [[0, 'Any'], ...[3, 4, 5, 7, 9].map((n) => [n, `Up to ${n}`])]);

  let books = new Map();
  let filter = { ...DEFAULT_FILTER };
  let results = [];
  let shown = 0;
  let listedFor = null; // filter key the grid was last built for

  const thumbObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      thumbObserver.unobserve(entry.target);
      const canvas = entry.target;
      loadDraft(canvas.dataset.id)
        .then(({ draft }) => paintThumbnail(canvas, draft, 160))
        .catch(() => canvas.classList.add('ldm-missing'));
    }
  }, { rootMargin: '200px' });

  const ready = Promise.all([lib.summary(), lib.books()]).then(([summary, bookMap]) => {
    books = bookMap;
    const maxShafts = Math.max(...Object.keys(summary.shards).map(Number));
    options(form.maxShafts, [[0, 'Any'], ...range(2, Math.max(maxShafts, 2)).map((n) => [n, `Up to ${n}`])]);
    const listed = [...books.values()].filter((b) => b.drafts > 0)
      .sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
    options(form.book, [[0, 'All books'], ...listed.map((b) => [b.id, `${b.title} (${b.date})`])]);
  });

  form.addEventListener('input', () => {
    const data = new FormData(form);
    filter = filterFromParams(new URLSearchParams([...data].filter(([, v]) => v !== '' && v !== '0')));
    history.replaceState(null, '', `#${filterToParams(filter)}`);
    showList();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  more.addEventListener('click', () => renderPage());
  window.addEventListener('hashchange', route);
  ready.then(route, (err) => { status.textContent = `Could not load the library: ${err.message}`; });

  function route() {
    const params = new URLSearchParams(location.hash.slice(1));
    filter = filterFromParams(params);
    for (const [key, value] of Object.entries(filter)) if (form[key]) form[key].value = String(value);
    const id = params.get('draft');
    if (id) showDetail(id);
    else showList();
  }

  async function showList() {
    detail.hidden = true;
    form.hidden = false;
    grid.hidden = false;
    const key = filterToParams(filter).toString();
    if (key === listedFor) {
      status.hidden = false;
      more.hidden = shown >= results.length;
      return;
    }
    listedFor = key;
    status.hidden = false;
    status.textContent = 'Loading…';
    const drafts = await lib.drafts(filter.maxShafts || Infinity);
    if (listedFor !== key) return; // a newer filter took over while loading
    results = filterDrafts(drafts, filter, books);
    status.textContent = results.length === 1 ? '1 draft' : `${results.length.toLocaleString()} drafts`;
    if (!results.length) status.textContent = drafts.length ? 'No drafts match these filters.' : 'The library is empty.';
    grid.innerHTML = '';
    shown = 0;
    renderPage();
  }

  function renderPage() {
    const page = results.slice(shown, shown + PAGE_SIZE);
    const params = filterToParams(filter);
    for (const d of page) {
      params.set('draft', d.id);
      const book = books.get(d.book);
      const card = document.createElement('a');
      card.className = 'ldm-card';
      card.href = `#${params}`;
      card.innerHTML = `
        <div class="ldm-thumb"><canvas data-id="${escapeHtml(d.id)}" role="img" aria-label="Drawdown of ${escapeHtml(d.title)}"></canvas></div>
        <div class="ldm-card-title">${escapeHtml(d.title)}</div>
        ${d.names ? `<div class="ldm-card-names">${escapeHtml(d.names)}</div>` : ''}
        <div class="ldm-card-meta">${d.shafts} shafts · ${d.treadles} treadles</div>
        <div class="ldm-card-book">${escapeHtml(book ? `${book.title}, ${book.date}` : '')}</div>`;
      grid.append(card);
      thumbObserver.observe(card.querySelector('canvas'));
    }
    shown += page.length;
    more.hidden = shown >= results.length;
  }

  async function showDetail(id) {
    form.hidden = true;
    grid.hidden = true;
    more.hidden = true;
    status.hidden = true;
    detail.hidden = false;
    detail.innerHTML = '<p class="ldm-status">Loading…</p>';
    const backParams = filterToParams(filter);

    let result;
    try {
      result = await loadDraft(id);
    } catch (err) {
      detail.innerHTML = `<p><a href="#${backParams}" class="ldm-back">← Library</a></p><p>Could not load draft ${escapeHtml(id)}: ${escapeHtml(err.message)}</p>`;
      return;
    }
    if (new URLSearchParams(location.hash.slice(1)).get('draft') !== id) return;
    const { draft, warnings } = result;
    const row = (await lib.drafts()).find((d) => d.id === id);
    const book = row && books.get(row.book);
    const meta = draft.meta;

    const facts = [
      ['Shafts', draft.shafts],
      draft.mode === 'liftplan' ? ['Lift plan', 'yes'] : ['Treadles', draft.treadles],
      ['Ends × picks', `${draft.numEnds} × ${draft.numPicks}`],
      row && ['Repeat', `${row.unitEnds} ends × ${row.unitPicks} picks`],
      row && ['Longest float', `warp ${row.warpFloat}, weft ${row.weftFloat}`],
      ['Colors', draft.palette.length],
      ['Shed', draft.risingShed ? 'Rising (jack loom)' : 'Sinking'],
    ].filter(Boolean);

    detail.innerHTML = `
      <p><a href="#${backParams}" class="ldm-back">← Library</a></p>
      <h2>${escapeHtml(meta.title || id)}</h2>
      ${row?.names ? `<p class="ldm-names">${escapeHtml(row.names)}</p>` : ''}
      <p class="ldm-source">${book ? `${escapeHtml(book.title)}, ${escapeHtml(book.authors)}${book.publisher ? ` (${escapeHtml(book.publisher)})` : ''}, ${escapeHtml(book.date)}.` : escapeHtml(meta.source)}</p>
      <dl class="ldm-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(String(v))}</dd></div>`).join('')}</dl>
      <div class="ldm-toolbar">
        <button type="button" data-zoom="-1" aria-label="Smaller">−</button>
        <button type="button" data-zoom="1" aria-label="Larger">+</button>
        <span class="ldm-readout" aria-live="off"></span>
        <span class="ldm-actions">
          ${loomUrl ? `<a class="ldm-button" href="${escapeHtml(`${loomUrl}#library=${encodeURIComponent(id)}`)}">Set up my loom</a>` : ''}
          ${warpUrl ? `<a class="ldm-button" href="${escapeHtml(`${warpUrl}#library=${encodeURIComponent(id)}`)}">Plan the warp</a>` : ''}
          ${designerUrl ? `<a class="ldm-button" href="${escapeHtml(`${designerUrl}#library=${encodeURIComponent(id)}`)}">Open in designer</a>` : ''}
          <a class="ldm-button ldm-primary" href="${lib.wifUrl(id)}" download="${escapeHtml(id)}.wif">Download .wif</a>
        </span>
      </div>
      <div class="ldm-canvas-wrap"><canvas role="img" aria-label="Draft: threading, tie-up, treadling and drawdown"></canvas></div>
      ${meta.notes ? `<p class="ldm-notes">${escapeHtml(meta.notes)}</p>` : ''}
      ${warnings.length ? `<details class="ldm-warnings"><summary>Import notes</summary><ul>${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul></details>` : ''}`;

    const wrap = detail.querySelector('.ldm-canvas-wrap');
    const canvas = wrap.querySelector('canvas');
    const readout = detail.querySelector('.ldm-readout');
    // Largest cell size (up to 16px) that fits the width; small screens scroll.
    const room = wrap.clientWidth - 24;
    let cell = 16;
    while (cell > 4 && layoutDraft(draft, cell).width > room) cell--;
    let layout = paintDraft(canvas, draft, { cell });

    detail.querySelectorAll('[data-zoom]').forEach((btn) => btn.addEventListener('click', () => {
      cell = clamp(cell + Number(btn.dataset.zoom) * (cell >= 8 ? 2 : 1), 2, 32);
      layout = paintDraft(canvas, draft, { cell });
    }));
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      readout.textContent = describeHit(hitTest(draft, layout, e.clientX - rect.left, e.clientY - rect.top));
    });
    canvas.addEventListener('mouseleave', () => { readout.textContent = ''; });
  }
}

function describeHit(hit) {
  if (!hit) return '';
  const parts = [];
  if (hit.end) parts.push(`end ${hit.end}`);
  if (hit.pick) parts.push(`pick ${hit.pick}`);
  if (hit.shaft) parts.push(`shaft ${hit.shaft}`);
  if (hit.treadle) parts.push(`treadle ${hit.treadle}`);
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
