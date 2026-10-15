import { resolve } from 'node:path';
import { createPlan, ConfigError } from './config.mjs';
import { schedule } from './schedule.mjs';
export { createPlan, ConfigError } from './config.mjs';

export async function runTasks(config, options = {}) {
  const plan = createPlan(config, options.targets);
  const concurrency = options.concurrency ?? plan.concurrency;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new ConfigError('invalid-concurrency');
  }
  return schedule(plan, { ...options, concurrency, baseDir: resolve(options.baseDir ?? '.') });
}
