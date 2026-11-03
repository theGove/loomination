// Drafts kept in this browser's localStorage: an autosaved working draft and
// the "My drafts" list. Storage can be unavailable (private windows, blocked
// site data) or full, so every access is guarded and failures are quiet: the
// editor still works, it just doesn't remember.

import { normalizeDraft } from '../core/draft.js';

const CURRENT = 'loomination.current';
const CURRENT_ID = 'loomination.currentId';
const LIST = 'loomination.myDrafts';

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
  const list = read(LIST);
  return Array.isArray(list) ? list.sort((a, b) => b.saved - a.saved) : [];
}

// Save a draft, replacing the entry with this id if there is one. Returns the id.
export function saveDraft(draft, id = null) {
  const list = listDrafts();
  const entry = { id: id ?? `d${Date.now().toString(36)}`, title: draft.meta.title, saved: Date.now(), draft };
  const i = list.findIndex((item) => item.id === entry.id);
  if (i >= 0) list[i] = entry;
  else list.push(entry);
  if (!write(LIST, list)) throw new Error('This browser would not save it (storage full or blocked).');
  return entry.id;
}

export function deleteDraft(id) {
  write(LIST, listDrafts().filter((item) => item.id !== id));
}
