// The weaver's looms, remembered in this browser and synced to their Google
// Drive when they sign in (see sync.js). A weaver can own several looms, each
// with a name; the one they chose last is used by the loom setup, warp planner
// and AI pages.

import * as sync from './sync.js';
import { escapeHtml } from './html.js';

// Each loom is its own synced item, so editing one loom on two computers
// doesn't overwrite the others.
const LOOM = 'loom:';
const CHOSEN = 'loomChosen';
// Older versions kept a single loom under this key.
const OLD_LOOM = 'loom';
const FIRST_ID = 'main';

export const DEFAULT_LOOM = { name: 'My loom', type: 'floor', shafts: 4, treadles: 6, shed: 'jack', reeds: [8, 10, 12], epi: 0, widthIn: 0 };

const withDefaults = (id, saved) => ({ ...DEFAULT_LOOM, ...saved, id });

/** All saved looms, sorted by name. Empty until the weaver saves one. */
export function listLooms() {
  let looms = sync.keys(LOOM)
    .map((key) => [key.slice(LOOM.length), sync.get(key)])
    .filter(([, v]) => v && typeof v === 'object')
    .map(([id, v]) => withDefaults(id, v));
  if (!looms.length) {
    // The single loom from older versions becomes the first named loom. A fixed
    // id means two computers migrating the same old loom don't make two copies.
    const old = sync.get(OLD_LOOM);
    if (old && typeof old === 'object') {
      const first = withDefaults(FIRST_ID, { ...old, name: DEFAULT_LOOM.name });
      saveLoom(first);
      sync.remove(OLD_LOOM);
      looms = [first];
    }
  }
  return looms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** The chosen loom; a default (with id '') when none is saved yet. */
export function loadLoom(looms = listLooms()) {
  const chosen = sync.get(CHOSEN);
  return looms.find((l) => l.id === chosen) || looms[0] || withDefaults('', {});
}

/** Save a loom, giving it an id if it's new. Returns the saved loom. */
export function saveLoom(loom) {
  const id = loom.id || newId();
  const { id: _, ...value } = loom;
  sync.set(LOOM + id, value);
  return { ...loom, id };
}

export function chooseLoom(id) {
  if (id !== sync.get(CHOSEN)) sync.set(CHOSEN, id);
}

export function deleteLoom(id) {
  if (id) sync.remove(LOOM + id);
}

/** A name not already used, like "Loom 2". */
export function unusedName(looms) {
  const names = new Set(looms.map((l) => l.name));
  let n = looms.length + 1;
  while (names.has(`Loom ${n}`)) n++;
  return `Loom ${n}`;
}

/** <option>s for a loom picker. */
export function loomOptions(looms, chosenId) {
  return looms.map((l) => `<option value="${escapeHtml(l.id)}"${l.id === chosenId ? ' selected' : ''}>${escapeHtml(l.name || 'Unnamed loom')}</option>`).join('');
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
