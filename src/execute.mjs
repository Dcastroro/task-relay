import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';

function stopTree(child) {
  if (!child.pid) return Promise.resolve();
  if (process.platform === 'win32') {
    return new Promise(resolveStop => {
      const killer = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
        ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 5000 });
      killer.on('error', () => { child.kill(); resolveStop(); });
      killer.on('close', () => { child.kill(); resolveStop(); });
    });
  }
  try { process.kill(-child.pid, 'SIGKILL'); }
  catch { try { child.kill('SIGKILL'); } catch { /* Already exited. */ } }
  return Promise.resolve();
}

/** No shell is inserted. Commands and their environment must still be trusted. */
export function executeTask(task, { baseDir, signal, onOutput }) {
  return new Promise(resolveTask => {
    const started = performance.now();
    if (signal?.aborted) {
      resolveTask({ status: 'cancelled', exitCode: null, durationMs: 0 });
      return;
    }
    let child;
    try {
      const executable = task.command[0] === '$node' ? process.execPath : task.command[0];
      child = spawn(executable, task.command.slice(1), {
        cwd: resolve(baseDir, task.cwd), shell: false, windowsHide: true,
        detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      resolveTask({ status: 'failed', reason: 'spawn-error', exitCode: null, durationMs: Math.round(performance.now() - started) });
      return;
    }
    let reason;
    let spawnError = false;
    let stopping;
    let delivered = 0;
    let truncated = false;
    const output = (stream, chunk) => {
      if (!onOutput) return;
      const remaining = Math.max(0, 65536 - delivered);
      if (remaining) {
        const part = chunk.subarray(0, remaining);
        delivered += part.length;
        onOutput({ task: task.name, stream, text: part.toString('utf8') });
      }
      if (chunk.length > remaining && !truncated) {
        truncated = true;
        onOutput({ task: task.name, stream: 'notice', text: 'Output truncated at 64 KiB.\n' });
      }
    };
    child.stdout.on('data', chunk => output('stdout', chunk));
    child.stderr.on('data', chunk => output('stderr', chunk));
    const stop = cause => {
      if (reason) return;
      reason = cause;
      stopping = stopTree(child).finally(() => {
        // Escaped descendants must not hold inherited output pipes open forever.
        child.stdout.destroy();
        child.stderr.destroy();
      });
    };
    const abort = () => stop('cancelled');
    const timer = setTimeout(() => stop('timed-out'), task.timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    // The signal may have changed between the initial check and listener setup.
    if (signal?.aborted) abort();
    child.on('error', () => { spawnError = true; });
    child.on('close', async (code, exitSignal) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (stopping) await stopping;
      resolveTask({
        status: reason ?? (spawnError || code !== 0 ? 'failed' : 'passed'),
        ...(spawnError ? { reason: 'spawn-error' } : exitSignal && !reason ? { reason: 'signal' } : {}),
        exitCode: code,
        durationMs: Math.round(performance.now() - started),
      });
    });
  });
}
