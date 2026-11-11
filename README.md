# Loomination

Free weaving-draft tools for loomination.org: historical drafts, a draft editor
with live drawdown, loom setup instructions for 2–16 shaft table and floor
looms, a warp planner, and an "ask your AI" helper. See [docs/PLAN.md](docs/PLAN.md).

Plain ES modules, no build step. Code is served to the Blogger site from this
repo through jsDelivr at a tagged version.

## Saved data

My drafts, the loom profile, warp plan, AI helper and cone settings are kept in
this browser, and in the weaver's own Google Drive when they choose **Save to
Google Drive** in the header. That uses [Teather](https://teather.technologylearningcompany.com):
pages load `https://teather.technologylearningcompany.com/v1/teather.js` with `defer` before
`src/main.js`, and [src/ui/sync.js](src/ui/sync.js) wraps it. Without it
(offline, or views embedded elsewhere) everything still works locally. The
autosaved working draft stays in the browser only.

## Development

ES modules don't load from `file://`, so serve the folder:

    npx serve .

Serve on port 3000 (the default) to test signing in: Teather allows
`http://localhost:3000` for Loomination.

## Tests

    node tests/run-node.mjs

or open `tests/index.html` through the local server.

`tests/fixtures/real/` holds third-party sample files (WIFs, drawdown images
from handweaving.net, etc.) and is ignored by git. To test real WIF files, put
them there and list their names in `tests/fixtures/real/manifest.json`. Tests
that need these files are skipped when they're missing.

## Making WIF files from drawdown images

With the local server running, open `/tools/image-to-wif.html`, drop or paste a
clean drawdown image (the cloth grid only), check that the rebuilt drawdown
matches, fill in title and source, and download the `.wif`. The pipeline lives
in `src/importImage/` (see `import-from-image.md`).
