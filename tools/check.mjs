// Parses every source module as ESM. `node --check` treats .js as CommonJS and
// silently misses real syntax errors, so we import for real instead.
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})('src');

let failed = 0;
for (const f of files.sort()) {
  try {
    await import('../' + f);
  } catch (e) {
    // ReferenceError on `document` just means the module needs a browser.
    if (e instanceof SyntaxError || /is not defined/.test(e.message) === false) {
      console.log(`FAIL ${f}\n     ${e.constructor.name}: ${String(e.message).split('\n')[0]}`);
      failed++;
    }
  }
}
console.log(`${files.length} modules parsed, ${failed} failing`);
process.exit(failed ? 1 : 0);
