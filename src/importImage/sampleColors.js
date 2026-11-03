// Step 3a: one representative color per cell — the per-channel median of the
// cell's central ~50%, which stays clear of grid lines and soft edges.

import { cellRect } from './detectGrid.js';

export function sampleColors(img, grid) {
  const rows = [];
  for (let row = 0; row < grid.numPicks; row++) {
    const out = [];
    for (let col = 0; col < grid.numEnds; col++) out.push(sampleCell(img, cellRect(grid, col, row)));
    rows.push(out);
  }
  return rows;
}

function sampleCell(img, { x0, x1, y0, y1 }) {
  const [ax, bx] = centralSpan(x0, x1, img.width);
  const [ay, by] = centralSpan(y0, y1, img.height);
  const channels = [[], [], []];
  for (let y = ay; y < by; y++) {
    for (let x = ax; x < bx; x++) {
      const i = (y * img.width + x) * 4;
      channels[0].push(img.data[i]);
      channels[1].push(img.data[i + 1]);
      channels[2].push(img.data[i + 2]);
    }
  }
  return channels.map(median);
}

// Integer pixel range covering the middle half of [lo, hi), at least one pixel.
function centralSpan(lo, hi, limit) {
  const w = hi - lo;
  let a = Math.ceil(lo + w * 0.25);
  let b = Math.floor(lo + w * 0.75);
  if (b <= a) {
    a = Math.floor(lo + w / 2);
    b = a + 1;
  }
  return [Math.max(0, Math.min(a, limit - 1)), Math.max(1, Math.min(b, limit))];
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
