// A small diagnostic log, kept in this browser so it survives a crashed tab.
// It records page starts, slow steps, big canvases, memory, errors and times
// the page stopped responding, and whether the last visit ended normally. The
// weaver can copy it from debug.html to send with a bug report. Nothing is
// sent anywhere.
//
//   log('library', 'opened hw-12871')
//   const plan = timed('loom', 'plan for loom', () => planForLoom(draft, loom))

const KEY = 'loomination.debug';
const ALIVE = 'loomination.debugAlive'; // session -> last heartbeat, for open tabs
const MAX_ENTRIES = 400;
const SLOW_MS = 200;     // log steps and stuck main-thread stretches longer than this
const MEMORY_EVERY = 10000;

let entries = null;
let session = '';

function load() {
  if (entries) return entries;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
    entries = Array.isArray(saved) ? saved : [];
  } catch {
    entries = [];
  }
  return entries;
}

// Written at once (not batched), so the last entries are there after a crash.
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Storage full or blocked: drop the oldest half and try once more.
    entries = entries.slice(-Math.floor(MAX_ENTRIES / 2));
    try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* give up quietly */ }
  }
}

function heapMb() {
  const m = globalThis.performance?.memory; // Chrome and Edge only
  return m ? Math.round(m.usedJSHeapSize / 1e6) : undefined;
}

export function log(area, message, extra) {
  load();
  const entry = { t: Date.now(), s: session, area, msg: String(message) };
  const mb = heapMb();
  if (mb !== undefined) entry.mb = mb;
  if (extra !== undefined) entry.extra = extra;
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  persist();
}

/** Run fn(); log how long it took if it was slow (or threw). Returns fn's result. */
export function timed(area, what, fn) {
  const t0 = performance.now();
  try {
    return fn();
  } catch (err) {
    log(area, `${what} failed: ${err?.message ?? err}`);
    throw err;
  } finally {
    const ms = Math.round(performance.now() - t0);
    if (ms >= SLOW_MS) log(area, `${what} took ${ms} ms`);
  }
}

/** Log before a step that might crash the tab, so the log shows what was happening. */
export const before = (area, what) => log(area, `starting ${what}`);

const kb = (chars) => `${Math.round(chars / 1024)} KB`;

// What this browser has stored: synced items, their total size and the biggest.
function storageSummary() {
  try {
    const sizes = [];
    let synced = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const size = (localStorage.getItem(k) || '').length;
      sizes.push([k, size]);
      if (k.startsWith('teather:i:')) synced++;
    }
    const total = sizes.reduce((s, [, n]) => s + n, 0);
    const biggest = sizes.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${kb(n)}`).join(', ');
    return `${sizes.length} stored items (${synced} synced), ${kb(total)} in all; biggest: ${biggest}`;
  } catch (err) {
    return `storage unreadable: ${err.message}`;
  }
}

/** Log calls to Teather's server and its sign-in and sync events. */
export function watchSync(T) {
  if (!T) {
    log('sync', 'Teather not loaded: working from this browser only');
    return;
  }
  const user = T.user();
  log('sync', `Teather loaded, ${user ? 'signed in' : 'signed out'}, status ${T.status()}`);
  T.onStatus((s) => log('sync', `status ${s}`));
  T.onAuthChange((u) => log('sync', u ? 'signed in' : 'signed out'));
  // Changes from Drive arrive one item at a time; note them in bursts.
  let remote = 0;
  let size = 0;
  let timer = 0;
  T.onChange((c) => {
    if (c.source === 'local') return;
    remote++;
    try { size += JSON.stringify(c.value ?? null).length; } catch { /* ignore */ }
    clearTimeout(timer);
    timer = setTimeout(() => {
      log('sync', `${remote} item${remote === 1 ? '' : 's'} changed from ${c.source} (${kb(size)})`);
      remote = 0;
      size = 0;
    }, 300);
  });
}

// What the weaver clicked and where focus went, so a freeze can be matched to
// the action just before it. Text typed is never recorded.
function describe(el) {
  if (!(el instanceof Element)) return String(el);
  const tag = el.tagName.toLowerCase();
  const name = el.getAttribute('name') || el.dataset.act || el.dataset.zoom || '';
  const text = ['button', 'a', 'summary', 'option'].includes(tag) ? (el.textContent || '').trim().slice(0, 30) : '';
  return [tag, name && `[${name}]`, text && `"${text}"`].filter(Boolean).join(' ');
}

function watchInput() {
  addEventListener('pointerdown', (e) => log('click', describe(e.target)), true);
  addEventListener('change', (e) => {
    const el = e.target;
    const value = el.tagName === 'SELECT' || el.type === 'checkbox' ? ` = ${el.type === 'checkbox' ? el.checked : el.value}` : '';
    log('click', `changed ${describe(el)}${value}`);
  }, true);
  addEventListener('blur', (e) => { if (e.target === window) log('click', 'window lost focus'); }, true);
  addEventListener('focus', (e) => { if (e.target === window) log('click', 'window got focus'); }, true);
}

// Teather talks to its server with fetch(); time each call.
function watchFetch() {
  const real = globalThis.fetch;
  if (typeof real !== 'function') return;
  globalThis.fetch = function (input, init) {
    const url = String(input?.url ?? input);
    if (!url.includes('teather')) return real.apply(this, arguments);
    const method = init?.method || 'GET';
    const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*/, '');
    const sent = typeof init?.body === 'string' ? `, sent ${kb(init.body.length)}` : '';
    const t0 = performance.now();
    return real.apply(this, arguments).then(
      (res) => {
        const length = res.headers.get('content-length');
        log('net', `${method} ${path} → ${res.status} in ${Math.round(performance.now() - t0)} ms${sent}${length ? `, got ${kb(Number(length))}` : ''}`);
        return res;
      },
      (err) => {
        log('net', `${method} ${path} failed after ${Math.round(performance.now() - t0)} ms: ${err.message}`);
        throw err;
      },
    );
  };
}

export function entriesForDisplay() {
  return [...load()];
}

export function clear() {
  entries = [];
  persist();
}

function readAlive() {
  try {
    const v = JSON.parse(localStorage.getItem(ALIVE) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function writeAlive(map) {
  try { localStorage.setItem(ALIVE, JSON.stringify(map)); } catch { /* ignore */ }
}

/**
 * Log pages that ended abnormally. Each open page keeps a heartbeat
 * ({ t, hidden }) and logs 'closed' on pagehide (closed, reloaded or navigated
 * away). A visible page whose heartbeat stopped without a 'closed' most likely
 * crashed or was killed. Hidden tabs are skipped: browsers slow their timers.
 */
export function checkForCrashes() {
  load();
  const alive = readAlive();
  const now = Date.now();
  for (const [s, beat] of Object.entries(alive)) {
    if (s === session || (beat && (beat.hidden || now - beat.t < 6000))) continue; // still open
    delete alive[s];
    const opened = entries.find((e) => e.s === s && e.area === 'page' && e.msg.startsWith('open'));
    const closed = entries.some((e) => e.s === s && e.area === 'page' && e.msg.startsWith('closed'));
    if (opened && !closed) {
      const last = [...entries].reverse().find((e) => e.s === s);
      // The heartbeat runs on a timer, so if it kept beating after the last
      // note the page was still running (not stuck) while it failed.
      const after = beat?.t ? Math.round((beat.t - last.t) / 1000) : null;
      const vitals = beat?.t
        ? ` Its heartbeat went on ${after} s after that note${beat.mb !== undefined ? `, last at ${beat.mb} MB` : ''}, ${beat.nodes} page elements.`
        : '';
      log('page', `previous visit (${opened.msg.slice(5)}) did not end normally: the tab may have crashed or run out of memory. Its last note: ${last.area}: ${last.msg}.${vitals}`, { session: s, beat });
    }
  }
  writeAlive(alive);
}

/** Start a session for this page view (see checkForCrashes). */
export function start() {
  if (session || typeof window === 'undefined') return;
  session = Math.random().toString(36).slice(2, 7);
  checkForCrashes();
  const beat = () => {
    const map = readAlive();
    map[session] = { t: Date.now(), hidden: document.visibilityState === 'hidden', mb: heapMb(), nodes: document.getElementsByTagName('*').length };
    writeAlive(map);
  };
  beat();
  setInterval(beat, 2000);
  addEventListener('visibilitychange', beat);
  const nav = navigator.deviceMemory ? `, device memory ~${navigator.deviceMemory} GB` : '';
  log('page', `open ${location.pathname}${location.hash}`, `${navigator.userAgent}${nav}`);
  log('storage', storageSummary());
  watchFetch();
  watchInput();

  addEventListener('pagehide', () => {
    log('page', `closed ${location.pathname}`);
    const map = readAlive();
    delete map[session];
    writeAlive(map);
  });
  // Back/forward cache: the page comes back without reloading.
  addEventListener('pageshow', (e) => {
    if (e.persisted) {
      log('page', `open ${location.pathname}${location.hash} (restored)`);
      beat();
    }
  });
  addEventListener('hashchange', () => log('page', `went to ${location.hash || '(no hash)'}`));
  addEventListener('error', (e) => log('error', e.message || 'error', e.filename ? `${e.filename}:${e.lineno}` : undefined));
  addEventListener('unhandledrejection', (e) => log('error', `unhandled: ${e.reason?.message ?? e.reason}`));

  // Times the main thread was stuck (page unresponsive), where supported.
  try {
    new PerformanceObserver((list) => {
      for (const task of list.getEntries()) {
        if (task.duration >= SLOW_MS) log('stuck', `page did not respond for ${Math.round(task.duration)} ms`);
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // Not supported (Firefox, Safari).
  }

  // Memory, when it grows by a quarter or more since the last note.
  let lastMb = heapMb() ?? 0;
  if (heapMb() !== undefined) {
    setInterval(() => {
      const mb = heapMb();
      if (mb > lastMb * 1.25 + 5) {
        log('memory', `JavaScript memory grew to ${mb} MB`);
        lastMb = mb;
      } else if (mb < lastMb * 0.75) {
        lastMb = mb;
      }
    }, MEMORY_EVERY);
  }
}
