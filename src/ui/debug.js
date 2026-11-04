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
      log('page', `previous visit (${opened.msg.slice(5)}) did not end normally: the tab may have crashed or run out of memory. Its last note: ${last.area}: ${last.msg}`, { session: s });
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
    map[session] = { t: Date.now(), hidden: document.visibilityState === 'hidden' };
    writeAlive(map);
  };
  beat();
  setInterval(beat, 2000);
  addEventListener('visibilitychange', beat);
  const nav = navigator.deviceMemory ? `, device memory ~${navigator.deviceMemory} GB` : '';
  log('page', `open ${location.pathname}${location.hash}`, `${navigator.userAgent}${nav}`);

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
