// The autosaved working draft (this browser only) and "My drafts" (synced to
// the weaver's Google Drive through Teather when they sign in; see sync.js).
// Storage can be unavailable (private windows, blocked site data) or full, so
// every access is guarded and failures are quiet: the editor still works, it
// just doesn't remember.

import { normalizeDraft } from '../core/draft.js';
import * as sync from './sync.js';

// Kept in this browser only: syncing the autosave would rewrite Drive every few
// seconds while you edit.
const CURRENT = 'loomination.current';
const CURRENT_ID = 'loomination.currentId';
// Each saved draft is its own synced item, so two computers can save different
// drafts without overwriting each other.
const DRAFT = 'draft:';

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
export function saveCurrentSoon(draft, delay = 500) {
  clearTimeout(timer);
  timer = setTimeout(() => write(CURRENT, draft), delay);
}

// Which "My drafts" entry the working draft came from, so Save updates it.
export const loadCurrentId = () => read(CURRENT_ID);
export const setCurrentId = (id) => write(CURRENT_ID, id);

// Newest first: [{ id, title, saved, draft }]
export function listDrafts() {
  return sync
    .keys(DRAFT)
    .map((k) => sync.get(k))
    .filter((item) => item && item.id && item.draft)
    .sort((a, b) => b.saved - a.saved);
}

// Save a draft, replacing the entry with this id if there is one. Returns the id.
export function saveDraft(draft, id = null) {
  const entry = { id: id ?? `d${Date.now().toString(36)}`, title: draft.meta.title, saved: Date.now(), draft };
  sync.set(DRAFT + entry.id, entry);
  if (sync.get(DRAFT + entry.id)?.saved !== entry.saved) {
    throw new Error('This browser would not save it (storage full or blocked).');
  }
  return entry.id;
}

// Call fn() when a saved draft changes on another computer or in another tab.
export function onDraftsChange(fn) {
  return sync.onChange((c) => {
    if (c.key.startsWith(DRAFT) && c.source !== 'local') fn();
  });
}

// Hand a draft to the designer from another page (designer.html#import=1).
// The designer opens it as an undoable step instead of overwriting the
// weaver's work.
const IMPORT = 'loomination.import';
export const setImport = (draft) => write(IMPORT, draft);
export function takeImport() {
  const d = read(IMPORT);
  write(IMPORT, null);
  try {
    return d ? normalizeDraft(d) : null;
  } catch {
    return null;
  }
}

export function deleteDraft(id) {
  sync.remove(DRAFT + id);
}
