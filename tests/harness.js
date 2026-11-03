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

// Read a file under tests/fixtures as text.
export async function loadFixture(path) {
  const url = new URL(`./fixtures/${path}`, import.meta.url);
  if (typeof window === 'undefined') {
    const { readFile } = await import('node:fs/promises');
    return readFile(url, 'utf8');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fixture ${path}: HTTP ${res.status}`);
  return res.text();
}

export async function run(report = console.log) {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      report({ name, ok: true });
    } catch (err) {
      failed++;
      report({ name, ok: false, error: err });
    }
  }
  return { total: tests.length, failed };
}
