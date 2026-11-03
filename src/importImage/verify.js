// Step 8: weave the derived draft with the real drawdown function and compare
// it to the colors read from the image.

import { drawdown, floatLengths } from '../core/drawdown.js';
import { columnToEnd } from '../core/render.js';

export function verify(draft, colorGrid, { maxShafts = 16 } = {}) {
  const dd = drawdown(draft);
  const mismatches = [];
  colorGrid.forEach((row, pick) => row.forEach((color, col) => {
    const end = columnToEnd(draft, col);
    const shown = dd.warpOnTop[pick][end] ? draft.warpColors[end] : draft.weftColors[pick];
    if (shown !== color) mismatches.push([pick, col]);
  }));
  const floats = floatLengths(dd);
  const longest = (grid) => Math.max(0, ...grid.map((row) => Math.max(0, ...row)));
  const warnings = [];
  if (draft.shafts > maxShafts) warnings.push(`Needs ${draft.shafts} shafts; your loom has ${maxShafts}.`);
  return {
    mismatches,
    longestWarpFloat: longest(floats.warp),
    longestWeftFloat: longest(floats.weft),
    warnings,
  };
}
