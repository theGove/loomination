// The working draft for a page: the one draft that Design, Loom setup and
// Warp plan all use, chosen on the start page (see saved-drafts.js).
//
// Older links named a library draft (loom.html#library=hw-12871).
// adoptFromUrl() makes that draft the working draft, so those links still work.

import { parseWif } from '../core/wif.js';
import { createLibrary } from './library-data.js';
import { loadCurrent, chooseDraft, setNotice } from './saved-drafts.js';
import { log } from './debug.js';

// The working draft, or null when none has been chosen yet.
export function loadPageDraft() {
  const draft = loadCurrent();
  if (draft) log('draft', `working draft "${draft.meta.title || 'untitled'}": ${describe(draft)}`);
  else log('draft', 'no working draft yet');
  return draft;
}

// Adopt a draft named in the URL hash, then drop it from the URL.
export async function adoptFromUrl(libraryBase) {
  const params = new URLSearchParams(location.hash.slice(1));
  const libraryId = params.get('library');
  if (!libraryId) return;
  params.delete('library');
  history.replaceState(null, '', location.pathname + location.search + (params.size ? `#${params}` : ''));
  try {
    const { draft } = parseWif(await createLibrary(libraryBase).wifText(libraryId));
    log('draft', `adopting library draft ${libraryId}: ${describe(draft)}`);
    const kept = await chooseDraft(draft);
    setNotice(`Now working on “${draft.meta.title || libraryId}” from the library.${kept ? ` Your previous draft, “${kept}”, is in My drafts.` : ''}`);
  } catch (err) {
    setNotice(`Could not open library draft ${libraryId}: ${err.message}`);
  }
}

export function describe(draft) {
  return `${draft.shafts} shafts, ${draft.treadles} treadles, ${draft.numEnds} ends × ${draft.numPicks} picks`;
}
