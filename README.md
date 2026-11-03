# Loomination

Free weaving-draft tools for loomination.org: historical drafts, a draft editor
with live drawdown, loom setup instructions for 2–16 shaft table and floor
looms, a warp planner, and an "ask your AI" helper. See [docs/PLAN.md](docs/PLAN.md).

Plain ES modules, no build step. Code is served to the Blogger site from this
repo through jsDelivr at a tagged version.

## Development

ES modules don't load from `file://`, so serve the folder:

    npx serve .

## Tests

    node tests/run-node.mjs

or open `tests/index.html` through the local server.

To test real WIF files, put them in `tests/fixtures/real/` and add their file
names to `tests/fixtures/real/manifest.json`.

## Making WIF files from drawdown images

With the local server running, open `/tools/image-to-wif.html`, drop or paste a
clean drawdown image (the cloth grid only), check that the rebuilt drawdown
matches, fill in title and source, and download the `.wif`. The pipeline lives
in `src/importImage/` (see `import-from-image.md`).
