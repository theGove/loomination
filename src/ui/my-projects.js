// "My Projects": each project is a JSON file in the Loomination folder that
// Teather keeps in the weaver's Google Drive, under projects/, e.g.
// projects/project-Rosepath-towels-p1a2b3c.json. Photos are their own files,
// projects/photos/<project id>-<photo id>.jpg (and -t.jpg, a small thumbnail),
// so the project file stays small.
//
// As with My drafts (my-drafts.js), a copy of every project is kept in this
// browser, so the list is instant and works offline or signed out. A copy
// marked `pending` hasn't reached Drive yet; `deleted` is a deletion still to
// be made there; `trash` lists photo files still to remove from Drive.
// Photos themselves need Drive: adding or showing one needs sign-in.

import { normalizeProject, makeSnapshot } from '../core/project.js';
import * as sync from './sync.js';
import { loadCurrent } from './saved-drafts.js';
import { loadLoom } from './loom-profile.js';
import { log } from './debug.js';
import { slugify } from './slug.js';

const LOCAL = 'loomination.myProjects.';
const FILE = /^projects\/project-(?:.+-)?(p[a-z0-9]+)\.json$/i;

export function projectFileName(project) {
  const slug = slugify(project.title);
  return `projects/project-${slug ? `${slug}-` : ''}${project.id}.json`;
}

/** The project id in a file name, or null if the file isn't a project. */
export function projectIdFromFileName(name) {
  return FILE.exec(name)?.[1] ?? null;
}

export const photoFileName = (projectId, photoId, thumb = false) => `projects/photos/${projectId}-${photoId}${thumb ? '-t' : ''}.jpg`;

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

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

const photoFiles = (project) => project.photos.flatMap((ph) => [ph.file, ph.thumb].filter(Boolean));

/**
 * teather() returns the Teather API ({isSignedIn(), files}) or null.
 * Exposed as a factory so tests can pass a fake.
 */
export function createMyProjects({ teather = () => sync.teatherApi(), store = localStore } = {}) {
  const signedIn = () => {
    const T = teather();
    return T && T.isSignedIn() ? T : null;
  };

  /** Projects in this browser, most recently changed first. */
  function local() {
    return store.all()
      .filter((e) => !e.deleted && e.project)
      .map((e) => normalizeProject(e.project))
      .sort((a, b) => b.updated - a.updated);
  }

  function get(id) {
    const e = id ? store.get(id) : null;
    return e && !e.deleted && e.project ? normalizeProject(e.project) : null;
  }

  async function removeFile(T, name) {
    try {
      await T.files.remove(name);
    } catch (err) {
      if (!err || err.status !== 404) throw err;
    }
  }

  // Remove files from Drive now if possible; whatever can't be removed waits
  // in the entry's trash for the next signed-in visit.
  async function removeFiles(T, entry, names) {
    const left = [];
    for (const name of names) {
      try {
        if (!T) throw new Error('signed out');
        await removeFile(T, name);
      } catch {
        left.push(name);
      }
    }
    return left;
  }

  // Upload one copy. Returns 'drive', 'copy' (saved as a new project because the
  // file changed on another computer) with the new id, or 'browser' on failure.
  async function upload(T, entry) {
    const name = projectFileName(entry.project);
    const sameFile = entry.file && entry.file.name === name;
    try {
      const file = await T.files.put(name, JSON.stringify(entry.project), {
        contentType: 'application/json',
        ifUnmodifiedSince: sameFile && entry.file.modifiedTime ? new Date(entry.file.modifiedTime).toUTCString() : undefined,
      });
      if (entry.file && !sameFile) await removeFile(T, entry.file.name); // renamed
      const trash = await removeFiles(T, entry, entry.trash ?? []);
      // Keep any edit made while this upload was on its way.
      const now = store.get(entry.id);
      const newer = now && now.project && now.project.updated > entry.project.updated;
      store.put({ ...entry, project: newer ? now.project : entry.project, file: { name: file.name, modifiedTime: file.modifiedTime }, pending: newer, trash });
      return { where: 'drive', id: entry.id };
    } catch (err) {
      if (err && err.status === 412) {
        // Changed in Drive since this browser read it: keep both. The original
        // is refreshed from Drive on the next list.
        store.put({ ...entry, pending: false });
        const id = newId();
        const copy = { id, project: { ...entry.project, id, title: `${entry.project.title} (copy)` }, file: null, pending: true, trash: [] };
        store.put(copy);
        log('projects', `"${entry.project.title}" changed on another computer; saving this version as a copy`);
        const r = await upload(T, copy);
        return { where: r.where === 'drive' ? 'copy' : r.where, id };
      }
      log('projects', `could not upload "${entry.project.title || entry.id}": ${err?.message ?? err}`);
      return { where: 'browser', id: entry.id };
    }
  }

  // Photo files still used by another project (a copy made by a conflict).
  function sharedFiles(exceptId) {
    const used = new Set();
    for (const e of store.all()) {
      if (e.id !== exceptId && !e.deleted && e.project) photoFiles(normalizeProject(e.project)).forEach((n) => used.add(n));
    }
    return used;
  }

  /** Upload pending copies and make pending deletions. */
  async function uploadPending(T = signedIn()) {
    if (!T) return;
    for (const e of store.all()) {
      if (e.deleted) {
        const left = await removeFiles(T, e, [e.file?.name, ...(e.trash ?? [])].filter(Boolean));
        if (left.length) store.put({ ...e, file: null, trash: left });
        else store.remove(e.id);
      } else if (e.pending) {
        await upload(T, e);
      } else if (e.trash?.length) {
        store.put({ ...e, trash: await removeFiles(T, e, e.trash) });
      }
    }
  }

  // Bring this browser's copies up to date with the files in Drive.
  async function refresh(T) {
    const files = (await T.files.list()).filter((f) => projectIdFromFileName(f.name));
    const seen = new Set();
    await Promise.all(files.map(async (f) => {
      const id = projectIdFromFileName(f.name);
      seen.add(id);
      const e = store.get(id);
      if (e && (e.pending || e.deleted)) return; // this browser's change goes up, not down
      if (e && e.file && e.file.name === f.name && e.file.modifiedTime === f.modifiedTime) return;
      try {
        const project = normalizeProject(JSON.parse(await (await T.files.get(f.name)).text()));
        store.put({ id, project: { ...project, id }, file: { name: f.name, modifiedTime: f.modifiedTime }, pending: false, trash: e?.trash ?? [] });
      } catch (err) {
        log('projects', `could not read ${f.name}: ${err?.message ?? err}`);
      }
    }));
    // Copies whose file is gone were deleted on another computer.
    for (const e of store.all()) {
      if (!seen.has(e.id) && !e.pending && !e.deleted && e.file) store.remove(e.id);
    }
  }

  /** Keep a change in this browser now; it goes to Drive with flush(). */
  function put(project) {
    const prev = store.get(project.id);
    const entry = { id: project.id, project: { ...project, updated: Math.max(Date.now(), (prev?.project?.updated ?? 0) + 1) }, file: prev?.file ?? null, pending: true, trash: prev?.trash ?? [] };
    if (!store.put(entry)) throw new Error('This browser would not save it (storage full or blocked).');
    return normalizeProject(entry.project);
  }

  /** Upload this project if it has changes. Returns { id, where }. */
  async function flush(id) {
    const e = store.get(id);
    if (!e || e.deleted) return { id, where: 'browser' };
    if (!e.pending) return { id, where: e.file ? 'drive' : 'browser' };
    const T = signedIn();
    if (!T) return { id, where: 'browser' };
    const r = await upload(T, e);
    log('projects', `saved "${e.project.title || id}" to ${r.where}`);
    return r;
  }

  const urls = new Map(); // file name -> Promise<object URL>

  return {
    local,
    get,
    put,
    flush,
    uploadPending,

    /** Sync with Drive when signed in, then list. Never throws: falls back to this browser's copies. */
    async list() {
      const T = signedIn();
      if (T) {
        try {
          await uploadPending(T);
          await refresh(T);
        } catch (err) {
          log('projects', `could not check Google Drive: ${err?.message ?? err}`);
        }
      }
      return local();
    },

    /** Save now: keep it here and send it to Drive. Returns { id, where }. */
    async save(project) {
      put(project);
      return flush(project.id);
    },

    /** Delete a project and its photos. */
    async remove(id) {
      const e = store.get(id);
      if (!e) return;
      const shared = sharedFiles(id);
      const photos = e.project ? photoFiles(normalizeProject(e.project)).filter((n) => !shared.has(n)) : [];
      const names = [e.file?.name, ...photos, ...(e.trash ?? [])].filter(Boolean);
      if (!names.length) {
        store.remove(id);
        return;
      }
      const left = await removeFiles(signedIn(), e, names);
      if (left.length) store.put({ id, project: null, file: null, deleted: true, pending: true, trash: left });
      else store.remove(id);
    },

    signedIn: () => !!signedIn(),

    /**
     * Upload a photo (already shrunk; see photo.js) and its thumbnail. Returns
     * the photo's record for project.photos. Needs sign-in.
     */
    async uploadPhoto(projectId, { full, thumb }, { id = Math.random().toString(36).slice(2, 9), caption = '', takenAt = Date.now() } = {}) {
      const T = signedIn();
      if (!T) throw new Error('Sign in with "Save to Google Drive" to add photos.');
      const file = photoFileName(projectId, id);
      const small = photoFileName(projectId, id, true);
      await T.files.put(file, full, { contentType: 'image/jpeg' });
      await T.files.put(small, thumb, { contentType: 'image/jpeg' });
      return { id, file, thumb: small, caption, takenAt, cover: false };
    },

    /** Remove a photo's files (now, or on the next signed-in visit). */
    async removePhoto(projectId, photo) {
      const shared = sharedFiles(projectId);
      const names = [photo.file, photo.thumb].filter((n) => n && !shared.has(n));
      const left = await removeFiles(signedIn(), null, names);
      if (!left.length) return;
      const e = store.get(projectId);
      if (e) store.put({ ...e, trash: [...new Set([...(e.trash ?? []), ...left])] });
    },

    /** A photo file from Drive as a Blob (null when signed out). */
    async photoBlob(name) {
      const T = signedIn();
      return T ? T.files.get(name) : null;
    },

    /** An object URL for a photo file, cached for this page (null when signed out or missing). */
    photoUrl(name) {
      if (!name || !signedIn()) return Promise.resolve(null);
      if (!urls.has(name)) {
        urls.set(name, this.photoBlob(name).then((b) => URL.createObjectURL(b)).catch((err) => {
          urls.delete(name);
          log('projects', `could not load ${name}: ${err?.message ?? err}`);
          return null;
        }));
      }
      return urls.get(name);
    },
  };
}

export const myProjects = createMyProjects();

// The warp planner's saved inputs (warp-view.js).
export const WARP_PLAN_KEY = 'warpPlan';

/** A snapshot of the plan as it stands: working draft, warp plan, chosen loom. Null with no working draft. */
export function currentSnapshot(draft = loadCurrent()) {
  if (!draft) return null;
  return makeSnapshot({ draft, warpPlan: sync.get(WARP_PLAN_KEY), loom: loadLoom() });
}
