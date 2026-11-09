// "My drafts": each saved draft is a .wif file in the Loomination folder that
// Teather keeps in the weaver's Google Drive, e.g. draft-Rosepath-towels-d1a2b3c.wif,
// so other weaving software can open them too. Drafts are found by that name
// pattern among the folder's files.
//
// A copy of every draft is kept in this browser (plain localStorage, never in
// Teather's state.json), so the list is instant and works offline or signed
// out. A copy marked `pending` hasn't reached Drive yet and is uploaded on the
// next signed-in visit; a `deleted` copy is a deletion still to be made there.
//
// Older versions kept drafts as `draft:<id>` items in Teather's state.json.
// Those are moved to files, and each item is removed from state.json only once
// its file is safely in Drive.

import { normalizeDraft } from '../core/draft.js';
import { parseWif, toWif } from '../core/wif.js';
import * as sync from './sync.js';
import { log } from './debug.js';
import { slugify } from './slug.js';

const LOCAL = 'loomination.myDrafts.';
const OLD_DRAFT = 'draft:';
const FILE = /^draft-(?:.+-)?(d[a-z0-9]+)\.wif$/i;

/** File name for a draft: "draft-<title>-<id>.wif", the title reduced to what Teather allows. */
export function fileNameFor(draft, id) {
  const slug = slugify(draft?.meta?.title);
  return `draft-${slug ? `${slug}-` : ''}${id}.wif`;
}

/** The draft id in a file name, or null if the file isn't a saved draft. */
export function idFromFileName(name) {
  return FILE.exec(name)?.[1] ?? null;
}

const newId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// ---- this browser's copies ----

const localStore = {
  get(id) {
    try {
      const v = JSON.parse(localStorage.getItem(LOCAL + id) || 'null');
      return v && v.id ? v : null;
    } catch {
      return null;
    }
  },
  put(entry) {
    try {
      localStorage.setItem(LOCAL + entry.id, JSON.stringify(entry));
      return true;
    } catch {
      return false;
    }
  },
  remove(id) {
    try { localStorage.removeItem(LOCAL + id); } catch { /* ignore */ }
  },
  all() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LOCAL)) {
          const v = this.get(k.slice(LOCAL.length));
          if (v) out.push(v);
        }
      }
    } catch {
      // storage unavailable
    }
    return out;
  },
};

/**
 * teather() returns the Teather API ({isSignedIn(), files}) or null.
 * Exposed as a factory so tests can pass a fake.
 */
export function createMyDrafts({ teather = () => sync.teatherApi(), store = localStore } = {}) {
  const signedIn = () => {
    const T = teather();
    return T && T.isSignedIn() ? T : null;
  };

  /** Copies in this browser, newest first: [{ id, title, saved, draft, pending }]. */
  function local() {
    return store.all()
      .filter((e) => !e.deleted && e.draft)
      .sort((a, b) => b.saved - a.saved);
  }

  // Old `draft:<id>` state items become pending copies (once).
  function adoptOldDrafts() {
    for (const key of sync.keys(OLD_DRAFT)) {
      const item = sync.get(key);
      const id = key.slice(OLD_DRAFT.length);
      if (!item || !item.draft || store.get(id)) continue;
      store.put({ id, title: item.title ?? item.draft.meta?.title ?? '', saved: item.saved || Date.now(), draft: item.draft, file: null, pending: true });
      log('drafts', `moving "${item.title || id}" from state.json to its own file`);
    }
  }

  // Remove old state items whose draft is now safely a file in Drive.
  function dropMigratedOldDrafts() {
    for (const key of sync.keys(OLD_DRAFT)) {
      const e = store.get(key.slice(OLD_DRAFT.length));
      if (e && !e.pending) sync.remove(key);
    }
  }

  // Upload one copy. Returns 'drive', 'copy' (saved as a new draft because the
  // file changed on another computer) with the new id, or 'browser' on failure.
  async function upload(T, entry) {
    const name = fileNameFor(entry.draft, entry.id);
    const sameFile = entry.file && entry.file.name === name;
    try {
      const file = await T.files.put(name, toWif(entry.draft), {
        contentType: 'text/plain',
        ifUnmodifiedSince: sameFile && entry.file.modifiedTime ? new Date(entry.file.modifiedTime).toUTCString() : undefined,
      });
      if (entry.file && !sameFile) await removeFile(T, entry.file.name); // renamed
      store.put({ ...entry, file: { name: file.name, modifiedTime: file.modifiedTime }, pending: false });
      return { where: 'drive', id: entry.id };
    } catch (err) {
      if (err && err.status === 412) {
        // Changed in Drive since this browser read it: keep both. The original
        // copy is refreshed from Drive on the next list.
        store.put({ ...entry, draft: store.get(entry.id)?.draft ?? entry.draft, pending: false });
        const copy = { ...entry, id: newId(), file: null, pending: true };
        store.put(copy);
        log('drafts', `"${entry.title}" changed on another computer; saving this version as a copy`);
        const r = await upload(T, copy);
        return { where: r.where === 'drive' ? 'copy' : r.where, id: copy.id };
      }
      log('drafts', `could not upload "${entry.title || entry.id}": ${err?.message ?? err}`);
      return { where: 'browser', id: entry.id };
    }
  }

  async function removeFile(T, name) {
    try {
      await T.files.remove(name);
    } catch (err) {
      if (!err || err.status !== 404) throw err;
    }
  }

  /** Upload pending copies and make pending deletions. */
  async function uploadPending(T = signedIn()) {
    if (!T) return;
    for (const e of store.all()) {
      if (e.deleted) {
        try {
          if (e.file) await removeFile(T, e.file.name);
          store.remove(e.id);
        } catch (err) {
          log('drafts', `could not delete "${e.title || e.id}" from Drive: ${err?.message ?? err}`);
        }
      } else if (e.pending) {
        await upload(T, e);
      }
    }
    dropMigratedOldDrafts();
  }

  // Bring this browser's copies up to date with the files in Drive.
  async function refresh(T) {
    const files = (await T.files.list()).filter((f) => idFromFileName(f.name));
    const seen = new Set();
    await Promise.all(files.map(async (f) => {
      const id = idFromFileName(f.name);
      seen.add(id);
      const e = store.get(id);
      if (e && (e.pending || e.deleted)) return; // this browser's change goes up, not down
      if (e && e.file && e.file.name === f.name && e.file.modifiedTime === f.modifiedTime) return;
      try {
        const text = await (await T.files.get(f.name)).text();
        const { draft } = parseWif(text);
        store.put({ id, title: draft.meta.title, saved: Date.parse(f.modifiedTime) || Date.now(), draft, file: { name: f.name, modifiedTime: f.modifiedTime }, pending: false });
      } catch (err) {
        log('drafts', `could not read ${f.name}: ${err?.message ?? err}`);
      }
    }));
    // Copies whose file is gone were deleted on another computer.
    for (const e of store.all()) {
      if (!seen.has(e.id) && !e.pending && !e.deleted && e.file) store.remove(e.id);
    }
  }

  return {
    local,

    /** Sync with Drive when signed in, then list. Never throws: falls back to this browser's copies. */
    async list() {
      adoptOldDrafts();
      const T = signedIn();
      if (T) {
        try {
          await uploadPending(T);
          await refresh(T);
        } catch (err) {
          log('drafts', `could not check Google Drive: ${err?.message ?? err}`);
        }
      }
      return local();
    },

    /**
     * Save a draft, replacing the one with this id. Returns { id, where }:
     * where is 'drive', 'copy' (saved as a new draft; see upload) or 'browser'
     * (not signed in, or Drive couldn't be reached; it uploads next time).
     */
    async save(draft, id = null) {
      const prev = id ? store.get(id) : null;
      const entry = { id: id ?? newId(), title: draft.meta.title ?? '', saved: Date.now(), draft, file: prev?.file ?? null, pending: true };
      const kept = store.put(entry);
      const T = signedIn();
      if (!T) {
        if (!kept) throw new Error('This browser would not save it (storage full or blocked).');
        return { id: entry.id, where: 'browser' };
      }
      const r = await upload(T, entry);
      dropMigratedOldDrafts();
      log('drafts', `saved "${entry.title || entry.id}" to ${r.where}`);
      return r;
    },

    async remove(id) {
      const e = store.get(id);
      sync.remove(OLD_DRAFT + id);
      if (!e) return;
      const T = signedIn();
      if (!e.file) {
        store.remove(id);
        return;
      }
      store.put({ ...e, deleted: true, pending: true });
      if (T) {
        try {
          await removeFile(T, e.file.name);
          store.remove(id);
        } catch (err) {
          log('drafts', `could not delete "${e.title || id}" from Drive yet: ${err?.message ?? err}`);
        }
      }
    },

    uploadPending,
  };
}

const myDrafts = createMyDrafts();
export const listDrafts = () => myDrafts.list();
export const localDrafts = () => myDrafts.local();
export const saveDraft = (draft, id) => myDrafts.save(draft, id);
export const deleteDraft = (id) => myDrafts.remove(id);
export const uploadPendingDrafts = () => myDrafts.uploadPending();

/** A draft copy's draft, normalized for the editor. */
export const draftOf = (entry) => normalizeDraft(entry.draft);
