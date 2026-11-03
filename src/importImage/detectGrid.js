// Step 2: find the cell grid in a drawdown image.
//
// Cell boundaries are the only places where color changes, so for each pixel
// column we count how many rows change color across it ("edge strength").
// Peaks in that signal are boundaries; their spacing gives the cell pitch,
// fitted by least squares so non-integer pitches (7.5 px) work. Boundaries
// with no color change anywhere just leave a double-width gap, which the fit
// absorbs.
//
// Result per axis: { start, pitch, count } — cell i spans
// [start + i * pitch, start + (i + 1) * pitch) in image pixels.

import { pixel, colorDistance } from './color.js';

export function detectGrid(img, { edgeThreshold = 70, trimBorder = true } = {}) {
  const full = { x0: 0, y0: 0, x1: img.width, y1: img.height };
  let bounds = trimBorder ? trimUniformBorder(img, full, edgeThreshold) : full;
  let grid = fitGrid(img, bounds, edgeThreshold);
  if (trimBorder) {
    // A first fit gives the cell size; with it we can tell a frame line with a
    // caption or footer beyond it from the last row of cells.
    const framed = cropToFrame(img, bounds, grid, edgeThreshold);
    if (framed) {
      bounds = trimUniformBorder(img, framed, edgeThreshold);
      grid = fitGrid(img, bounds, edgeThreshold);
    }
  }
  return { ...grid, bounds, numEnds: grid.x.count, numPicks: grid.y.count };
}

function fitGrid(img, bounds, edgeThreshold) {
  const sx = edgeSignal(img, bounds, 'x', edgeThreshold);
  const sy = edgeSignal(img, bounds, 'y', edgeThreshold);
  let x = fitAxis(sx, bounds.x0, bounds.x1);
  let y = fitAxis(sy, bounds.y0, bounds.y1);

  // Cells are assumed square. An axis with no boundaries borrows the other's
  // pitch; an axis whose pitch is a whole multiple of the other's is missing
  // every other boundary (e.g. ends threaded in pairs), so it is refitted.
  if (!x && !y) {
    x = { start: bounds.x0, pitch: bounds.x1 - bounds.x0, count: 1 };
    y = { start: bounds.y0, pitch: bounds.y1 - bounds.y0, count: 1 };
  } else if (!x) {
    x = fillAxis(y.pitch, bounds.x0, bounds.x1);
  } else if (!y) {
    y = fillAxis(x.pitch, bounds.y0, bounds.y1);
  } else {
    x = refitIfMultiple(x, y.pitch, sx, bounds.x0, bounds.x1);
    y = refitIfMultiple(y, x.pitch, sy, bounds.y0, bounds.y1);
  }
  return { x, y };
}

// Pixel rectangle of a cell: [x0, x1) × [y0, y1).
export function cellRect(grid, col, row) {
  return {
    x0: grid.x.start + col * grid.x.pitch,
    x1: grid.x.start + (col + 1) * grid.x.pitch,
    y0: grid.y.start + row * grid.y.pitch,
    y1: grid.y.start + (row + 1) * grid.y.pitch,
  };
}

// Strip margins that are one flat color matching the corner of `b`.
function trimUniformBorder(img, b, threshold) {
  const corner = pixel(img, b.x0, b.y0);
  const same = (x, y) => colorDistance(pixel(img, x, y), corner) < threshold;
  let { x0, y0, x1, y1 } = b;
  const colUniform = (x) => { for (let y = y0; y < y1; y++) if (!same(x, y)) return false; return true; };
  const rowUniform = (y) => { for (let x = x0; x < x1; x++) if (!same(x, y)) return false; return true; };
  while (x0 < x1 && colUniform(x0)) x0++;
  while (x1 > x0 && colUniform(x1 - 1)) x1--;
  while (y0 < y1 && rowUniform(y0)) y0++;
  while (y1 > y0 && rowUniform(y1 - 1)) y1--;
  if (x0 >= x1 || y0 >= y1) return b;
  return { x0, y0, x1, y1 };
}

// Cut off captions and footers (e.g. "Handweaving.net #12995" under the
// drawdown). Many renderers draw a thin frame line around the cloth; if what
// lies beyond the outermost such line isn't about one cell thick, it isn't a
// row of cells, so drop it. Returns new bounds, or null if nothing changed.
function cropToFrame(img, b, grid, threshold) {
  const out = { ...b };
  const rows = thinLines(img, out, 'y', threshold);
  [out.y0, out.y1] = cropSides(rows, out.y0, out.y1, grid.y.pitch);
  const cols = thinLines(img, out, 'x', threshold);
  [out.x0, out.x1] = cropSides(cols, out.x0, out.x1, grid.x.pitch);
  const changed = out.x0 !== b.x0 || out.x1 !== b.x1 || out.y0 !== b.y0 || out.y1 !== b.y1;
  return changed ? out : null;
}

function cropSides(lines, lo, hi, pitch) {
  const notACell = (margin) => margin > 1.5 * pitch || (margin > 0 && margin < 0.5 * pitch);
  // A line can only be the frame on the side it's nearer to.
  const mid = (lo + hi) / 2;
  const first = lines.find((l) => l.end <= mid);
  const last = lines.findLast((l) => l.start >= mid);
  return [
    first && notACell(first.start - lo) ? first.start : lo,
    last && notACell(hi - last.end) ? last.end : hi,
  ];
}

// Runs of at most 3 pixel rows (or columns) that are one solid color across
// the whole of `b`, with something different on both sides. Returns
// [{ start, end }] (end exclusive), in order.
function thinLines(img, b, axis, threshold) {
  const [lo, hi, crossLo, crossHi] = axis === 'y' ? [b.y0, b.y1, b.x0, b.x1] : [b.x0, b.x1, b.y0, b.y1];
  const at = (i, c) => (axis === 'y' ? pixel(img, c, i) : pixel(img, i, c));
  const solidColor = (i) => {
    const first = at(i, crossLo);
    for (let c = crossLo + 1; c < crossHi; c++) if (colorDistance(at(i, c), first) >= threshold) return null;
    return first;
  };
  const lines = [];
  let i = lo;
  while (i < hi) {
    const color = solidColor(i);
    if (!color) { i++; continue; }
    let j = i + 1;
    while (j < hi && solidColor(j) && colorDistance(solidColor(j), color) < threshold) j++;
    if (j - i <= 3 && i > lo && j < hi) lines.push({ start: i, end: j });
    i = j;
  }
  return lines;
}

// signal[i] = number of lines across which the color changes between pixel
// i-1 and pixel i along the axis.
function edgeSignal(img, b, axis, threshold) {
  const [lo, hi, crossLo, crossHi] = axis === 'x' ? [b.x0, b.x1, b.y0, b.y1] : [b.y0, b.y1, b.x0, b.x1];
  const signal = new Array(hi).fill(0);
  for (let c = crossLo; c < crossHi; c++) {
    let prev = axis === 'x' ? pixel(img, lo, c) : pixel(img, c, lo);
    for (let i = lo + 1; i < hi; i++) {
      const cur = axis === 'x' ? pixel(img, i, c) : pixel(img, c, i);
      if (colorDistance(prev, cur) > threshold) signal[i]++;
      prev = cur;
    }
  }
  return signal;
}

// Boundary positions: peaks of the signal, with peaks 1–2 px apart (the two
// sides of a grid line, or a soft JPEG edge) merged into one.
function boundaries(signal, lo, hi) {
  const max = Math.max(0, ...signal);
  if (max === 0) return [];
  const cut = Math.max(1, max * 0.1);
  const peaks = [];
  for (let i = lo + 1; i < hi; i++) if (signal[i] >= cut) peaks.push(i);
  const merged = [];
  let group = [];
  for (const p of peaks) {
    if (group.length && p - group[group.length - 1] > 2) {
      merged.push(mean(group));
      group = [];
    }
    group.push(p);
  }
  if (group.length) merged.push(mean(group));
  return merged;
}

function fitAxis(signal, lo, hi, pitchHint = null) {
  const b = boundaries(signal, lo, hi);
  if (b.length < 2) return b.length === 1 && pitchHint ? extend(b[0], pitchHint, lo, hi) : null;
  const gaps = b.slice(1).map((v, i) => v - b[i]);
  let pitch = pitchHint ?? Math.min(...gaps.filter((g) => g >= 2));
  if (!Number.isFinite(pitch)) return null;

  // Number the boundaries, refitting the pitch as we go so rounding error
  // never accumulates across a long image.
  const ks = [0];
  let fit = { offset: b[0], pitch };
  for (let i = 1; i < b.length; i++) {
    ks.push(ks[i - 1] + Math.max(1, Math.round((b[i] - b[i - 1]) / fit.pitch)));
    if (!pitchHint) fit = linearFit(ks, b.slice(0, i + 1)) ?? fit;
  }
  if (pitchHint) fit = { offset: mean(b.map((v, i) => v - ks[i] * pitchHint)), pitch: pitchHint };
  return extend(fit.offset, fit.pitch, lo, hi, ks[ks.length - 1]);
}

// Given boundary 0 at `offset`, count whole cells out to the image edges,
// skipping partial cells (less than ~70% present).
function extend(offset, pitch, lo, hi, lastK = 0) {
  const before = Math.floor((offset - lo) / pitch + 0.3);
  const after = Math.floor((hi - (offset + lastK * pitch)) / pitch + 0.3);
  return { start: offset - before * pitch, pitch, count: before + lastK + after };
}

function fillAxis(pitch, lo, hi) {
  const count = Math.max(1, Math.round((hi - lo) / pitch));
  return { start: lo, pitch: (hi - lo) / count, count };
}

function refitIfMultiple(axis, otherPitch, signal, lo, hi) {
  const ratio = axis.pitch / otherPitch;
  const k = Math.round(ratio);
  if (k < 2 || Math.abs(ratio - k) > 0.15) return axis;
  return fitAxis(signal, lo, hi, axis.pitch / k) ?? axis;
}

function linearFit(xs, ys) {
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx === 0) return null;
  const pitch = sxy / sxx;
  return { offset: my - pitch * mx, pitch };
}

function mean(a) {
  return a.reduce((s, v) => s + v, 0) / a.length;
}
