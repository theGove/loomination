// Step 4: recover warp and weft colors from the cloth.
//
// Every cell shows either its end's warp color or its pick's weft color, so we
// need warp[col] and weft[row] with colorGrid[row][col] ∈ {warp[col], weft[row]}.
//
// Exact search: guess a row's weft color (its most common colors first). Every
// cell in that row that isn't the weft color must be its column's warp color;
// every cell in a now-known column that isn't the warp color must be its row's
// weft color; and so on until everything reachable is fixed or something
// contradicts (then backtrack). Lines nothing constrains get their most common
// color, which keeps ambiguous cells ambiguous for step 6 to resolve.
//
// If no exact answer exists (misread cells), fall back to alternating
// "best warp given wefts / best weft given warps" and report violating cells.

const UNSET = -1;

export function solveColors(colorGrid, { maxNodes = 20000 } = {}) {
  const rows = colorGrid.length;
  const cols = rows ? colorGrid[0].length : 0;
  const budget = { nodes: maxNodes };
  const start = { warp: new Array(cols).fill(UNSET), weft: new Array(rows).fill(UNSET) };
  const exact = search(colorGrid, start, budget);
  if (exact) return { ...exact, violations: [], exact: true };
  return { ...approximate(colorGrid), exact: false };
}

function search(grid, state, budget) {
  if (--budget.nodes < 0) return null;
  const row = state.weft.indexOf(UNSET);
  if (row < 0) {
    // Columns nothing forced show only weft colors; any warp color fits.
    state.warp = state.warp.map((v, c) => (v === UNSET ? mostCommon(grid.map((r) => r[c])) : v));
    return state;
  }
  for (const color of byFrequency(grid[row])) {
    const next = { warp: [...state.warp], weft: [...state.weft] };
    if (!assign(grid, next, 'row', row, color)) continue;
    const found = search(grid, next, budget);
    if (found) return found;
  }
  return null;
}

// Set a line's color and propagate what it forces. Returns false on contradiction.
function assign(grid, state, kind, index, color) {
  const queue = [[kind, index, color]];
  while (queue.length) {
    const [k, i, c] = queue.pop();
    const own = k === 'row' ? state.weft : state.warp;
    if (own[i] !== UNSET) {
      if (own[i] !== c) return false;
      continue;
    }
    own[i] = c;
    const other = k === 'row' ? state.warp : state.weft;
    const n = other.length;
    for (let j = 0; j < n; j++) {
      const cell = k === 'row' ? grid[i][j] : grid[j][i];
      if (cell === c) continue;
      if (other[j] === UNSET) queue.push([k === 'row' ? 'col' : 'row', j, cell]);
      else if (other[j] !== cell) return false;
    }
  }
  return true;
}

function approximate(grid) {
  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  let weft = grid.map((r) => mostCommon(r));
  let warp = new Array(cols).fill(0);
  const explainedBy = (lineCells, crossColors) => {
    const unexplained = lineCells.filter((cell, j) => cell !== crossColors[j]);
    return mostCommon(unexplained.length ? unexplained : lineCells);
  };
  for (let iter = 0; iter < 10; iter++) {
    const nextWarp = warp.map((_, c) => explainedBy(grid.map((r) => r[c]), weft));
    const nextWeft = grid.map((r) => explainedBy(r, nextWarp));
    const stable = nextWarp.every((v, i) => v === warp[i]) && nextWeft.every((v, i) => v === weft[i]);
    warp = nextWarp;
    weft = nextWeft;
    if (stable) break;
  }
  const violations = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== warp[c] && grid[r][c] !== weft[r]) violations.push([r, c]);
    }
  }
  return { warp, weft, violations };
}

function byFrequency(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

function mostCommon(values) {
  return values.length ? byFrequency(values)[0] : 0;
}
