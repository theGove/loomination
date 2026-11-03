// Import a draft from a picture of a drawdown. Pure functions; the only DOM
// code is in loadImage.js.

import { detectGrid } from './detectGrid.js';
import { sampleColors } from './sampleColors.js';
import { clusterColors } from './palette.js';
import { solveColors } from './solveColors.js';
import { interlacement } from './interlacement.js';
import { resolveUnknowns } from './resolveUnknowns.js';
import { deriveDraft } from './deriveDraft.js';
import { verify } from './verify.js';

export { detectGrid, cellRect } from './detectGrid.js';
export { mergeColors } from './palette.js';

// img: ImageData-shaped { width, height, data }. Options:
//   edgeThreshold, colorTolerance, maxShafts, maxTreadles, endNumbering,
//   grid (a detectGrid result, to override detection).
export function importFromImage(img, options = {}) {
  const grid = options.grid ?? detectGrid(img, options);
  const { palette, colorGrid } = clusterColors(sampleColors(img, grid), { tolerance: options.colorTolerance });
  return { grid, ...importFromColorGrid(colorGrid, palette, options) };
}

// Steps 4–8, from palette indices onward (re-run after the user merges colors).
export function importFromColorGrid(colorGrid, palette, options = {}) {
  const colors = solveColors(colorGrid);
  const { up, unknown } = interlacement(colorGrid, colors);
  const resolved = resolveUnknowns(up);
  const draft = deriveDraft(resolved.up, colors, palette, options);
  const check = verify(draft, colorGrid, options);
  return {
    draft,
    palette,
    colorGrid,
    violations: colors.violations,
    report: {
      ends: draft.numEnds,
      picks: draft.numPicks,
      shafts: draft.shafts,
      treadles: draft.treadles,
      mode: draft.mode,
      colors: palette.length,
      ambiguousCells: unknown,
      exactColors: colors.exact,
      mismatches: check.mismatches.length,
      longestWarpFloat: check.longestWarpFloat,
      longestWeftFloat: check.longestWeftFloat,
      warnings: check.warnings,
    },
    mismatches: check.mismatches,
  };
}
