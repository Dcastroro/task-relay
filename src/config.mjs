const NAME = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const ROOT_FIELDS = new Set(['version', 'concurrency', 'tasks']);
const TASK_FIELDS = new Set(['command', 'needs', 'cwd', 'timeoutMs']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const known = (value, fields) => Object.keys(value).every(key => fields.has(key));

export class ConfigError extends Error {
  constructor(code, task) {
    super(code);
    this.name = 'ConfigError';
    this.code = code;
    if (task && NAME.test(task)) this.task = task;
  }
}

/** Validate the entire graph, then select targets and their prerequisites. */
export function createPlan(raw, targets = []) {
  if (!object(raw) || !known(raw, ROOT_FIELDS) || raw.version !== 1 || !object(raw.tasks)) {
    throw new ConfigError('invalid-config');
  }
  if (raw.concurrency !== undefined && !integer(raw.concurrency, 1, 32)) {
    throw new ConfigError('invalid-concurrency');
  }
  const entries = Object.entries(raw.tasks);
  if (entries.length === 0 || entries.length > 200) throw new ConfigError('task-limit');
  const tasks = new Map();
  for (const [name, task] of entries) {
    if (!NAME.test(name)) throw new ConfigError('invalid-task-name');
    if (!object(task) || !known(task, TASK_FIELDS)) throw new ConfigError('invalid-task', name);
    if (!Array.isArray(task.command) || task.command.length < 1 || task.command.length > 128
      || !task.command.every(arg => typeof arg === 'string' && arg.length <= 8192 && !arg.includes('\0'))
      || !task.command[0].trim()) throw new ConfigError('invalid-command', name);
    const needs = task.needs === undefined ? [] : task.needs;
    if (!Array.isArray(needs) || !needs.every(dep => typeof dep === 'string' && NAME.test(dep))
      || new Set(needs).size !== needs.length) throw new ConfigError('invalid-dependencies', name);
    const cwd = task.cwd === undefined ? '.' : task.cwd;
    if (typeof cwd !== 'string' || !cwd || cwd.includes('\0')) throw new ConfigError('invalid-cwd', name);
    const timeoutMs = task.timeoutMs === undefined ? 30000 : task.timeoutMs;
    if (!integer(timeoutMs, 1, 3600000)) throw new ConfigError('invalid-timeout', name);
    tasks.set(name, { name, command: [...task.command], needs: [...needs], cwd, timeoutMs });
  }
  for (const task of tasks.values()) {
    if (task.needs.some(dep => !tasks.has(dep))) throw new ConfigError('unknown-dependency', task.name);
  }
  const visited = new Set();
  const active = new Set();
  function visit(name) {
    if (active.has(name)) throw new ConfigError('dependency-cycle', name);
    if (visited.has(name)) return;
    active.add(name);
    for (const dep of tasks.get(name).needs) visit(dep);
    active.delete(name);
    visited.add(name);
  }
  for (const name of tasks.keys()) visit(name);
  if (!Array.isArray(targets) || !targets.every(name => tasks.has(name))) throw new ConfigError('unknown-target');
  const selected = new Set();
  function select(name) {
    if (selected.has(name)) return;
    for (const dep of tasks.get(name).needs) select(dep);
    selected.add(name);
  }
  for (const name of targets.length ? targets : tasks.keys()) select(name);
  // Preserve declaration order for scheduling and report stability.
  return {
    concurrency: raw.concurrency ?? 2,
    tasks: [...tasks.values()].filter(task => selected.has(task.name)),
  };
}
