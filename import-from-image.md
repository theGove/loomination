# Feature plan: Import draft from image

Add an "Import from image" feature that takes a picture of a drawdown (the woven-cloth
grid only, no threading/tie-up/treadling shown) and rebuilds a working draft from it,
which then opens in the editor and can be saved as WIF through the existing export.

Before coding, read the existing draft model, drawdown function and WIF export, and
reuse them. Do not create a second model or drawdown implementation. Show me the module
breakdown and the solver approach (steps 4–6) before building the UI.

## Scope
- Input: clean, computer-generated drawdown images (screenshots/exports from weaving
  software or websites), PNG/JPG/GIF, loaded by file picker, drag-and-drop or paste.
- Output: a new draft (threading, tie-up, treadling, warp/weft colors) in the existing
  model, opened as a new document (or as an undoable replace).
- Out of scope: photos of real cloth; screenshots that include the full draft
  (threading/tie-up/treadling grids) — possible phase 2; Jacquard-scale images.

## Pipeline (pure functions, no DOM except loading and the dialog)

1. **Load** — draw the image to an offscreen canvas and read pixels with getImageData.

2. **Detect the grid**
   - Build a per-column and per-row "edge strength" signal: how many pixels differ
     noticeably from their neighbor across that line.
   - Estimate cell pitch (allow non-integer, e.g. 7.5 px) and offset from the spacing
     of the peaks (autocorrelation or gap histogram).
   - Tolerate 1-px grid lines between cells, and skip partial cells cropped at the edges.
   - Result: numEnds, numPicks, and the pixel rectangle for each cell.
   - User can override pitch/offset/counts; draw an overlay so they can see the fit.

3. **Sample and group colors**
   - For each cell, take the median color of its central ~50% (avoids edges and grid lines).
   - Cluster cell colors into a palette using a distance threshold (Lab or weighted RGB).
     Threshold is user-adjustable; user can also merge two palette colors by hand.
   - Result: colorGrid[pick][end] → palette index.

4. **Solve warp and weft colors**
   - Find warpColor[end] and weftColor[pick] such that every cell equals one of the two.
   - Approach: pick a row, try each candidate weft color for it; each cell in that row
     that doesn't match then forces its column's warp color; propagate (known warp color
     + mismatching cell forces a row's weft color) until done or a contradiction.
     Backtrack if needed.
   - If no exact solution exists (misread cells), fall back to the assignment with the
     fewest violating cells, and highlight those cells for the user.

5. **Build the up/down grid, with unknowns**
   - Cell matches only the warp color → warp up. Only the weft color → weft up.
   - Warp color == weft color → UNKNOWN (the image cannot tell). Expect many of these
     in color-and-weave designs.

6. **Resolve unknowns to keep the draft simple**
   - Goal: fewest distinct column patterns (= shafts), then fewest distinct row patterns
     (= treadles).
   - Detect the smallest horizontal and vertical repeat consistent with known cells, and
     copy known values across repeats into unknown cells.
   - Group columns whose patterns are compatible (unknowns act as wildcards) and fill
     unknowns from the group; do the same for rows; repeat until nothing changes.
   - Any remaining unknowns: choose values that avoid long floats.

7. **Derive the draft (exact)**
   - Each distinct column pattern → one shaft, numbered in order of first appearance;
     threading[end] = that shaft.
   - Each distinct row pattern → one treadle; treadling[pick] = that treadle.
   - tieup[shaft][treadle] = the up/down value where they meet. Assume rising shed.
   - If treadles exceed a user limit, offer a liftplan instead.
   - Warp and weft colors come from step 4.

8. **Verify**
   - Run the existing drawdown function on the new draft and compare to colorGrid.
     Every cell must match (except cells flagged in step 4). Show a diff overlay if not.
   - Report: ends × picks, shafts, treadles, number of ambiguous cells resolved,
     longest warp and weft floats, and a warning if shafts exceed the user's loom maximum.

## UI (one modal dialog)
- Left: the image with the detected-grid overlay. Controls: pitch, offset, end and pick
  counts, color tolerance, palette swatches (click two to merge), max shafts/treadles.
- Right: the rebuilt drawdown from the derived draft, with a "show differences" toggle.
- Buttons: Analyze, Accept (opens draft in the editor), Cancel.
- Run steps 2–8 in a Web Worker if they block the UI on large images.

## Suggested files
src/importImage/
  loadImage.js, detectGrid.js, sampleColors.js, palette.js, solveColors.js,
  interlacement.js, resolveUnknowns.js, deriveDraft.js, verify.js,
  ImportImageDialog.js (+ css)

## Tests (write first, using synthetic images)
- Generate drawdown images from known drafts with the existing renderer: plain weave,
  2/2 twill, an 8-shaft color-and-weave (log cabin–style) design.
- Vary cell size (4, 5, 7.5, 10 px), with and without 1-px grid lines, and with mild
  JPEG noise.
- For each case assert: grid counts are correct, the derived draft reproduces the
  drawdown exactly, and shaft count ≤ the original draft's.
- An all-one-color image yields a valid draft without crashing.
- Real fixture: test/fixtures/color-and-weave.png (the attached example). Expect about
  24 × 24 cells, 4 colors, ≤ 8 shafts, and an exact drawdown match.