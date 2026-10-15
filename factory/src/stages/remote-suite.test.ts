import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { causeOf } from '../fail';
import { ghClient } from '../github';
import { JOB_ID_ENV } from '../jobs';
import { readObservation } from '../observability';
import type { Ctx, FactoryConfig, Run, RunResult, SuiteRun } from '../types';
import { SuiteMachineError, remoteSuite } from './remote-suite';

const ok = (stdout: string): RunResult => ({ code: 0, stdout, stderr: '' });
const RUN: SuiteRun = { done: false, started: false, passed: false, testsFailed: false, conclusion: null, url: 'https://github.com/o/r/actions/runs/77' };
const AT = { stage: 'verify' as const, issue: 5 };

type Script = { reads: SuiteRun[]; log?: string; dispatch?: () => Promise<number>; minutesPerRead?: number };

function fakeCtx(script: Script): { ctx: Ctx; dispatched: string[]; logs: string[] } {
  const dispatched: string[] = [];
  const logs: string[] = [];
  let minutes = 0;
  const ctx = {
    cfg: { suiteStartMinutes: 15, suitePollSeconds: 0, home: 'tmp/remote-suite' },
    now: () => new Date(Date.UTC(2026, 9, 15, 12, minutes)),
    log: (_stage: string, _issue: number | null, msg: string) => { logs.push(msg); },
    github: {
      dispatchSuite: script.dispatch ?? (async (sha: string) => { dispatched.push(sha); return 77; }),
      suiteRun: async (id: number) => {
        expect(id).toBe(77);
        minutes += script.minutesPerRead ?? 1;
        const next = script.reads.shift();
        if (next === undefined) throw new Error('read past the scripted runs');
        return next;
      },
      suiteLog: async () => script.log ?? '',
    },
  };
  return { ctx: ctx as unknown as Ctx, dispatched, logs };
}

describe('remoteSuite', () => {
  it('dispatches the commit and passes once its own run succeeds', async () => {
    const { ctx, dispatched, logs } = fakeCtx({ reads: [RUN, { ...RUN, started: true }, { ...RUN, started: true, done: true, passed: true, conclusion: 'success' }] });
    expect(await remoteSuite(ctx, AT, 'abc1234')).toBeNull();
    expect(dispatched).toEqual(['abc1234']);
    expect(logs[0]).toContain('https://github.com/o/r/actions/runs/77');
  });

  it('returns the end of the log when the test step fails, for the fix agent', async () => {
    const log = `${Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n')}\nFAIL src/sim/fuel.test.ts > burns fuel`;
    const { ctx } = fakeCtx({ reads: [{ ...RUN, started: true, done: true, testsFailed: true, conclusion: 'failure' }], log });
    const failure = await remoteSuite(ctx, AT, 'abc1234');
    expect(failure).toContain('FAIL src/sim/fuel.test.ts > burns fuel');
    expect(failure).toContain('https://github.com/o/r/actions/runs/77');
    expect(failure).not.toContain('line 0\n');
  });

  it('is a machine failure when the run fails outside the test step', async () => {
    const { ctx } = fakeCtx({ reads: [{ ...RUN, started: true, done: true, conclusion: 'failure' }] });
    await expect(remoteSuite(ctx, AT, 'abc1234')).rejects.toThrow(SuiteMachineError);
  });

  it('is a machine failure when the run is cancelled', async () => {
    const { ctx } = fakeCtx({ reads: [{ ...RUN, started: true, done: true, conclusion: 'cancelled' }] });
    await expect(remoteSuite(ctx, AT, 'abc1234')).rejects.toThrow(/cancelled/);
  });

  it('is a machine failure when the run does not start in time', async () => {
    const { ctx } = fakeCtx({ reads: Array(20).fill(RUN), minutesPerRead: 4 });
    await expect(remoteSuite(ctx, AT, 'abc1234')).rejects.toThrow(/did not start within 15 minutes/);
  });

  it('waits past the start limit for a run that started', async () => {
    const { ctx } = fakeCtx({ reads: [...Array(10).fill({ ...RUN, started: true }), { ...RUN, started: true, done: true, passed: true, conclusion: 'success' }], minutesPerRead: 4 });
    expect(await remoteSuite(ctx, AT, 'abc1234')).toBeNull();
  });

  it('shows the job as running tests while it waits, after its own GitHub reads', async () => {
    mkdirSync('tmp', { recursive: true });
    const home = mkdtempSync(join('tmp', 'remote-suite-'));
    process.env[JOB_ID_ENV] = 'verify-5-x';
    const activity = (): string | null => {
      const data = readObservation(home, 'verify-5-x')?.data;
      return data?.type === 'activity' ? data.activity : null;
    };
    try {
      const { ctx } = fakeCtx({ reads: [{ ...RUN, started: true }, { ...RUN, started: true, done: true, passed: true, conclusion: 'success' }] });
      ctx.cfg.home = home;
      const suiteRun = ctx.github.suiteRun;
      const seen: (string | null)[] = [];
      ctx.github.suiteRun = async (id) => {
        seen.push(activity());
        return suiteRun(id);
      };
      expect(await remoteSuite(ctx, AT, 'abc1234')).toBeNull();
      expect(seen).toEqual([null, 'tests']);
    } finally {
      delete process.env[JOB_ID_ENV];
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('records a suite that could not run with the GitHub cause, so the stuck sweep retries it', () => {
    expect(causeOf(new SuiteMachineError('run 77 did not start within 15 minutes'))).toBe('github');
  });

  it('is a machine failure when the dispatch fails', async () => {
    const { ctx } = fakeCtx({ reads: [], dispatch: async () => { throw new Error('HTTP 422: Workflow does not have workflow_dispatch trigger'); } });
    await expect(remoteSuite(ctx, AT, 'abc1234')).rejects.toThrow(SuiteMachineError);
  });

  it('is a machine failure when a read of the run fails', async () => {
    const { ctx } = fakeCtx({ reads: [] });
    await expect(remoteSuite(ctx, AT, 'abc1234')).rejects.toThrow(SuiteMachineError);
  });
});

const CFG = { repo: 'o/r', githubRetries: 0, githubRetryBaseSeconds: 1, githubTimeoutSeconds: 60 } as FactoryConfig;

function apiFake(calls: string[][], replies: Record<string, string>): Run {
  return async (_cmd, args) => {
    calls.push(args);
    const key = Object.keys(replies).find((part) => args.join(' ').includes(part));
    return ok(key === undefined ? '' : replies[key]!);
  };
}

describe('the suite calls of the GitHub client', () => {
  it('dispatches the workflow from main with the commit and reads the run id', async () => {
    const calls: string[][] = [];
    const github = ghClient(apiFake(calls, { dispatches: '{"workflow_run_id":77,"run_url":"u","html_url":"h"}' }), CFG);
    expect(await github.dispatchSuite('abc1234')).toBe(77);
    expect(calls[0]).toEqual(['api', '-X', 'POST', 'repos/o/r/actions/workflows/game-suite.yml/dispatches', '-f', 'ref=main', '-f', 'inputs[sha]=abc1234', '-F', 'return_run_details=true']);
  });

  it('fails a dispatch that returns no run id', async () => {
    const github = ghClient(apiFake([], { dispatches: '' }), CFG);
    await expect(github.dispatchSuite('abc1234')).rejects.toThrow(/no run id/);
  });

  it('reads a run whose test step failed', async () => {
    const run = '{"status":"completed","conclusion":"failure","html_url":"h"}';
    const jobs = JSON.stringify({ jobs: [{ status: 'completed', steps: [{ name: 'npm ci', conclusion: 'success' }, { name: 'tests', conclusion: 'failure' }] }] });
    const github = ghClient(apiFake([], { 'runs/77/jobs': jobs, 'runs/77': run }), CFG);
    expect(await github.suiteRun(77)).toEqual({ done: true, started: true, passed: false, testsFailed: true, conclusion: 'failure', url: 'h' });
  });

  it('reads a queued run as not started', async () => {
    const run = '{"status":"queued","conclusion":null,"html_url":"h"}';
    const jobs = JSON.stringify({ jobs: [{ status: 'queued', steps: [] }] });
    const github = ghClient(apiFake([], { 'runs/77/jobs': jobs, 'runs/77': run }), CFG);
    expect(await github.suiteRun(77)).toEqual({ done: false, started: false, passed: false, testsFailed: false, conclusion: null, url: 'h' });
  });
});
