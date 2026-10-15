import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan } from '../src/index.mjs';
import { schedule } from '../src/schedule.mjs';

const task = (needs = []) => ({ command: ['$node', '--version'], needs });
const plan = tasks => createPlan({ version: 1, tasks });
const passed = () => ({ status: 'passed', exitCode: 0, durationMs: 1 });
function latch() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('enforces concurrency and waits for all dependencies before releasing downstream work', async () => {
  const gates = new Map(['a', 'b', 'c', 'build'].map(name => [name, latch()]));
  const starts = [];
  let active = 0;
  let peak = 0;
  const running = schedule(plan({ a: task(), b: task(), c: task(), build: task(['a', 'b', 'c']) }), {
    baseDir: '.', concurrency: 2,
    executor: async task => {
      active += 1; peak = Math.max(peak, active); starts.push(task.name);
      await gates.get(task.name).promise;
      active -= 1;
      return passed();
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(starts, ['a', 'b']);
  gates.get('a').resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(starts, ['a', 'b', 'c']);
  gates.get('c').resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(starts.includes('build'), false);
  gates.get('b').resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(starts, ['a', 'b', 'c', 'build']);
  gates.get('build').resolve();
  const report = await running;
  assert.equal(peak, 2);
  assert.equal(report.ok, true);
  assert.equal(report.counts.passed, 4);
});

test('skips failed descendants transitively and continues independent tasks', async () => {
  const starts = [];
  const report = await schedule(plan({ a: task(['b']), b: task(['c']), c: task(), docs: task() }), {
    baseDir: '.', executor: async task => {
      starts.push(task.name);
      return task.name === 'c' ? { status: 'failed', exitCode: 7, durationMs: 1 } : passed();
    },
  });
  assert.deepEqual(starts, ['c', 'docs']);
  assert.deepEqual(report.tasks.map(task => task.status), ['skipped', 'skipped', 'failed', 'passed']);
  assert.equal(report.ok, false);
});

test('a diamond graph runs its shared prerequisite exactly once', async () => {
  const starts = [];
  await schedule(plan({ base: task(), left: task(['base']), right: task(['base']), end: task(['left', 'right']) }), {
    baseDir: '.', executor: async task => { starts.push(task.name); return passed(); },
  });
  assert.deepEqual(starts, ['base', 'left', 'right', 'end']);
});

test('pre-cancelled runs never start a command', async () => {
  const controller = new AbortController();
  controller.abort();
  const report = await schedule(plan({ a: task(), b: task(['a']) }), {
    baseDir: '.', signal: controller.signal, executor: () => assert.fail('Must not execute'),
  });
  assert.equal(report.counts.cancelled, 2);
});

test('captures executor failure without exposing the thrown error text', async () => {
  const report = await schedule(plan({ a: task() }), {
    baseDir: '.', executor: async () => { throw new Error('PRIVATE_SENTINEL'); },
  });
  assert.equal(report.tasks[0].reason, 'executor-error');
  assert.equal(JSON.stringify(report).includes('PRIVATE_SENTINEL'), false);
});

test('report order is stable even when tasks finish out of order', async () => {
  const report = await schedule(plan({ slow: task(), fast: task() }), {
    baseDir: '.', executor: async task => { if (task.name === 'slow') await new Promise(resolve => setImmediate(resolve)); return passed(); },
  });
  assert.deepEqual(report.tasks.map(task => task.name), ['slow', 'fast']);
});
