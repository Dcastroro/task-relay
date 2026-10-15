import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan, ConfigError } from '../src/index.mjs';

const task = (needs = []) => ({ command: ['$node', '--version'], needs });
const config = tasks => ({ version: 1, tasks });
const rejects = (input, code) => assert.throws(() => createPlan(input), error => error instanceof ConfigError && error.code === code);

test('plans targets with shared prerequisites once, retaining declaration order', () => {
  const raw = config({ docs: task(), bundle: task(['build']), test: task(['prepare']), prepare: task(), build: task(['test', 'prepare']) });
  const plan = createPlan(raw, ['bundle', 'bundle']);
  assert.deepEqual(plan.tasks.map(task => task.name), ['bundle', 'test', 'prepare', 'build']);
  assert.equal(plan.concurrency, 2);
  assert.equal(plan.tasks[0].timeoutMs, 30000);
  assert.equal(plan.tasks[0].cwd, '.');
});

test('copies command and dependency arrays instead of mutating the config', () => {
  const raw = config({ a: task() });
  const plan = createPlan(raw);
  plan.tasks[0].command.push('extra');
  assert.deepEqual(raw.tasks.a.command, ['$node', '--version']);
});

test('validates the whole graph even when an unrelated target was selected', () => {
  assert.throws(() => createPlan(config({ good: task(), bad: task(['absent']) }), ['good']), /unknown-dependency/);
});

test('rejects cycles, self-dependencies and unknown targets', () => {
  rejects(config({ a: task(['b']), b: task(['a']) }), 'dependency-cycle');
  rejects(config({ a: task(['a']) }), 'dependency-cycle');
  assert.throws(() => createPlan(config({ a: task() }), ['missing']), /unknown-target/);
});

for (const input of [null, [], {}, { version: 2, tasks: { a: task() } }, { version: 1, tasks: [], typo: true }]) {
  test(`rejects invalid root ${JSON.stringify(input)}`, () => rejects(input, 'invalid-config'));
}

test('enforces task count and concurrency bounds', () => {
  rejects(config({}), 'task-limit');
  rejects(config(Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`task${i}`, task()]))), 'task-limit');
  for (const concurrency of [0, 33, 1.5, '2', null]) rejects({ ...config({ a: task() }), concurrency }, 'invalid-concurrency');
});

test('rejects unknown fields and invalid names without reflecting unsafe names', () => {
  rejects({ ...config({ a: task() }), tyop: true }, 'invalid-config');
  rejects(config({ a: { ...task(), timoutMs: 10 } }), 'invalid-task');
  rejects(config({ 'unsafe secret name': task() }), 'invalid-task-name');
  rejects(JSON.parse('{"version":1,"tasks":{"__proto__":{"command":["node"]}}}'), 'invalid-task-name');
  assert.doesNotThrow(() => createPlan(config({ constructor: task(), toString: task(['constructor']) })));
});

test('validates command arrays, dependencies, working directories and timeouts', () => {
  for (const command of [[], '', [''], ['node', 4], ['node', 'bad\0arg'], Array(129).fill('a'), ['a'.repeat(8193)]]) {
    rejects(config({ a: { command } }), 'invalid-command');
  }
  for (const needs of [null, 'b', ['b', 'b'], [null]]) rejects(config({ a: { ...task(), needs } }), 'invalid-dependencies');
  for (const cwd of [null, '', 3, 'bad\0path']) rejects(config({ a: { ...task(), cwd } }), 'invalid-cwd');
  for (const timeoutMs of [null, 0, -1, 3600001, 1.5, '100']) rejects(config({ a: { ...task(), timeoutMs } }), 'invalid-timeout');
});
