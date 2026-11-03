import { drawdown, drawdownColors } from './drawdown.js';

// Map between a drawdown column (0 = leftmost on screen) and an end index.
// American (rtl) numbering puts end 1 at the right.
export function columnToEnd(draft, col) {
  return draft.display.endNumbering === 'ltr' ? col : draft.numEnds - 1 - col;
}

// Render the face of the cloth into an RGBA pixel buffer with the same shape as
// ImageData ({ width, height, data }), so the UI can putImageData() it and the
// PNG export and tests can use it without a canvas. cellSize may be fractional.
export function renderDrawdown(draft, { cellSize = 8, gridLine = 0, gridColor = [128, 128, 128], dd = drawdown(draft) } = {}) {
  const colors = drawdownColors(draft, dd);
  const pitch = cellSize + gridLine;
  const width = Math.round(gridLine + draft.numEnds * pitch);
  const height = Math.round(gridLine + draft.numPicks * pitch);
  const data = new Uint8ClampedArray(width * height * 4);
  fillRect(data, width, 0, 0, width, height, gridColor);
  for (let p = 0; p < draft.numPicks; p++) {
    const y0 = Math.round(gridLine + p * pitch);
    const y1 = Math.round(gridLine + p * pitch + cellSize);
    for (let col = 0; col < draft.numEnds; col++) {
      const x0 = Math.round(gridLine + col * pitch);
      const x1 = Math.round(gridLine + col * pitch + cellSize);
      fillRect(data, width, x0, y0, x1, y1, colors[p][columnToEnd(draft, col)]);
    }
  }
  return { width, height, data };
}

function fillRect(data, width, x0, y0, x1, y1, [r, g, b]) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
}
