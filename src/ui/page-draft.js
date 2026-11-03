// The draft a planning page works on: a library draft named in the URL
// (page.html#library=hw-12871) or, by default, the draft open in the designer.

import { parseWif } from '../core/wif.js';
import { createLibrary } from './library-data.js';
import { loadCurrent } from './saved-drafts.js';
import { starterDraft } from './editor-view.js';

// Resolves to { draft, source, libraryId }.
export async function loadPageDraft(libraryBase) {
  const libraryId = new URLSearchParams(location.hash.slice(1)).get('library');
  if (libraryId) {
    const text = await createLibrary(libraryBase).wifText(libraryId);
    return { draft: parseWif(text).draft, source: `library draft ${libraryId}`, libraryId };
  }
  return { draft: loadCurrent() ?? starterDraft(), source: 'the draft open in the designer', libraryId: null };
}
