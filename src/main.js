// Boots Loomination views into any page, including a blog post:
//   <link rel="stylesheet" href=".../src/loomination.css">
//   <div data-loomination="library"></div>
//   <script type="module" src=".../src/main.js"></script>
//
// Paths to the library are resolved from this file's URL, so the same markup
// works on loomination.org, from a CDN, and on a local server. A page that
// hosts the designer somewhere else can say so with data-designer-url.

import { mountLibrary } from './ui/library-view.js';
import { mountEditor } from './ui/editor-view.js';
import { mountLoomSetup } from './ui/loom-view.js';
import { mountWarpPlanner } from './ui/warp-view.js';
import { mountAiHelper } from './ui/ai-view.js';
import { mountConeEstimator } from './ui/cone-view.js';
import * as sync from './ui/sync.js';
import * as debug from './ui/debug.js';
import { mountAccount } from './ui/account.js';

const defaults = {
  libraryBase: new URL('../library/', import.meta.url).href,
  designerUrl: new URL('../designer.html', import.meta.url).href,
  loomUrl: new URL('../loom.html', import.meta.url).href,
  warpUrl: new URL('../warp.html', import.meta.url).href,
  aiUrl: new URL('../ai.html', import.meta.url).href,
  coneUrl: new URL('../yarn.html', import.meta.url).href,
  imageToWifUrl: new URL('../tools/image-to-wif.html', import.meta.url).href,
};

// Each option can be overridden on the element, e.g. data-library-base="...".
const options = (el) => Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, el.dataset[k] || v]));

const views = {
  library: (el) => mountLibrary(el, options(el)),
  designer: (el) => mountEditor(el, options(el)),
  loom: (el) => mountLoomSetup(el, options(el)),
  warp: (el) => mountWarpPlanner(el, options(el)),
  ai: (el) => mountAiHelper(el, options(el)),
  cone: (el) => mountConeEstimator(el, options(el)),
};

// Saved data: move anything from older versions, give teather.js a moment to
// load, show the sign-in control on loomination.org pages, and wait (briefly)
// for the first sync so views start from the weaver's latest data. Both waits
// are capped, so a slow teather.pages.dev delays the page by seconds at most.
debug.start();
sync.migrateLegacy();
await sync.loaded(2000);
debug.watchSync(sync.teatherApi());
const header = document.querySelector('.site-header');
if (header) {
  try {
    mountAccount(header);
  } catch (err) {
    console.warn('Loomination: account control failed', err);
  }
}
debug.log('page', 'waiting for the first sync');
const t0 = performance.now();
await sync.ready(3000);
debug.log('page', `first sync wait over after ${Math.round(performance.now() - t0)} ms`);

for (const el of document.querySelectorAll('[data-loomination]')) {
  const mount = views[el.dataset.loomination];
  if (mount) {
    debug.before('page', `showing ${el.dataset.loomination}`);
    debug.timed('page', `show ${el.dataset.loomination}`, () => mount(el));
    debug.log('page', `${el.dataset.loomination} shown`);
  } else {
    console.warn(`Loomination: unknown view "${el.dataset.loomination}"`);
  }
}
