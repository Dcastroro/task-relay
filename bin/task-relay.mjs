#!/usr/bin/env node
import { open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import { createPlan, runTasks, ConfigError } from '../src/index.mjs';

const HELP = `Task Relay 0.1.0

Usage: node bin/task-relay.mjs <plan|run> [targets...] [options]

  --config <file>      JSON pipeline (default: task-relay.json)
  --concurrency <1-32> Override the parallel task limit
  --json              Print one JSON report; child output is omitted
  --verbose           Print bounded child output to stderr (cannot combine with --json)
  --help              Show usage
  --version           Show version

Exit codes: 0 passed, 1 task failure, 2 config/usage error, 130 interrupted.
Review configurations before running: tasks execute with your user permissions.
`;

function parseArgs(args) {
  const options = { config: 'task-relay.json', targets: [], json: false, verbose: false };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      if (!options.action) options.action = arg;
      else options.targets.push(arg);
      continue;
    }
    if (seen.has(arg)) throw new ConfigError('usage');
    seen.add(arg);
    if (['--json', '--verbose', '--help', '--version'].includes(arg)) options[arg.slice(2)] = true;
    else if (arg === '--config' || arg === '--concurrency') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new ConfigError('usage');
      if (arg === '--concurrency') {
        if (!/^(?:[1-9]|[12][0-9]|3[0-2])$/.test(value)) throw new ConfigError('invalid-concurrency');
        options.concurrency = Number(value);
      } else options.config = value;
    } else throw new ConfigError('usage');
  }
  if (options.json && options.verbose) throw new ConfigError('usage');
  if (!options.help && !options.version && !['plan', 'run'].includes(options.action)) throw new ConfigError('usage');
  return options;
}

async function readConfig(path) {
  let handle;
  try {
    handle = await open(path, 'r');
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 131072) throw new Error();
    const buffer = Buffer.alloc(131073);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > 131072) throw new Error();
    return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(buffer.subarray(0, size)).replace(/^\uFEFF/, ''));
  } catch { throw new ConfigError('read-config'); }
  finally { await handle?.close(); }
}

async function main() {
  const args = process.argv.slice(2);
  let options;
  try {
    options = parseArgs(args);
    if (options.help) { console.log(HELP); return; }
    if (options.version) { console.log('0.1.0'); return; }
    const configPath = resolve(options.config);
    const config = await readConfig(configPath);
    const plan = createPlan(config, options.targets);
    if (options.action === 'plan') {
      const report = { version: 1, action: 'plan', concurrency: options.concurrency ?? plan.concurrency,
        tasks: plan.tasks.map(({ name, needs, timeoutMs }) => ({ name, needs, timeoutMs })) };
      if (options.json) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(`PLAN: ${plan.tasks.length} task(s), concurrency ${report.concurrency}. No tasks executed.`);
        for (const task of report.tasks) console.log(`  ${task.name} <- ${task.needs.join(', ') || '(ready)'} [${task.timeoutMs}ms]`);
      }
      return;
    }
    const controller = new AbortController();
    const interrupt = () => controller.abort();
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', interrupt);
    let report;
    try {
      report = await runTasks(config, {
        targets: options.targets, concurrency: options.concurrency, baseDir: dirname(configPath), signal: controller.signal,
        onOutput: options.verbose ? ({ task, stream, text }) => process.stderr.write(`[${task}:${stream}] ${text}`) : undefined,
        onEvent: options.json ? undefined : task => console.log(`${task.status.toUpperCase()} ${task.name}`),
      });
    } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    }
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else console.log(`${report.ok ? 'PASS' : 'FAIL'}: ${report.tasks.length} task(s) in ${report.durationMs}ms.`);
    process.exitCode = controller.signal.aborted ? 130 : report.ok ? 0 : 1;
  } catch (error) {
    const report = { version: 1, ok: false, error: { code: error instanceof ConfigError ? error.code : 'internal',
      ...(error instanceof ConfigError && error.task ? { task: error.task } : {}) } };
    if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else console.error(`ERROR: ${report.error.code}${report.error.task ? ` (${report.error.task})` : ''}. Run --help for usage.`);
    process.exitCode = 2;
  }
}

await main();
