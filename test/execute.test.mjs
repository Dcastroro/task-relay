import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTasks } from '../src/index.mjs';

const command = (script, extra = {}) => ({ command: ['$node', '-e', script], timeoutMs: 10000, ...extra });
const config = tasks => ({ version: 1, tasks });

test('runs real commands and preserves exit codes', async () => {
  const report = await runTasks(config({ a: command('process.exitCode=7'), b: command('') }));
  assert.equal(report.ok, false);
  assert.equal(report.tasks[0].exitCode, 7);
  assert.equal(report.tasks[1].status, 'passed');
});

test('passes arguments literally with no shell interpolation', async () => {
  const literal = 'hello & echo unsafe; $(not-a-command)';
  const report = await runTasks(config({ a: { command: ['$node', '-e', 'process.exitCode=process.argv[1]===process.argv[2]?0:1', literal, literal] } }));
  assert.equal(report.ok, true);
});

test('handles nonexistent executables and cwd with generic spawn diagnostics', async () => {
  const report = await runTasks(config({ missing: { command: ['TASK_RELAY_NONEXISTENT_COMMAND_8e8a'] }, badcwd: command('', { cwd: 'NONEXISTENT_PRIVATE_PATH' }) }));
  assert.ok(report.tasks.every(task => task.status === 'failed' && task.reason === 'spawn-error'));
  assert.equal(JSON.stringify(report).includes('PRIVATE_PATH'), false);
});

test('kills timed-out work and skips dependent tasks', { timeout: 10000 }, async () => {
  const report = await runTasks(config({ a: command('setInterval(()=>{},1000)', { timeoutMs: 150 }), b: { ...command(''), needs: ['a'] } }));
  assert.deepEqual(report.tasks.map(task => task.status), ['timed-out', 'skipped']);
});

test('cancels running work and leaves queued tasks unstarted', { timeout: 10000 }, async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 200);
  try {
    const report = await runTasks(config({ a: command('setInterval(()=>{},1000)'), b: command('') }), { concurrency: 1, signal: controller.signal });
    assert.equal(report.counts.cancelled, 2);
  } finally { clearTimeout(timer); }
});

test('drains large output, caps verbose forwarding and keeps it out of reports', async () => {
  let size = 0;
  let notices = 0;
  const report = await runTasks(config({ a: command("process.stdout.write('SENTINEL_OUTPUT'+ 'x'.repeat(200000));process.stderr.write('more')") }), {
    onOutput: event => { if (event.stream === 'notice') notices += 1; else size += Buffer.byteLength(event.text); },
  });
  assert.equal(report.ok, true);
  assert.equal(size, 65536);
  assert.equal(notices, 1);
  assert.equal(JSON.stringify(report).includes('SENTINEL_OUTPUT'), false);
});

test('without verbose, noisy commands still finish without retaining their output', async () => {
  const report = await runTasks(config({ a: command("process.stdout.write('x'.repeat(200000))") }));
  assert.equal(report.ok, true);
});

test('timeout stops an ordinary descendant before it can write a delayed artifact', { timeout: 10000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'relay-tree-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const marker = join(root, 'must-not-exist');
  const descendant = `setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad'),2500)`;
  const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'ignore'});setInterval(()=>{},1000)`;
  const report = await runTasks(config({ parent: command(parent, { timeoutMs: 1000 }) }));
  assert.equal(report.tasks[0].status, 'timed-out');
  await new Promise(resolve => setTimeout(resolve, 1800));
  assert.equal(existsSync(marker), false);
});

test('API rejects invalid concurrency overrides', async () => {
  await assert.rejects(() => runTasks(config({ a: command('') }), { concurrency: 0 }), /invalid-concurrency/);
});
