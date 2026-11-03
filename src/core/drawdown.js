import { shaftsForPick } from './draft.js';

// The one place interlacement is computed. Every view (color, interlacement,
// back of cloth, float warnings) derives from this result.
//
// Returns { warpOnTop } where warpOnTop[pick][end] is true when the warp end
// shows on the face of the cloth at that pick.
export function drawdown(draft) {
  const warpOnTop = new Array(draft.numPicks);
  for (let p = 0; p < draft.numPicks; p++) {
    const moved = new Set(shaftsForPick(draft, p));
    const row = new Array(draft.numEnds);
    for (let e = 0; e < draft.numEnds; e++) {
      const shaft = draft.threading[e];
      // An unthreaded end isn't in the cloth; show weft there on both shed types.
      row[e] = shaft === 0 ? false : moved.has(shaft) === draft.risingShed;
    }
    warpOnTop[p] = row;
  }
  return { warpOnTop };
}

// RGB color of every cell of the face of the cloth.
export function drawdownColors(draft, dd = drawdown(draft)) {
  return dd.warpOnTop.map((row, p) =>
    row.map((up, e) => draft.palette[up ? draft.warpColors[e] : draft.weftColors[p]]));
}

// Longest-run float lengths, for float warnings. A warp float is a vertical run
// of warp-on-top cells; a weft float is a horizontal run of weft-on-top cells.
// Returns per-cell run lengths so a view can highlight cells above a threshold.
export function floatLengths(dd) {
  const picks = dd.warpOnTop.length;
  const ends = picks ? dd.warpOnTop[0].length : 0;
  const warp = Array.from({ length: picks }, () => new Array(ends).fill(0));
  const weft = Array.from({ length: picks }, () => new Array(ends).fill(0));
  for (let e = 0; e < ends; e++) {
    let p = 0;
    while (p < picks) {
      const up = dd.warpOnTop[p][e];
      let q = p;
      while (q < picks && dd.warpOnTop[q][e] === up) q++;
      if (up) for (let i = p; i < q; i++) warp[i][e] = q - p;
      p = q;
    }
  }
  for (let p = 0; p < picks; p++) {
    let e = 0;
    while (e < ends) {
      const up = dd.warpOnTop[p][e];
      let f = e;
      while (f < ends && dd.warpOnTop[p][f] === up) f++;
      if (!up) for (let i = e; i < f; i++) weft[p][i] = f - e;
      e = f;
    }
  }
  return { warp, weft };
}
