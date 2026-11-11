// "Save to Google Drive" in the site header. Signing in through Teather keeps
// My drafts and settings in the weaver's own Google Drive, so they follow them
// to any computer. Signed in, it shows their picture, sync status and a menu.

import * as sync from './sync.js';
import { log } from './debug.js';

const STATUS_TEXT = {
  'signed-out': 'Not signed in',
  syncing: 'Saving to your Google Drive…',
  synced: 'Saved in your Google Drive',
  offline: 'Offline. Changes will save when you reconnect.',
  error: "Couldn't reach your Google Drive. Changes are kept here and will be retried.",
};

export function mountAccount(header) {
  const T = sync.teatherApi();
  if (!T) return;

  const box = document.createElement('div');
  box.className = 'ldm-account';
  header.append(box);

  // Data that arrives from Drive while signing in may differ from what this
  // page loaded, so reload once sign-in has synced.
  let sawRemote = false;
  T.onChange((c) => {
    if (c.source === 'remote') sawRemote = true;
  });

  function render() {
    const user = T.user();
    if (!user) {
      box.innerHTML = `<button type="button" class="ldm-account-signin"
        title="Keep your saved drafts and settings in your own Google Drive, so they follow you to any computer.">Save to Google Drive</button>`;
      box.querySelector('button').addEventListener('click', signIn);
      return;
    }
    box.innerHTML = `<details>
        <summary title="Your account"><img alt="" referrerpolicy="no-referrer" width="28" height="28"><span class="ldm-account-dot"></span></summary>
        <div class="ldm-account-menu">
          <strong class="ldm-account-name"></strong>
          <small class="ldm-account-email"></small>
          <small class="ldm-account-status"></small>
          <a href="https://teather.technologylearningcompany.com/manage?site=loomination.org" target="_blank" rel="noopener">Manage your saved data</a>
          <button type="button" data-signout>Sign out</button>
        </div>
      </details>`;
    box.querySelector('img').src = T.pictureUrl(56);
    box.querySelector('.ldm-account-name').textContent = user.name || user.email;
    box.querySelector('.ldm-account-email').textContent = user.name ? user.email : '';
    box.querySelector('[data-signout]').addEventListener('click', signOut);
    showStatus(T.status());
  }

  function showStatus(s) {
    box.dataset.status = s;
    const el = box.querySelector('.ldm-account-status');
    if (el) el.textContent = STATUS_TEXT[s] || '';
  }

  async function signIn() {
    const btn = box.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    btn.classList.add('ldm-working');
    // If the weaver closes the Google window, let them try again.
    const retry = setTimeout(() => {
      if (!T.user()) render();
    }, 4000);
    sawRemote = false;
    try {
      await T.signIn();
      clearTimeout(retry);
      if (sawRemote) {
        log('sync', 'signed in; reloading to show the data from Drive');
        location.reload();
      }
      else render();
    } catch (err) {
      clearTimeout(retry);
      render();
      if (err && !['cancelled', 'timeout'].includes(err.code)) alert(err.message || 'Sign-in did not finish.');
    }
  }

  async function signOut() {
    if (!confirm('Sign out? Your drafts and settings stay in your Google Drive, and are removed from this browser.')) return;
    await T.signOut();
    location.reload();
  }

  T.onAuthChange(render);
  T.onStatus(showStatus);
  render();
}
