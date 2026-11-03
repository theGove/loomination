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

const defaults = {
  libraryBase: new URL('../library/', import.meta.url).href,
  designerUrl: new URL('../designer.html', import.meta.url).href,
  loomUrl: new URL('../loom.html', import.meta.url).href,
  warpUrl: new URL('../warp.html', import.meta.url).href,
};

// Each option can be overridden on the element, e.g. data-library-base="...".
const options = (el) => Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, el.dataset[k] || v]));

const views = {
  library: (el) => mountLibrary(el, options(el)),
  designer: (el) => mountEditor(el, options(el)),
  loom: (el) => mountLoomSetup(el, options(el)),
  warp: (el) => mountWarpPlanner(el, options(el)),
  ai: (el) => mountAiHelper(el, options(el)),
};

for (const el of document.querySelectorAll('[data-loomination]')) {
  const mount = views[el.dataset.loomination];
  if (mount) mount(el);
  else console.warn(`Loomination: unknown view "${el.dataset.loomination}"`);
}
