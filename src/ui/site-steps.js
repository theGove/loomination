// The steps in loomination.org's header: 1 Choose a draft, 2 Design,
// 3 Loom setup, 4 Warp plan. Each page's HTML has the step links; this greys
// out steps 2-4 until a draft is chosen, shows a thumbnail of the working
// draft, and shows any one-time notice (e.g. where the previous draft went).

import { loadCurrent, takeNotice, CHANGED } from './saved-drafts.js';
import { paintThumbnail } from './draft-view.js';

const NEEDS_DRAFT = ['design', 'loom', 'warp'];

export function mountSteps(header, { designerUrl }) {
  const nav = header.querySelector('.site-steps');
  if (!nav) return;

  const chip = document.createElement('a');
  chip.className = 'site-draft';
  chip.href = designerUrl;
  chip.innerHTML = '<canvas aria-hidden="true"></canvas><span></span>';
  nav.after(chip);
  const canvas = chip.querySelector('canvas');
  const label = chip.querySelector('span');

  function update() {
    const draft = loadCurrent();
    for (const a of nav.querySelectorAll('[data-step]')) {
      if (!NEEDS_DRAFT.includes(a.dataset.step)) continue;
      if (!a.dataset.href) a.dataset.href = a.getAttribute('href');
      if (draft) {
        a.setAttribute('href', a.dataset.href);
        a.removeAttribute('aria-disabled');
        a.removeAttribute('title');
      } else {
        a.removeAttribute('href');
        a.setAttribute('aria-disabled', 'true');
        a.title = 'Choose a draft first';
      }
    }
    chip.hidden = !draft;
    if (!draft) return;
    const title = draft.meta.title || 'Untitled draft';
    label.textContent = title;
    chip.title = `Working on “${title}”. Open it in the designer.`;
    chip.setAttribute('aria-label', chip.title);
    paintThumbnail(canvas, draft, 40);
  }
  update();
  window.addEventListener(CHANGED, update);
  // Another tab chose or changed the draft.
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === 'loomination.current') update();
  });

  const notice = takeNotice();
  if (notice) {
    const p = document.createElement('p');
    p.className = 'site-notice';
    p.setAttribute('role', 'status');
    p.textContent = notice;
    header.after(p);
  }
}
