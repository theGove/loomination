// The weaver's loom, remembered in this browser and synced to their Google
// Drive when they sign in (see sync.js). Shared by the loom setup and warp
// planner pages.

import * as sync from './sync.js';

const LOOM_KEY = 'loom';

export const DEFAULT_LOOM = { type: 'floor', shafts: 4, treadles: 6, shed: 'jack', reeds: [8, 10, 12], epi: 0, widthIn: 0 };

export function loadLoom() {
  const saved = sync.get(LOOM_KEY);
  return { ...DEFAULT_LOOM, ...(saved && typeof saved === 'object' ? saved : {}) };
}

export function saveLoom(loom) {
  sync.set(LOOM_KEY, loom);
}
