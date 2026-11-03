// Step 3b: group cell colors into a palette.
//
// Leader clustering (each color joins the first cluster center within
// `tolerance`, else starts a new cluster), most frequent colors first, then two
// rounds of re-centering and nearest-center reassignment.

import { colorDistance } from './color.js';

// samples[row][col] = [r, g, b]. Returns { palette, colorGrid } where
// colorGrid[row][col] is an index into palette, and palette is ordered by how
// many cells use each color.
export function clusterColors(samples, { tolerance = 60 } = {}) {
  const counts = new Map();
  for (const row of samples) {
    for (const c of row) {
      const key = c.join(',');
      const entry = counts.get(key);
      if (entry) entry.n++;
      else counts.set(key, { color: c, n: 1 });
    }
  }
  const uniques = [...counts.values()].sort((a, b) => b.n - a.n);

  let centers = [];
  for (const u of uniques) {
    if (!centers.some((c) => colorDistance(c, u.color) < tolerance)) centers.push(u.color);
  }
  let assign = new Map();
  for (let round = 0; round < 2; round++) {
    assign = new Map(uniques.map((u) => [u.color.join(','), nearest(centers, u.color)]));
    centers = centers.map((_, k) => weightedMean(uniques.filter((u) => assign.get(u.color.join(',')) === k)) ?? centers[k]);
  }

  // Order the palette by use, dropping any center that ended up empty.
  const use = centers.map(() => 0);
  for (const u of uniques) use[assign.get(u.color.join(','))] += u.n;
  const order = use.map((n, k) => [n, k]).filter(([n]) => n > 0).sort((a, b) => b[0] - a[0]).map(([, k]) => k);
  const remap = new Map(order.map((k, i) => [k, i]));
  const palette = order.map((k) => centers[k].map(Math.round));
  const colorGrid = samples.map((row) => row.map((c) => remap.get(assign.get(c.join(',')))));
  return { palette, colorGrid };
}

// Merge palette color `from` into `into` (both indices); for the UI's
// "click two swatches to merge". Returns a new { palette, colorGrid }.
export function mergeColors({ palette, colorGrid }, from, into) {
  if (from === into) return { palette, colorGrid };
  const remap = (i) => {
    const j = i === from ? into : i;
    return j > from ? j - 1 : j;
  };
  return {
    palette: palette.filter((_, i) => i !== from),
    colorGrid: colorGrid.map((row) => row.map(remap)),
  };
}

function nearest(centers, color) {
  let best = 0;
  let bestD = Infinity;
  centers.forEach((c, k) => {
    const d = colorDistance(c, color);
    if (d < bestD) { best = k; bestD = d; }
  });
  return best;
}

function weightedMean(items) {
  const total = items.reduce((s, u) => s + u.n, 0);
  if (!total) return null;
  return [0, 1, 2].map((ch) => items.reduce((s, u) => s + u.color[ch] * u.n, 0) / total);
}
