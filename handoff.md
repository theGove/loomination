# Weaving Draft Editor — planning brief

Plan an interactive editor for shaft-loom weaving drafts. Please confirm the
data model, the drawdown calculation and the WIF import/export approach with me
before writing UI code, since those three are where errors are hardest to fix later.

## Domain conventions (standard four-part draft)
- **Threading** (top grid): one column per warp end; marks which shaft that end is on.
- **Tie-up** (top-right by default): rows = shafts, columns = treadles; filled = tied.
- **Treadling** (right grid): one row per pick; marks which treadle(s) are pressed.
- **Liftplan** (alternative to tie-up + treadling, for dobby looms): one row per pick;
  marks which shafts are lifted directly.
- **Drawdown** (main area): the simulated cloth.
- **Color bars**: one color per warp end (along the top), one per pick (along the side).
- Numbering conventionally runs right-to-left for warp ends (American style). Make
  numbering direction and tie-up corner configurable (Scandinavian/European layouts differ).

## Data model (keep it plain and serializable)
- `shafts`, `treadles`, `numEnds`, `numPicks` (integers)
- `threading[end]` → shaft number, or 0 for empty
- `tieup[shaft][treadle]` → boolean
- `treadling[pick]` → set of treadle numbers (allow more than one per pick)
- `liftplan[pick]` → set of shaft numbers (used when in liftplan mode)
- `risingShed` → boolean
- `palette` → list of RGB colors; `warpColors[end]`, `weftColors[pick]` → palette index
- Optional metadata: title, notes, source

## Drawdown calculation (one pure function, fully unit-tested)
For each pick j: lifted = liftplan[j], or the union of tieup columns for treadling[j].
For each end i: warpOnTop = threading[i] ∈ lifted (invert if sinking shed).
Cell color = warpOnTop ? warpColors[i] : weftColors[j]. Empty threading → weft.
Never duplicate this logic in UI code.

## Editing
- Click to toggle cells in threading, tie-up, treadling and liftplan; click-drag to paint.
- Click a color bar cell to assign the current palette color; drag to paint.
- Insert and delete warp ends and picks; change shaft and treadle counts.
- Select, copy, paste and repeat a range of ends or picks.
- Fill helpers: straight draw, point (mirrored) draw, "treadle as drawn in".
- Switch between treadling + tie-up and liftplan, converting between them
  (liftplan → treadles may need a new tie-up built from the distinct lift rows).
- Undo/redo for every edit.

## Views
- Color drawdown (default).
- Interlacement view (warp black, weft white) to see the structure alone.
- Long-float warning: highlight warp or weft floats longer than a chosen length.
- Back of cloth (inverted).
- Zoom; heavier grid lines every 4 or 8 cells.

## WIF 1.1 import/export
- INI-style text. Sections to support: [WIF], [CONTENTS], [WEAVING], [WARP], [WEFT],
  [THREADING], [TIEUP], [TREADLING], [LIFTPLAN], [COLOR PALETTE], [COLOR TABLE],
  [WARP COLORS], [WEFT COLORS], [NOTES].
- Honor `Rising Shed`; scale colors using the palette `Range` (0–255, 0–999, etc.).
- Be lenient on import: missing sections fall back to defaults, sections and keys
  are matched case-insensitively, and unknown sections are ignored without failing.
  Keep unknown sections if practical so they survive a round trip.
- Export valid WIF that Fiberworks, WeaveIt and Handweaving.net can open.
- Also export the drawdown as a PNG.

## Tests (write these first)
- 2 shafts, plain weave tie-up → checkerboard.
- 4 shafts, 2/2 twill → diagonal stepping one end per pick.
- Sinking shed produces the exact inverse of rising shed.
- WIF round trip: import → export → import gives an identical model.
- Import a few real WIF files (e.g. from handweaving.net) without errors.

## Out of scope for v1
Jacquard and image-to-draft, profile/block drafting, network drafting,
yarn sizes and sett simulation, multiple shafts per warp end.

## Questions the plan should answer
- Tech stack, and how the grids render efficiently (canvas vs DOM) at 400+ ends.
- Where state lives and how undo/redo is implemented.
- File save/load beyond WIF (native JSON format?), and autosave.