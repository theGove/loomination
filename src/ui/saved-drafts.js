// The autosaved working draft (this browser only) and "My drafts": each saved
// draft is a .wif file in the weaver's Google Drive (through Teather's files
// API) when they sign in, with a copy kept in this browser (my-drafts.js).
// Storage can be unavailable (private windows, blocked site data) or full, so
// every access is guarded and failures are quiet: the editor still works, it
// just doesn't remember.

import { normalizeDraft } from '../core/draft.js';
import { saveDraft } from './my-drafts.js';
export { listDrafts, localDrafts, saveDraft, deleteDraft, fileNameFor, idFromFileName, createMyDrafts } from './my-drafts.js';

// The working draft: the one draft that Design, Loom setup and Warp plan all
// work on. It is chosen on the start page (or the library, Ask your AI, ...)
// and autosaved here as the designer changes it.
// Kept in this browser only: syncing the autosave would rewrite Drive every few
// seconds while you edit.
const CURRENT = 'loomination.current';
const CURRENT_ID = 'loomination.currentId';
// Set when the working draft has changes not yet saved to My drafts.
const DIRTY = 'loomination.currentDirty';
// A one-time message for the next page, e.g. where the previous draft went.
const NOTICE = 'loomination.notice';

// Fired on window whenever the working draft changes, so the header can follow.
export const CHANGED = 'loomination:draft';
const announce = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED));
};

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadCurrent() {
  const d = read(CURRENT);
  try {
    return d ? normalizeDraft(d) : null;
  } catch {
    return null;
  }
}

let timer = 0;
let pending = null;
export function saveCurrentSoon(draft, delay = 500) {
  clearTimeout(timer);
  pending = draft;
  timer = setTimeout(flushCurrent, delay);
}

// Write a waiting autosave now, e.g. when the weaver leaves the page right
// after a change.
export function flushCurrent() {
  clearTimeout(timer);
  if (!pending) return;
  write(CURRENT, pending);
  pending = null;
  announce();
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', flushCurrent);

// Which "My drafts" entry the working draft came from, so Save updates it.
export const loadCurrentId = () => read(CURRENT_ID);
export const setCurrentId = (id) => write(CURRENT_ID, id);

export const isDirty = () => read(DIRTY) === true;
export const setDirty = (dirty) => write(DIRTY, dirty ? true : null);

/**
 * Make `draft` the working draft. If the old one has unsaved changes it is
 * first kept in My drafts, so choosing never loses work. Returns the title of
 * the draft kept, or null. Throws (leaving the old draft in place) when it
 * can't be kept.
 */
export async function chooseDraft(draft, id = null) {
  flushCurrent();
  const old = loadCurrent();
  let kept = null;
  if (old && isDirty()) {
    await saveDraft(old, loadCurrentId());
    kept = old.meta.title || 'Untitled';
  }
  if (!write(CURRENT, draft)) throw new Error("This browser won't keep the draft (site storage is blocked or full).");
  setCurrentId(id);
  setDirty(false);
  announce();
  return kept;
}

export const setNotice = (text) => write(NOTICE, text);
export function takeNotice() {
  const text = read(NOTICE);
  write(NOTICE, null);
  return text;
}
