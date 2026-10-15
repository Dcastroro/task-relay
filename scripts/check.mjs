import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const files = [];
for (const dir of ['src', 'bin', 'scripts', 'examples', 'test']) {
  for (const name of readdirSync(dir)) if (name.endsWith('.mjs')) files.push(join(dir, name));
}
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (process.argv.includes('--syntax-only')) process.exit(0);
const tests = spawnSync(process.execPath, ['--test'], { stdio: 'inherit' });
process.exitCode = tests.status ?? 1;
