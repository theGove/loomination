// Turning projects into documents: the images a sheet needs (drawdown, draft,
// photos as data URLs), printing through the browser's dialog (where "Save as
// PDF" is one of the printers), and downloading a standalone .html file.

import { toWif } from '../core/wif.js';
import { coverPhoto } from '../core/project.js';
import { paintThumbnail, paintDraft } from './draft-view.js';
import { projectSheetHtml, bookHtml, sheetDocument } from './project-sheet.js';
import { shrinkPhoto, blobToDataUrl } from './photo.js';
import { downloadBlob } from './html.js';
import { slugify } from './slug.js';
import { log } from './debug.js';

// Drafts bigger than this print as a drawdown only; the full draft (threading,
// tie-up, treadling) would be unreadably small on a page.
const MAX_DRAFT_THREADS = 320;

function drawdownUrl(draft) {
  if (!draft || !draft.numEnds || !draft.numPicks) return null;
  const c = document.createElement('canvas');
  paintThumbnail(c, draft, 480);
  return c.toDataURL('image/png');
}

function draftUrl(draft) {
  if (!draft || !draft.numEnds || draft.numEnds > MAX_DRAFT_THREADS || draft.numPicks > MAX_DRAFT_THREADS) return null;
  const across = draft.numEnds + draft.treadles + 3;
  const cell = Math.max(3, Math.min(10, Math.floor(900 / across)));
  const c = document.createElement('canvas');
  paintDraft(c, draft, { cell, major: 4 });
  return c.toDataURL('image/png');
}

/** The pictures of the draft itself, with the .wif as a data URL (no photos). */
export const draftImages = (draft) => ({ drawdown: drawdownUrl(draft), draft: draftUrl(draft), wif: wifUrl(draft), photos: {} });

const wifUrl = (draft) => (draft ? `data:text/plain;charset=utf-8,${encodeURIComponent(toWif(draft))}` : null);

/**
 * Everything a project's sheet shows. Photos come from Drive (when signed in),
 * redrawn at 1200 px so a book of many projects stays a sensible size.
 * allPhotos false: the cover only. onPhoto(done, total) reports progress.
 */
export async function sheetImages(project, store, { allPhotos = true, onPhoto = () => {}, counter = { done: 0, total: 0 } } = {}) {
  const images = draftImages(project.snapshot?.draft);
  if (!store.signedIn()) return images;
  const list = allPhotos ? project.photos : [coverPhoto(project)].filter(Boolean);
  for (const ph of list) {
    try {
      const blob = await store.photoBlob(ph.file);
      if (blob) images.photos[ph.id] = await blobToDataUrl(await shrinkPhoto(blob, 1200, 0.8));
    } catch (err) {
      log('projects', `photo ${ph.file} left out: ${err?.message ?? err}`);
    }
    counter.done++;
    onPhoto(counter.done, counter.total);
  }
  return images;
}

export const photoCount = (projects, allPhotos) =>
  projects.reduce((n, p) => n + (allPhotos ? p.photos.length : coverPhoto(p) ? 1 : 0), 0);

export async function projectDocument(project, store, opts = {}) {
  const images = await sheetImages(project, store, { ...opts, counter: { done: 0, total: photoCount([project], opts.allPhotos ?? true) } });
  return sheetDocument(project.title || 'Weaving project', projectSheetHtml(project, { images }));
}

export async function bookDocument(projects, store, { title, subtitle, allPhotos = true, onPhoto } = {}) {
  const counter = { done: 0, total: store.signedIn() ? photoCount(projects, allPhotos) : 0 };
  const byId = new Map();
  for (const p of projects) byId.set(p.id, await sheetImages(p, store, { allPhotos, onPhoto, counter }));
  return sheetDocument(title, bookHtml(projects, { title, subtitle, imagesFor: (p) => byId.get(p.id) }));
}

/** Print a standalone document (the browser's dialog offers Save as PDF). */
export function printDocument(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.append(frame);
  frame.addEventListener('load', () => {
    const w = frame.contentWindow;
    // Let the images decode before the print preview is made.
    const imgs = [...w.document.images];
    Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : null))).then(() => {
      // Some browsers return from print() at once, so remove the frame after
      // printing ends (or after a minute, if afterprint never comes).
      const done = () => setTimeout(() => frame.remove(), 500);
      w.addEventListener('afterprint', done, { once: true });
      setTimeout(() => frame.remove(), 60_000);
      w.focus();
      w.print();
    });
  }, { once: true });
  frame.srcdoc = html;
}

export function downloadDocument(title, html) {
  downloadBlob(`${slugify(title) || 'weaving-project'}.html`, new Blob([html], { type: 'text/html' }));
}
