import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import type { Activity } from './observability';
import type { Run, RunOptions, RunResult } from './types';

export const realRun: Run = (cmd, args, opts) => new Promise((done, fail) => {
  const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env } });
  const log = opts.logPath ? createWriteStream(opts.logPath, { flags: 'a' }) : null;
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  const timer = opts.timeoutMs === undefined ? null : setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, opts.timeoutMs);
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk; log?.write(chunk); opts.onStdout?.(chunk.toString()); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk; log?.write(chunk); });
  child.on('error', (error) => { if (timer) clearTimeout(timer); fail(error); });
  child.on('close', (code) => {
    if (timer) clearTimeout(timer);
    log?.end();
    if (timedOut) done({ code: code ?? 1, stdout, stderr: `${stderr}\n${cmd} timed out after ${opts.timeoutMs} ms and was killed`, timedOut: true });
    else done({ code: code ?? 1, stdout, stderr });
  });
  if (opts.input !== undefined) child.stdin.end(opts.input);
  else child.stdin.end();
});

export function withActivity(run: Run, activity: Activity): (cmd: string, args: string[], opts?: Omit<RunOptions, 'activity'>) => Promise<RunResult> {
  return (cmd, args, opts = {}) => run(cmd, args, { ...opts, activity });
}

export function must(result: RunResult, what: string, failure: new (message: string) => Error = Error): string {
  if (result.code !== 0) throw new failure(`${what} failed with exit ${result.code}: ${(result.stderr || result.stdout).trim().slice(-2000)}`);
  return result.stdout;
}
