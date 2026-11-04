// The autosaved working draft (this browser only) and "My drafts": each saved
// draft is a .wif file in the weaver's Google Drive (through Teather's files
// API) when they sign in, with a copy kept in this browser (my-drafts.js).
// Storage can be unavailable (private windows, blocked site data) or full, so
// every access is guarded and failures are quiet: the editor still works, it
// just doesn't remember.

import { normalizeDraft } from '../core/draft.js';
export { listDrafts, localDrafts, saveDraft, deleteDraft, fileNameFor, idFromFileName, createMyDrafts } from './my-drafts.js';

// Kept in this browser only: syncing the autosave would rewrite Drive every few
// seconds while you edit.
const CURRENT = 'loomination.current';
const CURRENT_ID = 'loomination.currentId';

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
