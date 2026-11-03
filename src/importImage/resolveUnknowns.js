// Step 6: fill unknown cells so the draft stays as simple as possible —
// fewest distinct columns (shafts), then fewest distinct rows (treadles).
//
// 1. Repeats: find the smallest horizontal and vertical period consistent with
//    the known cells and copy known values across repeats.
// 2. Grouping: columns that agree wherever both are known (unknowns are
//    wildcards) are put in one group and fill each other's gaps; same for rows.
//    Repeat until nothing changes.
// 3. Whatever is still unknown is the same for a whole column group × row
//    group, so it's decided once per block, choosing the value that makes
//    shorter floats.

import { UNKNOWN } from './interlacement.js';

export function resolveUnknowns(input) {
  const up = input.map((row) => [...row]);
  const before = countUnknown(up);
  if (before === 0) return { up, resolved: 0 };

  for (let pass = 0; pass < 10; pass++) {
    let changed = fillRepeats(up) + fillRepeats(up, true);
    changed += groupFill(columns(up), (c, r, v) => { up[r][c] = v; });
    changed += groupFill(up, (r, c, v) => { up[r][c] = v; });
    if (!changed) break;
  }
  fillRemaining(up);
  return { up, resolved: before };
}

function countUnknown(up) {
  return up.reduce((n, row) => n + row.filter((v) => v === UNKNOWN).length, 0);
}

function columns(up) {
  const cols = up.length ? up[0].length : 0;
  return Array.from({ length: cols }, (_, c) => up.map((row) => row[c]));
}

// --- 1. repeats ---

// Fill along rows (horizontal period), or along columns when vertical is true.
function fillRepeats(up, vertical = false) {
  const lines = vertical ? columns(up) : up;
  const length = lines.length ? lines[0].length : 0;
  const period = smallestPeriod(lines, length);
  if (!period) return 0;
  let changed = 0;
  lines.forEach((line, i) => {
    for (let r = 0; r < period; r++) {
      const v = classValue(line, r, period);
      if (v === UNKNOWN) continue;
      for (let j = r; j < length; j += period) {
        if (line[j] !== UNKNOWN) continue;
        if (vertical) up[j][i] = v;
        else up[i][j] = v;
        changed++;
      }
    }
  });
  return changed;
}

// Smallest period P (at most half the length, so every class has at least two
// members) for which every residue class of every line has one known value.
function smallestPeriod(lines, length) {
  for (let p = 1; p <= Math.floor(length / 2); p++) {
    if (lines.every((line) => {
      for (let r = 0; r < p; r++) if (classValue(line, r, p) === null) return false;
      return true;
    })) return p;
  }
  return null;
}

// The known value shared by line[r], line[r+p], ...: UNKNOWN if none are known,
// null if they disagree.
function classValue(line, r, p) {
  let v = UNKNOWN;
  for (let j = r; j < line.length; j += p) {
    if (line[j] === UNKNOWN) continue;
    if (v === UNKNOWN) v = line[j];
    else if (v !== line[j]) return null;
  }
  return v;
}

// --- 2. grouping ---

// lines[i][j]; set(i, j, v) writes back into the grid. Returns cells filled.
function groupFill(lines, set) {
  const order = lines.map((line, i) => [i, line.filter((v) => v !== UNKNOWN).length])
    .sort((a, b) => b[1] - a[1]).map(([i]) => i);
  const groups = [];
  const groupOf = new Array(lines.length);
  for (const i of order) {
    let best = -1;
    let bestAgree = -1;
    groups.forEach((pattern, g) => {
      const agree = agreement(pattern, lines[i]);
      if (agree > bestAgree) { best = g; bestAgree = agree; }
    });
    if (best < 0) {
      groups.push([...lines[i]]);
      best = groups.length - 1;
    } else {
      lines[i].forEach((v, j) => { if (v !== UNKNOWN) groups[best][j] = v; });
    }
    groupOf[i] = best;
  }
  let changed = 0;
  lines.forEach((line, i) => {
    const pattern = groups[groupOf[i]];
    line.forEach((v, j) => {
      if (v === UNKNOWN && pattern[j] !== UNKNOWN) {
        set(i, j, pattern[j]);
        changed++;
      }
    });
  });
  return changed;
}

// Number of positions where both are known and equal; -1 if they conflict.
function agreement(a, b) {
  let n = 0;
  for (let j = 0; j < a.length; j++) {
    if (a[j] === UNKNOWN || b[j] === UNKNOWN) continue;
    if (a[j] !== b[j]) return -1;
    n++;
  }
  return n;
}

// --- 3. leftovers ---

function fillRemaining(up) {
  if (countUnknown(up) === 0) return;
  const colGroup = groupIds(columns(up));
  const rowGroup = groupIds(up);
  const blocks = new Map();
  up.forEach((row, r) => row.forEach((v, c) => {
    if (v !== UNKNOWN) return;
    const key = `${rowGroup[r]},${colGroup[c]}`;
    if (!blocks.has(key)) blocks.set(key, { rg: rowGroup[r], cg: colGroup[c], cells: [] });
    blocks.get(key).cells.push([r, c]);
  }));
  for (const { rg, cg, cells } of blocks.values()) {
    const weftCost = cells.reduce((s, [r, c]) => s + run(up, r, c, 0, 0, 1), 0);
    const warpCost = cells.reduce((s, [r, c]) => s + run(up, r, c, 1, 1, 0), 0);
    const v = warpCost < weftCost ? 1 : weftCost < warpCost ? 0 : (rg + cg) % 2;
    for (const [r, c] of cells) up[r][c] = v;
  }
}

// Length of the float through (r, c) if it were set to v: warp floats run
// vertically, weft floats horizontally.
function run(up, r, c, v, dr, dc) {
  let n = 1;
  for (const s of [-1, 1]) {
    let rr = r + s * dr;
    let cc = c + s * dc;
    while (up[rr]?.[cc] === v) {
      n++;
      rr += s * dr;
      cc += s * dc;
    }
  }
  return n;
}

function groupIds(lines) {
  const ids = new Map();
  return lines.map((line) => {
    const key = line.join(',');
    if (!ids.has(key)) ids.set(key, ids.size);
    return ids.get(key);
  });
}
