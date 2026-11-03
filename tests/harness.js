// Tiny test harness that runs the same test files in the browser (tests/index.html)
// and in Node (node tests/run-node.mjs). No dependencies.

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(cond, message = 'assertion failed') {
  if (!cond) throw new Error(message);
}

export function assertEqual(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message ? message + ': ' : ''}\n  expected ${e}\n  actual   ${a}`);
}

// Thrown to skip a test, e.g. when an optional local fixture isn't present.
export class Skip extends Error {}

// Files under tests/fixtures/real/ are third-party samples kept out of git, so
// tests that use them skip when they're missing instead of failing.
function isOptional(path) {
  return path.startsWith('real/');
}

async function fetchFixture(path) {
  const url = new URL(`./fixtures/${path}`, import.meta.url);
  try {
    if (typeof window === 'undefined') {
      const { readFile } = await import('node:fs/promises');
      return { bytes: await readFile(url) };
    }
    const res = await fetch(url);
    if (!res.ok) throw Object.assign(new Error(`fixture ${path}: HTTP ${res.status}`), { code: res.status === 404 ? 'ENOENT' : '' });
    return { blob: await res.blob() };
  } catch (err) {
    if (err.code === 'ENOENT' && isOptional(path)) throw new Skip(`${path} not present`);
    throw err;
  }
}

// Read a file under tests/fixtures as text.
export async function loadFixture(path) {
  const { bytes, blob } = await fetchFixture(path);
  return bytes ? new TextDecoder().decode(bytes) : blob.text();
}

// Read an image under tests/fixtures as ImageData-shaped { width, height, data }.
export async function loadImageFixture(path) {
  const { bytes, blob } = await fetchFixture(path);
  if (bytes) {
    const { decodePng } = await import('./png.js');
    return decodePng(bytes);
  }
  const { loadImage } = await import('../src/importImage/loadImage.js');
  return loadImage(blob);
}

export async function run(report = console.log) {
  let failed = 0;
  let skipped = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      report({ name, ok: true });
    } catch (err) {
      if (err instanceof Skip) {
        skipped++;
        report({ name, ok: true, skipped: err.message });
      } else {
        failed++;
        report({ name, ok: false, error: err });
      }
    }
  }
  return { total: tests.length, failed, skipped };
}
