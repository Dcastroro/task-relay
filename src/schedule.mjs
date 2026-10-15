import { performance } from 'node:perf_hooks';
import { executeTask } from './execute.mjs';

/** Schedule a validated plan. Executor injection supports deterministic integrations. */
export async function schedule(plan, { baseDir, concurrency = plan.concurrency, signal, onOutput, onEvent, executor = executeTask }) {
  const started = performance.now();
  const results = new Map(plan.tasks.map(task => [task.name, { name: task.name, status: 'pending' }]));
  const running = new Map();
  const emit = result => onEvent?.({ ...result });
  while ([...results.values()].some(task => task.status === 'pending') || running.size) {
    let changed;
    do {
      changed = false;
      for (const task of plan.tasks) {
        if (results.get(task.name).status !== 'pending') continue;
        const blocked = task.needs.some(name => ['failed', 'timed-out', 'skipped', 'cancelled'].includes(results.get(name).status));
        if (signal?.aborted || blocked) {
          const result = { name: task.name, status: signal?.aborted ? 'cancelled' : 'skipped',
            reason: signal?.aborted ? 'interrupted' : 'dependency', exitCode: null, durationMs: 0 };
          results.set(task.name, result);
          emit(result);
          changed = true;
        }
      }
    } while (changed);

    for (const task of plan.tasks) {
      if (running.size >= concurrency || signal?.aborted) break;
      if (results.get(task.name).status !== 'pending' || !task.needs.every(name => results.get(name).status === 'passed')) continue;
      results.set(task.name, { name: task.name, status: 'running' });
      emit(results.get(task.name));
      const promise = Promise.resolve().then(() => executor(task, { baseDir, signal, onOutput }))
        .catch(() => ({ status: 'failed', reason: 'executor-error', exitCode: null, durationMs: 0 }))
        .then(result => {
          results.set(task.name, { ...result, name: task.name });
          running.delete(task.name);
          emit(results.get(task.name));
        });
      running.set(task.name, promise);
    }
    if (running.size) await Promise.race(running.values());
  }
  const tasks = [...results.values()];
  const counts = Object.fromEntries(['passed', 'failed', 'timed-out', 'skipped', 'cancelled']
    .map(status => [status, tasks.filter(task => task.status === status).length]));
  return {
    version: 1,
    ok: tasks.every(task => task.status === 'passed'),
    durationMs: Math.round(performance.now() - started),
    counts,
    tasks,
  };
}
