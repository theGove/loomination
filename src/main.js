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

const libraryBase = new URL('../library/', import.meta.url).href;
const designerUrl = new URL('../designer.html', import.meta.url).href;

const views = {
  library: (el) => mountLibrary(el, {
    libraryBase: el.dataset.libraryBase || libraryBase,
    designerUrl: el.dataset.designerUrl || designerUrl,
  }),
  designer: (el) => mountEditor(el, { libraryBase: el.dataset.libraryBase || libraryBase }),
};

for (const el of document.querySelectorAll('[data-loomination]')) {
  const mount = views[el.dataset.loomination];
  if (mount) mount(el);
  else console.warn(`Loomination: unknown view "${el.dataset.loomination}"`);
}
