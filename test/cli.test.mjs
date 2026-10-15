import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
const cli = fileURLToPath(new URL('../bin/task-relay.mjs', import.meta.url));
const task = script => ({ command: ['$node', '-e', script] });
function fixture(t, tasks = { a: task('') }) {
  const root = mkdtempSync(join(tmpdir(), 'relay-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'task-relay.json'), JSON.stringify({ version: 1, tasks }));
  return root;
}
function exec(cwd, args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  return result;
}

test('plan validates dependencies without executing commands', t => {
  const root = fixture(t, { a: task("require('node:fs').writeFileSync('marker','bad')") });
  const result = exec(root, ['plan', '--json']);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).action, 'plan');
  assert.equal(existsSync(join(root, 'marker')), false);
});

test('paths resolve from the config directory, even when invoked elsewhere', t => {
  const root = fixture(t, { a: task("require('node:fs').writeFileSync('marker','ok')") });
  const result = exec(tmpdir(), ['run', '--config', join(root, 'task-relay.json'), '--json']);
  assert.equal(result.status, 0);
  assert.equal(existsSync(join(root, 'marker')), true);
});

test('JSON contains exactly one report and excludes child output and command arguments', t => {
  const root = fixture(t, { a: task("console.log('PRIVATE_SENTINEL');console.error('PRIVATE_SENTINEL');process.exitCode=3") });
  const result = exec(root, ['run', '--json']);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).tasks[0].exitCode, 3);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.includes('PRIVATE_SENTINEL'), false);
});

test('verbose sends child output to stderr while human status stays on stdout', t => {
  const result = exec(fixture(t, { a: task("console.log('example output')") }), ['run', '--verbose']);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /example output/);
  assert.match(result.stdout, /PASSED a/);
});

test('selected targets exclude unrelated commands', t => {
  const root = fixture(t, { a: task(''), unwanted: task('process.exitCode=7'), build: { ...task(''), needs: ['a'] } });
  const result = exec(root, ['run', 'build', '--json', '--concurrency', '1']);
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout).tasks.map(task => task.name), ['a', 'build']);
});

test('invalid arguments and unknown targets return exit 2 without reflecting input', t => {
  const root = fixture(t);
  for (const args of [[], ['oops'], ['run', '--bad'], ['run', '--config'], ['run', '--json', '--verbose'], ['run', '--concurrency', '0'], ['run', '--concurrency', '2x'], ['run', '--json', '--json'], ['run', 'PRIVATE_SENTINEL']]) {
    const result = exec(root, [...args, ...(args.includes('--json') ? [] : ['--json'])]);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).ok, false);
    assert.equal(result.stdout.includes('PRIVATE_SENTINEL'), false);
  }
});

test('rejects missing, oversized, malformed and non-UTF-8 configs safely', t => {
  const root = fixture(t);
  assert.equal(exec(root, ['plan', '--config', 'PRIVATE_PATH', '--json']).status, 2);
  for (const content of ['{PRIVATE_TEXT', Buffer.alloc(131073), Buffer.from([0xc3, 0x28])]) {
    writeFileSync(join(root, 'task-relay.json'), content);
    const result = exec(root, ['plan', '--json']);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).error.code, 'read-config');
    assert.equal(result.stdout.includes('PRIVATE_TEXT'), false);
  }
  assert.equal(exec(root, ['plan', '--config', '.', '--json']).status, 2);
});

test('help and version need no configuration', t => {
  const root = fixture(t);
  rmSync(join(root, 'task-relay.json'));
  assert.match(exec(root, ['--help']).stdout, /Usage:/);
  assert.equal(exec(root, ['--version']).stdout.trim(), JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
});

test('SIGINT produces a final JSON report and exit 130 on POSIX', { skip: process.platform === 'win32', timeout: 10000 }, async t => {
  const root = fixture(t, { a: task('setInterval(()=>{},1000)') });
  const child = spawn(process.execPath, [cli, 'run', '--json'], { cwd: root });
  let stdout = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  const timer = setTimeout(() => child.kill('SIGINT'), 600);
  const code = await new Promise(resolve => child.on('close', resolve));
  clearTimeout(timer);
  assert.equal(code, 130);
  assert.equal(JSON.parse(stdout).counts.cancelled, 1);
});
