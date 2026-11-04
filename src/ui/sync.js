// Saved settings and "My drafts", synced to the weaver's own Google Drive through
// Teather (https://teather.pages.dev) when they sign in.
//
// Pages load teather.js with `defer` before main.js, so window.Teather is ready
// before any view mounts. If it didn't load (offline, blocked, embedded in a blog),
// everything still works from this browser alone: we read and write the same
// local format Teather uses, so nothing is lost and it syncs on the next visit
// where Teather loads.

const ITEM = 'teather:i:'; // Teather's stable v1 local format: {value, updatedAt}
let teather = null;
let started = false;

function T() {
  if (!started) {
    started = true;
    const t = typeof window !== 'undefined' ? window.Teather : null;
    if (t) {
      try {
        // Batch typing (AI notes, warp plan) into one Drive write every few seconds.
        t.init({ pushDelay: 3000 });
        teather = t;
      } catch {
        teather = null;
      }
    }
  }
  return teather;
}

/** True when Teather loaded, so syncing and sign-in are available. */
export const available = () => !!T();
export const teatherApi = () => T();

function readLocal(key) {
  try {
    const raw = localStorage.getItem(ITEM + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocal(key, item) {
  try {
    localStorage.setItem(ITEM + key, JSON.stringify(item));
    return true;
  } catch {
    return false;
  }
}

export function get(key, fallback = undefined) {
  const t = T();
  if (t) return t.get(key, fallback);
  const item = readLocal(key);
  return item && item.value !== null && item.value !== undefined ? item.value : fallback;
}

export function set(key, value) {
  const t = T();
  if (t) return t.set(key, value);
  const prev = readLocal(key);
  writeLocal(key, { value: value ?? null, updatedAt: Math.max(Date.now(), prev ? prev.updatedAt + 1 : 0) });
}

export const remove = (key) => set(key, null);

/** Keys that start with `prefix` and hold a value. */
export function keys(prefix = '') {
  const t = T();
  if (t) return t.keys().filter((k) => k.startsWith(prefix));
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(ITEM + prefix)) {
        const key = k.slice(ITEM.length);
        const item = readLocal(key);
        if (item && item.value !== null) out.push(key);
      }
    }
  } catch {
    // storage unavailable
  }
  return out;
}

/** fn({key, value, source}); returns an unsubscribe function. */
export function onChange(fn) {
  const t = T();
  return t ? t.onChange(fn) : () => {};
}

/** Wait for the first sync after page load, but never longer than `ms`. */
export function ready(ms = 3000) {
  const t = T();
  if (!t) return Promise.resolve();
  return Promise.race([t.ready(), new Promise((r) => setTimeout(r, ms))]);
}

// ---- one-time move from the old localStorage keys ----

const LEGACY = {
  'loomination.loom': 'loom',
  'loomination.warpPlan': 'warpPlan',
  'loomination.ai': 'ai',
  'loomination.cone': 'cone',
};
const LEGACY_DRAFTS = 'loomination.myDrafts';

/**
 * Move data saved by older versions into the synced store, then remove the old
 * keys. Settings get an old timestamp, so if the weaver already has newer
 * settings in Drive those win; each draft keeps the time it was saved.
 */
export function migrateLegacy() {
  try {
    for (const [oldKey, key] of Object.entries(LEGACY)) {
      const raw = localStorage.getItem(oldKey);
      if (raw === null) continue;
      if (!readLocal(key)) writeLocal(key, { value: JSON.parse(raw), updatedAt: 1 });
      localStorage.removeItem(oldKey);
    }
    const raw = localStorage.getItem(LEGACY_DRAFTS);
    if (raw !== null) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const entry of list) {
          if (!entry || !entry.id) continue;
          const key = `draft:${entry.id}`;
          if (!readLocal(key)) writeLocal(key, { value: entry, updatedAt: Number(entry.saved) || 1 });
        }
      }
      localStorage.removeItem(LEGACY_DRAFTS);
    }
  } catch {
    // Bad JSON or no storage: leave the old keys where they are.
  }
}
