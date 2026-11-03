// Canvas view of a whole draft in the American layout: warp colors and threading
// above the drawdown, tie-up at top right, treadling (or liftplan) and weft
// colors to the right. Shaft 1 is the bottom row of the threading and tie-up;
// pick 1 is the top row. End order follows draft.display.endNumbering.
//
// The layout is computed separately from painting so the editor can map mouse
// positions to cells with hitTest().

import { drawdown, drawdownColors } from '../core/drawdown.js';
import { columnToEnd } from '../core/render.js';

// Pixel rectangles of every region for a given cell size (CSS pixels).
export function layoutDraft(draft, cell) {
  const gap = Math.max(cell, 6);
  const sideCols = draft.mode === 'liftplan' ? draft.shafts : draft.treadles;
  const x0 = 0;
  const x1 = x0 + draft.numEnds * cell + gap;
  const x2 = x1 + sideCols * cell + gap;
  const y0 = 0;
  const y1 = y0 + cell + gap;
  const y2 = y1 + draft.shafts * cell + gap;
  const region = (x, y, cols, rows) => ({ x, y, cols, rows, w: cols * cell, h: rows * cell });
  const regions = {
    warpColors: region(x0, y0, draft.numEnds, 1),
    threading: region(x0, y1, draft.numEnds, draft.shafts),
    drawdown: region(x0, y2, draft.numEnds, draft.numPicks),
    side: region(x1, y2, sideCols, draft.numPicks),
    weftColors: region(x2, y2, 1, draft.numPicks),
  };
  if (draft.mode !== 'liftplan') regions.tieup = region(x1, y1, draft.treadles, draft.shafts);
  // +1 leaves room for the closing grid line on the right and bottom edges.
  return { cell, regions, width: x2 + cell + 1, height: y2 + draft.numPicks * cell + 1 };
}

// Which region and cell is at (x, y) in CSS pixels, or null.
// Returns { region, col, row } plus end/pick/shaft/treadle where they apply (1-based).
export function hitTest(draft, layout, x, y) {
  for (const [name, r] of Object.entries(layout.regions)) {
    if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) continue;
    const col = Math.floor((x - r.x) / layout.cell);
    const row = Math.floor((y - r.y) / layout.cell);
    const hit = { region: name, col, row };
    if (name === 'warpColors' || name === 'threading' || name === 'drawdown') hit.end = columnToEnd(draft, col) + 1;
    if (name === 'drawdown' || name === 'side' || name === 'weftColors') hit.pick = row + 1;
    if (name === 'threading' || name === 'tieup') hit.shaft = r.rows - row;
    if (name === 'tieup' || (name === 'side' && draft.mode !== 'liftplan')) hit.treadle = col + 1;
    if (name === 'side' && draft.mode === 'liftplan') hit.shaft = col + 1;
    return hit;
  }
  return null;
}

// Colors come from the page's CSS custom properties so the view follows the theme.
function themeColors(el) {
  const style = getComputedStyle(el);
  const get = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    cell: get('--ldm-cell', '#fff'),
    grid: get('--ldm-grid', '#ccc'),
    major: get('--ldm-grid-major', '#888'),
    ink: get('--ldm-ink', '#222'),
  };
}

// Size a canvas for a CSS-pixel width/height on a high-DPI screen.
function sizeCanvas(canvas, width, height) {
  const dpr = globalThis.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

const css = ([r, g, b]) => `rgb(${r},${g},${b})`;

// Paint the full draft into canvas. Returns the layout used.
export function paintDraft(canvas, draft, { cell = 10, dd = drawdown(draft) } = {}) {
  const layout = layoutDraft(draft, cell);
  const ctx = sizeCanvas(canvas, layout.width, layout.height);
  const theme = themeColors(canvas);
  const { regions: R } = layout;
  const lines = cell >= 4;

  // Grids for the setup regions.
  const marked = (r, isOn) => {
    ctx.fillStyle = lines ? theme.grid : theme.cell;
    ctx.fillRect(r.x, r.y, r.w + (lines ? 1 : 0), r.h + (lines ? 1 : 0));
    for (let row = 0; row < r.rows; row++) {
      for (let col = 0; col < r.cols; col++) {
        ctx.fillStyle = isOn(col, row) ? theme.ink : theme.cell;
        const inset = lines ? 1 : 0;
        ctx.fillRect(r.x + col * cell + inset, r.y + row * cell + inset, cell - inset, cell - inset);
      }
    }
  };
  const S = draft.shafts;
  marked(R.threading, (col, row) => draft.threading[columnToEnd(draft, col)] === S - row);
  if (R.tieup) marked(R.tieup, (col, row) => draft.tieup[S - 1 - row][col]);
  if (draft.mode === 'liftplan') {
    marked(R.side, (col, row) => draft.liftplan[row].includes(col + 1));
  } else {
    marked(R.side, (col, row) => draft.treadling[row].includes(col + 1));
  }

  // Color bars.
  for (let col = 0; col < draft.numEnds; col++) {
    ctx.fillStyle = css(draft.palette[draft.warpColors[columnToEnd(draft, col)]]);
    ctx.fillRect(R.warpColors.x + col * cell, R.warpColors.y, cell, cell);
  }
  for (let row = 0; row < draft.numPicks; row++) {
    ctx.fillStyle = css(draft.palette[draft.weftColors[row]]);
    ctx.fillRect(R.weftColors.x, R.weftColors.y + row * cell, cell, cell);
  }

  // Drawdown, painted in runs of one color per row.
  const colors = drawdownColors(draft, dd);
  const r = R.drawdown;
  for (let row = 0; row < draft.numPicks; row++) {
    let start = 0;
    for (let col = 1; col <= draft.numEnds; col++) {
      const prev = colors[row][columnToEnd(draft, start)];
      const cur = col < draft.numEnds ? colors[row][columnToEnd(draft, col)] : null;
      if (cur && cur[0] === prev[0] && cur[1] === prev[1] && cur[2] === prev[2]) continue;
      ctx.fillStyle = css(prev);
      ctx.fillRect(r.x + start * cell, r.y + row * cell, (col - start) * cell, cell);
      start = col;
    }
  }
  // Cell lines over the colored regions, faint inside, solid at the border so a
  // color that matches the background (often a white weft) still shows.
  for (const reg of [R.warpColors, R.weftColors, r]) {
    ctx.fillStyle = theme.grid;
    if (lines) {
      ctx.globalAlpha = 0.35;
      for (let col = 1; col < reg.cols; col++) ctx.fillRect(reg.x + col * cell, reg.y, 1, reg.h);
      for (let row = 1; row < reg.rows; row++) ctx.fillRect(reg.x, reg.y + row * cell, reg.w, 1);
      ctx.globalAlpha = 1;
    }
    ctx.fillRect(reg.x, reg.y, reg.w + 1, 1);
    ctx.fillRect(reg.x, reg.y + reg.h, reg.w + 1, 1);
    ctx.fillRect(reg.x, reg.y, 1, reg.h + 1);
    ctx.fillRect(reg.x + reg.w, reg.y, 1, reg.h + 1);
  }

  // Heavier lines every 4 cells help count threads. Groups count from end 1,
  // shaft 1, treadle 1 and pick 1, so they start from whichever edge those are on.
  if (cell >= 6) {
    ctx.fillStyle = theme.major;
    const endsFromRight = draft.display.endNumbering !== 'ltr';
    const vLines = (reg, fromRight) => {
      for (let i = 0; i <= reg.cols; i += 4) ctx.fillRect(reg.x + (fromRight ? reg.cols - i : i) * cell, reg.y, 1, reg.h + 1);
    };
    const hLines = (reg, fromBottom) => {
      for (let i = 0; i <= reg.rows; i += 4) ctx.fillRect(reg.x, reg.y + (fromBottom ? reg.rows - i : i) * cell, reg.w + 1, 1);
    };
    vLines(R.threading, endsFromRight);
    hLines(R.threading, true);
    vLines(R.drawdown, endsFromRight);
    hLines(R.drawdown, false);
    vLines(R.side, false);
    hLines(R.side, false);
    if (R.tieup) {
      vLines(R.tieup, false);
      hLines(R.tieup, true);
    }
  }
  return layout;
}

// Small preview of the face of the cloth, fitted within maxSize CSS pixels.
export function paintThumbnail(canvas, draft, maxSize = 160) {
  const cell = Math.max(1, Math.floor(maxSize / Math.max(draft.numEnds, draft.numPicks, 1)));
  const width = draft.numEnds * cell;
  const height = draft.numPicks * cell;
  const ctx = sizeCanvas(canvas, width, height);
  const colors = drawdownColors(draft);
  for (let row = 0; row < draft.numPicks; row++) {
    for (let col = 0; col < draft.numEnds; col++) {
      ctx.fillStyle = css(colors[row][columnToEnd(draft, col)]);
      ctx.fillRect(col * cell, row * cell, cell, cell);
    }
  }
}
