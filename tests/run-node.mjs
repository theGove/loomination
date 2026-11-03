// Run the test suite from the command line: node tests/run-node.mjs
import { run } from './harness.js';
import './core.test.js';
import './wif.test.js';
import './importImage.test.js';
import './library.test.js';
import './edits.test.js';
import './loom.test.js';
import './warp.test.js';

const { total, failed, skipped } = await run(({ name, ok, error, skipped }) => {
  console.log(`${skipped ? 'skip' : ok ? 'ok  ' : 'FAIL'} ${name}${skipped ? ` (${skipped})` : ''}`);
  if (!ok) console.log(`     ${error.message}`);
});
console.log(`\n${total - failed - skipped}/${total} passed${skipped ? `, ${skipped} skipped` : ''}`);
process.exitCode = failed ? 1 : 0;
