// The weaver's loom, remembered in this browser. Shared by the loom setup and
// warp planner pages.

const LOOM_KEY = 'loomination.loom';

export const DEFAULT_LOOM = { type: 'floor', shafts: 4, treadles: 6, shed: 'jack', reeds: [8, 10, 12], epi: 0, widthIn: 0 };

export function loadLoom() {
  try {
    return { ...DEFAULT_LOOM, ...JSON.parse(localStorage.getItem(LOOM_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_LOOM };
  }
}

export function saveLoom(loom) {
  try {
    localStorage.setItem(LOOM_KEY, JSON.stringify(loom));
  } catch {
    // Not saved; the page still works for this visit.
  }
}
