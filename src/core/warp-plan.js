// A warp plan from the weaver's saved inputs: which yarns, what sett, and the
// planWarp() arithmetic. Shared by the warp planner and My Projects, so a
// project's snapshot matches what the warp plan page showed.

import { repeatUnit } from './loom.js';
import { planWarp, structureOf, DEFAULT_PROJECT } from './warp-calc.js';
import { yarnById } from './yarns.js';

export const WARP_DEFAULTS = {
  ...DEFAULT_PROJECT,
  warpYarn: 'cotton-8-2',
  warpYpp: 0,          // used when warpYarn is 'custom'
  weftYarn: 'same',
  weftYpp: 0,
  epi: 0,              // 0 = suggested from the yarn and structure
  ppi: 0,              // 0 = same as epi
  onHand: {},          // 'warp-1' -> yards
};

// The factors a finished project measures, which feed the next plan.
export const SHRINK_FIELDS = ['drawIn', 'shrinkWidth', 'takeUp', 'shrinkLength'];
// Largest value the warp plan form accepts for each percentage.
export const MAX_FACTOR = 0.4;

export function withWarpDefaults(saved) {
  return { ...WARP_DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
}

/**
 * Everything the warp plan needs for this draft and these inputs. `plan` is
 * null when there's no draft or no sett (a custom yarn without ends per inch).
 */
export function resolveWarpPlan(draft, inputs) {
  const warpYarn = yarnById(inputs.warpYarn);
  const weftYarn = inputs.weftYarn === 'same' ? warpYarn : yarnById(inputs.weftYarn);
  const warpYpp = inputs.warpYarn === 'custom' ? inputs.warpYpp : warpYarn?.ypp ?? 0;
  const weftYpp = inputs.weftYarn === 'same' ? warpYpp : inputs.weftYarn === 'custom' ? inputs.weftYpp : weftYarn?.ypp ?? 0;
  const structure = draft ? structureOf(draft) : 'plain';
  const suggested = warpYarn ? warpYarn[structure] : 0;
  const epi = inputs.epi || suggested;
  const ppi = inputs.ppi || epi;
  const threadingUnit = draft ? repeatUnit(draft.threading.filter((s) => s > 0)).unit : [];
  const plan = draft && epi ? planWarp({
    project: inputs, epi, ppi, threadingUnit,
    warpColors: draft.warpColors, weftColors: draft.weftColors, warpYpp, weftYpp,
  }) : null;
  return { warpYarn, weftYarn, warpYpp, weftYpp, structure, suggested, epi, ppi, threadingUnit, plan };
}

/** A yarn's display name: from the catalogue, or "Other (N yd/lb)". */
export function yarnName(id, ypp, fallbackId) {
  if (id === 'same') return yarnName(fallbackId, ypp);
  if (id === 'custom') return ypp ? `Other yarn, ${ypp.toLocaleString()} yd/lb` : 'Other yarn';
  return yarnById(id)?.name ?? '';
}
