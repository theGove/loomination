// Escape text for use inside HTML built with template strings.
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Save a Blob as a file through the browser's download.
export function downloadBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Show that something is under way: a spinner before the element's text
 * (CSS .ldm-working). A button is also disabled, so it can't be pressed twice.
 * Optionally replaces the text for the duration; returns a function that
 * puts everything back.
 */
export function working(el, text = null) {
  if (!el) return () => {};
  const before = el.textContent;
  el.classList.add('ldm-working');
  el.setAttribute('aria-busy', 'true');
  if (text !== null) el.textContent = text;
  const button = el.tagName === 'BUTTON';
  if (button) el.disabled = true;
  return () => {
    el.classList.remove('ldm-working');
    el.removeAttribute('aria-busy');
    if (text !== null) el.textContent = before;
    if (button) el.disabled = false;
  };
}

/** Run fn() while `el` shows it's working (see working()). */
export async function whileWorking(el, fn, text = null) {
  const done = working(el, text);
  try {
    return await fn();
  } finally {
    done();
  }
}
