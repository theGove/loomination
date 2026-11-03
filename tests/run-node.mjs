// Run the test suite from the command line: node tests/run-node.mjs
import { run } from './harness.js';
import './core.test.js';
import './wif.test.js';
import './importImage.test.js';

const { total, failed } = await run(({ name, ok, error }) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) console.log(`     ${error.message}`);
});
console.log(`\n${total - failed}/${total} passed`);
process.exitCode = failed ? 1 : 0;
