// Step 7: turn a fully known up/down grid into a draft, exactly.
// Each distinct column pattern is a shaft (numbered from end 1 in order of
// first appearance, so twills come out as straight draws); each distinct row
// pattern is a treadle; the tie-up is where they meet. Rising shed.

import { createDraft, toLiftplan } from '../core/draft.js';
import { columnToEnd } from '../core/render.js';

export function deriveDraft(up, { warp, weft }, palette, { endNumbering = 'rtl', maxTreadles = Infinity } = {}) {
  const numPicks = up.length;
  const numEnds = numPicks ? up[0].length : 0;
  const draft = createDraft({ numEnds, numPicks, palette });
  draft.display.endNumbering = endNumbering;

  const colOfEnd = new Array(numEnds);
  for (let col = 0; col < numEnds; col++) colOfEnd[columnToEnd(draft, col)] = col;

  const shaftOf = new Map();
  const shaftCol = [];
  for (let end = 0; end < numEnds; end++) {
    const col = colOfEnd[end];
    const key = up.map((row) => row[col]).join('');
    if (!shaftOf.has(key)) {
      shaftOf.set(key, shaftOf.size + 1);
      shaftCol.push(col);
    }
    draft.threading[end] = shaftOf.get(key);
    draft.warpColors[end] = warp[col];
  }

  const treadleOf = new Map();
  const treadleRow = [];
  for (let pick = 0; pick < numPicks; pick++) {
    const key = shaftCol.map((col) => up[pick][col]).join('');
    if (!treadleOf.has(key)) {
      treadleOf.set(key, treadleOf.size + 1);
      treadleRow.push(pick);
    }
    draft.treadling[pick] = [treadleOf.get(key)];
    draft.weftColors[pick] = weft[pick];
  }

  draft.shafts = Math.max(shaftCol.length, 1);
  draft.treadles = Math.max(treadleRow.length, 1);
  draft.tieup = Array.from({ length: draft.shafts }, (_, s) =>
    Array.from({ length: draft.treadles }, (_, t) => up[treadleRow[t]]?.[shaftCol[s]] === 1));

  return draft.treadles > maxTreadles ? toLiftplan(draft) : draft;
}
