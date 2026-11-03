# Loomination — Plan

## Context
A free tool (loomination.org) for beginning/intermediate weavers to: browse historical drafts, see exactly how to set up *their* loom (table or floor, 2–16 shafts) to weave one, design/modify their own drafts with a live drawdown, and plan the warp (yardage, sett, sley, threading). It also builds a copy-paste prompt for the user's own AI (ChatGPT, Claude, etc.) about their yarn stash, and accepts the AI's answer back in a structured format the site can render. No paid APIs, no server.

**Hosting:** the site is a Blogger blog (loomination.org as a free Blogger custom domain). Code lives in a GitHub repo and is served to Blogger through **jsDelivr** (`https://cdn.jsdelivr.net/gh/thegove/loomination@<tag>/...`). The Blogger theme holds only a tiny loader; the loader runs only on posts that need it. Developed locally as plain HTML/JS with no build step.

**Two shafts — yes, worth starting there.** Beyond plain weave, a 2-shaft (or rigid-heddle) loom does color-and-weave (log cabin, houndstooth-style checks, pinwheel, stripes/plaids), weft-faced and warp-faced work, and hand-manipulated laces/pick-up (leno, Brooks bouquet, Danish medallion, soumak). The draft engine treats 2 shafts as just the smallest case, and color-and-weave is a first-class feature for all shaft counts.

## Architecture (plain JS, no build)
```
/index.html            local dev harness — fakes the Blogger page with mount points
/src/core/             pure logic, no DOM
  draft.js             Draft model: threading[], tieup[][], treadling[], liftplan[][], warp/weft colors
  drawdown.js          compute interlacement grid (rising/sinking shed aware)
  wif.js               WIF import/export (industry-standard format: Fiberworks, WeaveIt, iWeaveIt, handweaving.net)
  loom.js              loom profiles + translate a draft to a specific loom (see below)
  warp-calc.js         yardage, sett, reed/sley, take-up/shrinkage, loom waste
  yarns.js             yarn table (8/2, 8/4, 5/2, 10/2, 3/2 cotton, 2/8 wool, etc.: yards-per-pound, suggested setts by structure)
  ai-prompt.js         prompt builder + response parser/validator
/src/ui/               plain DOM components (no framework)
  drawdown-view.js     canvas drawdown with threading/tie-up/treadling around it; click to edit
  library-view.js      pattern browser
  loom-setup-view.js   "how to set up your loom" instructions
  warp-plan-view.js
  ai-view.js
/src/main.js           finds mount elements (<div data-loomination="designer|library|warp|ai">) and boots the matching view
/src/loomination.css
/patterns/index.json   catalog: id, name, shafts, structure, tags, source
/patterns/<id>.json    one draft each, with provenance fields
/blogger/theme-snippet.xml   the loader to paste into the Blogger theme (versioned with the code)
/blogger/post-templates/     HTML to paste into tool posts and pattern posts
```
Plain ES modules, no transpiling or bundling. Locally, serve with any static server (`npx serve` or VS Code Live Server); ES modules won't load from `file://`. The same files are what jsDelivr serves, so local and live run identical code.

## GitHub → jsDelivr → Blogger
- **Release by tag.** Push to GitHub, tag `v0.1.0`; Blogger points at `@v0.1.0`. Tagged URLs are immutable and cached hard by jsDelivr, so the live site never changes until you bump the tag in the theme. (Branch URLs like `@main` are cached for hours and can serve stale/mixed files — use only on a test blog; jsDelivr has a purge URL if needed.)
- **Theme loader** (inside `<b:if cond='data:view.isSingleItem'>`):
  `<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/thegove/loomination@v0.1.0/src/loomination.css">`
  `<script type="module" src="https://cdn.jsdelivr.net/gh/thegove/loomination@v0.1.0/src/main.js"></script>`
  Relative `import`s inside the modules resolve to the same jsDelivr tag automatically. `main.js` exits immediately when the page has no `data-loomination` mount, so ordinary posts cost one small request. Optionally gate further by post label via `<b:if>` on `data:post.labels`.
- **Posts** only contain mount points, e.g. `<div data-loomination="designer"></div>` or `<div data-loomination="pattern" data-id="whig-rose"></div>`.
- **Pattern data lives in the repo** (`/patterns/*.json`, fetched from the same jsDelivr tag), not in post bodies — easier to edit, review in git, and validate with tests. Each notable pattern can still get its own blog post (write-up, photos, comments, SEO) that just mounts the pattern by id; labels on those posts are for readers browsing the blog.
- Saved user designs: `localStorage` plus download/upload as `.wif` or `.json`. No accounts.
- If load time ever matters (many small module files), add an optional bundling step later; not needed to start.

## Phase 1 spec: draft editor (follows handoff.md)
`handoff.md` in the repo is the detailed spec for phase 1. Summary of decisions plus answers to its open questions:

**Checkpoint:** the data model, drawdown function and WIF import/export get built and tested first and reviewed with you **before any UI code**.

**Data model** (plain JSON-serializable object; native save format = this object + `formatVersion`):
- `shafts, treadles, numEnds, numPicks`
- `threading[end]` → shaft (1-based), 0 = empty
- `tieup[shaft][treadle]` → boolean
- `treadling[pick]` → sorted array of treadles (multiple allowed)
- `liftplan[pick]` → sorted array of shafts; `mode: "treadle" | "liftplan"`
- `risingShed` boolean
- `palette[]` RGB; `warpColors[end]`, `weftColors[pick]` → palette index
- `display: { endNumbering: "rtl"|"ltr", tieupCorner: "tr"|"tl"|"br"|"bl" }`
- `meta: { title, notes, source, sourceYear, page, license, transcribedBy }`
- `extraWifSections` — unknown WIF sections kept so they survive a round trip

Sorted arrays instead of `Set`s so the model is plain JSON and easy to compare in tests.

**Drawdown:** one pure function `drawdown(draft) → { warpOnTop[pick][end] }`. Lifted shafts come from the liftplan, or from the union of tie-up columns for that pick's treadles. Warp shows on top when its shaft is lifted; on a sinking-shed loom the result is inverted, and an empty threading always shows weft. The color, interlacement, back-of-cloth and float-warning views are all derived from this one result. UI code never re-computes it.

**WIF 1.1:** lenient INI parser (case-insensitive sections and keys, defaults for missing sections, unknown sections kept). Honors `Rising Shed` and the palette `Range`. Exporter writes the sections listed in the handoff. Also exports the drawdown as a PNG.

**Tests first** (`tests.html`, small assert runner, no framework): 2-shaft plain weave gives a checkerboard; 4-shaft 2/2 twill steps one end per pick; sinking shed is the exact inverse of rising shed; WIF round trip gives an identical model; a handful of real WIF files (in `tests/fixtures/`) import without errors.

**Open questions answered:**
- *Stack / rendering:* plain ES modules. Every grid (threading, tie-up, treadling/liftplan, color bars, drawdown) is a `<canvas>`, not DOM cells. A 400×400 drawdown is 160k cells; redrawing that on canvas is fast, and the same cells as DOM elements would not be. Heavier grid lines every 4 or 8 cells, zoom by changing the cell size, and mouse position maps directly to a cell index for click-and-drag painting.
- *State / undo:* one `store` module holds the current draft. Every edit is a pure function `(draft, args) → newDraft` dispatched through the store, which pushes the previous draft onto an undo stack (capped around 200). Drafts are small, so whole-draft snapshots are simpler and safer than a command-inverse system. Views subscribe and redraw.
- *Save/load / autosave:* the native `.json` format plus WIF. Autosave the current draft to `localStorage` (debounced); "My drafts" list in `localStorage`; download/upload for backup.

**Out of scope for the v1 editor** (per handoff): Jacquard, image-to-draft, profile/block drafting, network drafting, more than one shaft per end, and visual simulation of yarn size and sett. The warp *planner* (yardage arithmetic) stays as a later phase and is not a sett simulation.

## Loom translation (the core "how do I set up my loom" feature)
Loom profile (saved locally): type (table / floor / rigid heddle), shafts (2–16), treadles (floor), shed type (jack/rising vs counterbalance/countermarch), weaving width, reeds owned (dents/inch).
- **Table loom:** convert tie-up+treadling into a **lever lift plan** ("Pick 1: levers 1 & 3"), with repeat blocks.
- **Floor loom:** produce a tie-up that fits the user's treadle count; if the draft needs more treadles than they have, try a **skeleton tie-up** (two-feet treadling) and say so; for sinking-shed looms show which shafts to tie to sink, or full countermarch ties.
- **Shaft count check:** warn if the draft needs more shafts than the loom; for some structures suggest the nearest variant that fits.
- Output reads like weaver instructions: threading right-to-left in groups with repeat counts, heddle counts per shaft, sley pattern for their reed, treadling with repeat counts, tie-up diagram.

## Warp planner
Inputs: draft, warp/weft yarns, finished width/length, number of pieces, sampling allowance. Outputs: EPI/PPI (from yarn table + structure), ends in warp (balanced to complete repeats + floating selvedge option), warp length (loom waste, take-up, shrinkage), yards and approx. pounds/cones per color (from warp color order), weft estimate, feasibility vs. stash.

## AI handoff
1. Form: loom profile + stash (yarn, color, yards each) + goal ("~30 in wide, towels").
2. Site generates a prompt containing: the user's facts, pre-computed constraints (max EPI per yarn, ends needed at 30" for candidate setts, yardage limits), the list of library draft IDs/names that fit their shaft count, and a strict **JSON response schema** (recommendations: draft ID *or* full threading/tie-up/treadling, warp yarn, weft yarn, sett, width, warp length, rationale). Copy button.
3. User pastes the AI's reply back; parser extracts the JSON block, validates (shaft count, yardage actually fits — re-checked with our own calculator, flagging AI math errors), and renders each recommendation as a clickable drawdown that opens in the designer.

## Historical patterns without copyright problems
(Not legal advice, but a conservative approach.) In the US, works published in 1930 or earlier are public domain as of 2026. Also, threading/tie-up/treadling sequences are functional and traditional pattern structures (twill, overshot "Whig Rose") aren't owned by anyone — but a modern book's *presentation, text, photos, and selection* are. So: transcribe from public-domain sources, redraw everything ourselves, and record provenance for every pattern.
Good PD sources:
- **Ralph Griswold's On-Line Digital Archive of Documents on Weaving** (hosted by Univ. of Arizona / now handweaving.net) — scans of PD weaving books and manuscripts.
- **Handweaving.net** — huge draft collection, much from PD sources. Check its terms before importing WIFs in bulk; safer to transcribe from the PD source documents it cites.
- Specific PD books: J. & R. Bronson, *The Domestic Manufacturer's Assistant* (1817); Eliza Calvert Hall, *A Book of Hand-Woven Coverlets* (1912); Mary Meigs Atwater, *The Shuttle-Craft Book of American Hand-Weaving* (1928); Gustaf Oelsner, *A Handbook of Weaves* (Dale translation, 1915 — hundreds of 4–16+ shaft structures); E. A. Posselt's textile books (1880s–1910s); Nisbet, *Grammar of Textile Design* (1906); Watson, *Textile Design and Colour* (1912).
- Historical weavers' manuscript draft books (e.g. 18th–19th c. Pennsylvania German pattern books) held in museums — many digitized; check each holder's reuse terms.
- Avoid: Davison (1944), Strickler (1991), Handwoven/Complex Weavers publications unless permission.
- Later: accept user-submitted drafts under CC0/CC-BY with a provenance field.
Each pattern JSON carries `source`, `sourceYear`, `page`, `license: "public-domain"`, `transcribedBy`.

## Delivery phases
1. **Engine + editor** (per handoff.md): 1a model + drawdown + WIF + tests, **review with you**; 1b canvas editor, editing helpers, undo/redo, views, autosave.
2. **Loom setup**: loom profiles, table-loom lift plans, floor-loom tie-ups/skeleton tie-ups, printable instructions.
3. **Warp planner** + yarn table.
4. **Library**: ~20 seed drafts from Bronson/Atwater/Oelsner (2-shaft color-and-weave, 4-shaft twills/overshot/M&O/huck, 8-shaft twills/blocks), browser over `patterns/index.json`.
5. **AI handoff**: prompt builder, response schema, parser/validator.
6. **Blogger**: theme loader snippet, post templates, first tagged release on jsDelivr.

## Verification
- `index.html` locally: build a draft for each shaft count (2, 4, 8, 16), confirm drawdown matches known references (e.g. 2/2 twill, Atwater overshot) visually.
- Round-trip WIF: import WIFs exported from handweaving.net / a free weaving program, re-export, re-import; drawdown identical.
- Small `tests.html` page running console asserts on core modules (drawdown, lift-plan conversion, warp math against hand-calculated examples).
- AI flow: paste the generated prompt into Claude/ChatGPT with the 8/2 + 8/4 cotton, 30" example; paste the reply back; confirm it parses and yardage checks run.
- Blogger: on a separate test blog, paste the loader pointing at a test tag, create a tool post and a pattern post, confirm the code loads from jsDelivr only where mounts exist and patterns load from the repo. Then bump the tag on the real blog.
