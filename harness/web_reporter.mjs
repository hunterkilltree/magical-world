// node:test reporter that prints the same PASS / FAIL lines as the Godot test runner
// (`PASS  web/test_r080_coop_sim.test.mjs::name`), so `harness/run.sh story` can read them.
import { basename } from 'node:path';

export default async function* reporter(source) {
  let passed = 0;
  let failed = 0;
  for await (const e of source) {
    if (e.type !== 'test:pass' && e.type !== 'test:fail') continue;
    if (e.data.details?.type === 'suite') continue;
    const where = `web/${basename(e.data.file ?? '?')}::${e.data.name}`;
    if (e.type === 'test:pass') {
      passed++;
      yield `PASS  ${where}\n`;
    } else {
      failed++;
      const err = e.data.details?.error;
      const msg = String(err?.cause?.message ?? err?.message ?? err ?? '').split('\n').slice(0, 6).join('\n      ');
      yield `FAIL  ${where}\n      ${msg}\n`;
    }
  }
  yield `web tests: ${passed} passed, ${failed} failed\n`;
  if (failed) process.exitCode = 1;
}
