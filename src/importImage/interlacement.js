// Step 5: which thread is on top in each cell, where the image can tell.
// up[row][col] is 1 (warp on top), 0 (weft on top) or -1 (unknown: warp and
// weft are the same color there, or the cell matches neither).

export const UNKNOWN = -1;

export function interlacement(colorGrid, { warp, weft }) {
  let unknown = 0;
  const up = colorGrid.map((row, r) => row.map((cell, c) => {
    const isWarp = cell === warp[c];
    const isWeft = cell === weft[r];
    if (isWarp !== isWeft) return isWarp ? 1 : 0;
    unknown++;
    return UNKNOWN;
  }));
  return { up, unknown };
}
