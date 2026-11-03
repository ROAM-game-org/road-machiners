import { mkdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { causeOf } from '../fail';
import { ghClient } from '../github';
import { JOB_ID_ENV } from '../jobs';
import { readObservation } from '../observability';
import type { Ctx, FactoryConfig, Run, RunResult, SuiteRun } from '../types';
import { SuiteMachineError, remoteSuite, remoteSuiteResult } from './remote-suite';

const ok = (stdout: string): RunResult => ({ code: 0, stdout, stderr: '' });
const RUN: SuiteRun = { done: false, started: false, passed: false, testsFailed: false, conclusion: null, url: 'https://github.com/o/r/actions/runs/77' };
const FULL = 'abc1234'.padEnd(40, '5');
const FULL2 = 'def5678'.padEnd(40, '6');
const AT = { stage: 'verify' as const, issue: 5 };

type Script = { reads: SuiteRun[]; log?: string; dispatch?: () => Promise<number>; minutesPerRead?: number; running?: number };

function fakeCtx(script: Script): { ctx: Ctx; dispatched: string[]; logs: string[] } {
  const dispatched: string[] = [];
  const logs: string[] = [];
  let minutes = 0;
  const ctx = {
    cfg: { suiteStartMinutes: 15, suitePollSeconds: 0, home: 'tmp/remote-suite' },
    now: () => new Date(Date.UTC(2026, 9, 15, 12, minutes)),
    log: (_stage: string, _issue: number | null, msg: string) => { logs.push(msg); },
    repo: { fullHash: async (commit: string) => (commit.length === 40 ? commit : commit.padEnd(40, '5')) },
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
      suitesRunning: async () => script.running ?? 0,
    },
  };
  return { ctx: ctx as unknown as Ctx, dispatched, logs };
}

describe('remoteSuite', () => {
  it('dispatches the commit and passes once its own run succeeds', async () => {
    const { ctx, dispatched, logs } = fakeCtx({ reads: [RUN, { ...RUN, started: true }, { ...RUN, started: true, done: true, passed: true, conclusion: 'success' }] });
    expect(await remoteSuite(ctx, AT, 'abc1234')).toBeNull();
    expect(dispatched).toEqual([FULL]);
    expect(logs[0]).toContain('https://github.com/o/r/actions/runs/77');
  });

  it('dispatches the full sha when given an abbreviated one', async () => {
    const { ctx, dispatched } = fakeCtx({ reads: [{ ...RUN, started: true, done: true, passed: true, conclusion: 'success' }] });
    expect(await remoteSuite(ctx, AT, 'abc123456')).toBeNull();
    expect(dispatched).toEqual(['abc123456'.padEnd(40, '5')]);
  });

  it('returns the end of the log when the test step fails, for the fix agent', async () => {
    const log = `${Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n')}\nFAIL src/sim/fuel.test.ts > burns fuel`;
    const { ctx } = fakeCtx({ reads: [{ ...RUN, started: true, done: true, testsFailed: true, conclusion: 'failure' }], log });
    const failure = await remoteSuite(ctx, AT, 'abc1234');
    expect(failure).toContain('FAIL src/sim/fuel.test.ts > burns fuel');
    expect(failure).toContain('https://github.com/o/r/actions/runs/77');
    expect(failure).not.toContain('line 0\n');
  });

  it('names every failed test and unfinished file of the record above the log tail, so the fix agent sees all of them', async () => {
    const failed = Array.from({ length: 39 }, (_, i) => ({ file: `src/f${i % 21}.test.ts`, test: `case ${i}` }));
    const record = { failed: [...failed, { file: 'src/whole.test.ts', test: null }], unfinished: ['src/slow.test.ts'], unhandledErrors: 2 };
    const { ctx } = fakeCtx({ reads: [{ ...RUN, started: true, done: true, testsFailed: true, conclusion: 'failure' }], log: 'FAIL src/f20.test.ts > case 20' });
    ctx.github.suiteFailures = async () => record;
    const failure = (await remoteSuite(ctx, AT, 'abc1234'))!;
    expect(failure).toContain('Every failure of the run, 40 failed tests in 22 files:');
    for (const test of failed) expect(failure).toContain(`- ${test.file} > ${test.test}\n`);
    expect(failure).toContain('- src/whole.test.ts (the file itself)');
    expect(failure).toContain('Test files that never finished, 1:\n- src/slow.test.ts');
    expect(failure).toContain('Unhandled errors outside any test: 2.');
    expect(failure.indexOf('src/slow.test.ts')).toBeLessThan(failure.indexOf('FAIL src/f20.test.ts > case 20'));
  });

  it('says the failure list is missing when the run wrote no readable record', async () => {
    const { ctx } = fakeCtx({ reads: [{ ...RUN, started: true, done: true, testsFailed: true, conclusion: 'failure' }], log: 'FAIL src/a.test.ts' });
    ctx.github.suiteFailures = async () => null;
    expect(await remoteSuite(ctx, AT, 'abc1234')).toContain('no readable failure record');
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

  it('waits past the start limit while other suite runs hold the runners, since its run waits in the queue behind them', async () => {
    const { ctx } = fakeCtx({ reads: [...Array(10).fill(RUN), { ...RUN, started: true, done: true, passed: true, conclusion: 'success' }], minutesPerRead: 4, running: 2 });
    expect(await remoteSuite(ctx, AT, 'abc1234')).toBeNull();
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

const FAILED_RUN = '{"status":"completed","conclusion":"failure","html_url":"h"}';
const OVER_TIME_JOBS = JSON.stringify({ jobs: [{ status: 'completed', steps: [{ name: 'tests', conclusion: 'success' }, { name: 'suite time limit', conclusion: 'failure' }] }] });

describe('the suite calls of the GitHub client', () => {
  it('dispatches the workflow from main with the commit and reads the run id', async () => {
    const calls: string[][] = [];
    const github = ghClient(apiFake(calls, { dispatches: '{"workflow_run_id":77,"run_url":"u","html_url":"h"}' }), CFG);
    expect(await github.dispatchSuite(FULL)).toBe(77);
    expect(calls[0]).toEqual(['api', '-X', 'POST', 'repos/o/r/actions/workflows/game-suite.yml/dispatches', '-f', 'ref=main', '-f', `inputs[sha]=${FULL}`, '-F', 'return_run_details=true']);
  });

  it.each(['abc1234', 'abc123456', 'main', FULL.toUpperCase(), `${FULL}0`])('refuses to dispatch %s, which is not a full sha', async (sha) => {
    const calls: string[][] = [];
    const github = ghClient(apiFake(calls, { dispatches: '{"workflow_run_id":77}' }), CFG);
    await expect(github.dispatchSuite(sha)).rejects.toThrow(/full 40 character commit sha/);
    expect(calls).toEqual([]);
  });

  it('keeps the workflow from testing or posting a status for anything but a full sha', () => {
    const workflow = readFileSync(join(__dirname, '../../../.github/workflows/game-suite.yml'), 'utf8');
    expect(workflow).not.toContain('{7,40}');
    expect(workflow.match(/grep -Eq '\^\[0-9a-f\]\{40\}\$'/g)).toHaveLength(2);
  });

  it('fails a dispatch that returns no run id', async () => {
    const github = ghClient(apiFake([], { dispatches: '' }), CFG);
    await expect(github.dispatchSuite(FULL)).rejects.toThrow(/no run id/);
  });

  it('reads a run whose test step failed', async () => {
    const run = '{"status":"completed","conclusion":"failure","html_url":"h"}';
    const jobs = JSON.stringify({ jobs: [{ status: 'completed', steps: [{ name: 'npm ci', conclusion: 'success' }, { name: 'tests', conclusion: 'failure' }] }] });
    const github = ghClient(apiFake([], { 'runs/77/jobs': jobs, 'runs/77': run }), CFG);
    expect(await github.suiteRun(77)).toEqual({ done: true, started: true, passed: false, testsFailed: true, conclusion: 'failure', url: 'h' });
  });

  it('reads a run that passed its tests step and failed its suite time limit step as no failed test', async () => {
    const github = ghClient(apiFake([], { 'runs/77/jobs': OVER_TIME_JOBS, 'runs/77': FAILED_RUN }), CFG);
    expect((await github.suiteRun(77)).testsFailed).toBe(false);
  });

  it('makes a suite over its time limit with no failed test a machine failure, not work for the fix agent', async () => {
    const github = ghClient(apiFake([], { dispatches: '{"workflow_run_id":77}', 'runs/77/jobs': OVER_TIME_JOBS, 'runs/77': FAILED_RUN }), CFG);
    const ctx = { repo: { fullHash: async () => FULL }, cfg: { suiteStartMinutes: 15, suitePollSeconds: 0 }, now: () => new Date(), log: () => undefined, github } as unknown as Ctx;
    await expect(remoteSuite(ctx, AT, FULL)).rejects.toThrow(SuiteMachineError);
  });

  it('reads a queued run as not started', async () => {
    const run = '{"status":"queued","conclusion":null,"html_url":"h"}';
    const jobs = JSON.stringify({ jobs: [{ status: 'queued', steps: [] }] });
    const github = ghClient(apiFake([], { 'runs/77/jobs': jobs, 'runs/77': run }), CFG);
    expect(await github.suiteRun(77)).toEqual({ done: false, started: false, passed: false, testsFailed: false, conclusion: null, url: 'h' });
  });

  it('counts the suite runs in progress', async () => {
    const calls: string[][] = [];
    const github = ghClient(apiFake(calls, { 'status=in_progress': '{"total_count":2,"workflow_runs":[]}' }), CFG);
    expect(await github.suitesRunning()).toBe(2);
    expect(calls[0]).toEqual(['api', 'repos/o/r/actions/workflows/game-suite.yml/runs?status=in_progress&per_page=1']);
  });

  it('dispatches a rerun of some test files with its worker count', async () => {
    const calls: string[][] = [];
    const github = ghClient(apiFake(calls, { dispatches: '{"workflow_run_id":78}' }), CFG);
    expect(await github.dispatchSuite(FULL2, { files: ['src/a.test.ts', 'src/b.test.ts'], workers: 1 })).toBe(78);
    expect(calls[0]).toEqual(['api', '-X', 'POST', 'repos/o/r/actions/workflows/game-suite.yml/dispatches', '-f', 'ref=main', '-f', `inputs[sha]=${FULL2}`, '-f', 'inputs[files]=src/a.test.ts src/b.test.ts', '-f', 'inputs[workers]=1', '-F', 'return_run_details=true']);
  });

  it('downloads the failed tests of a run from its artifact and reads only a well-formed record', async () => {
    const download = (text: string | null): Run => async (_cmd, args) => {
      expect(args.slice(0, 7)).toEqual(['run', 'download', '77', '-R', 'o/r', '-n', 'test-failures']);
      if (text === null) return { code: 1, stdout: '', stderr: 'no artifact matches any of the names or patterns provided' };
      writeFileSync(join(args[8]!, 'test-failures.json'), text);
      return ok('');
    };
    const record = { failed: [{ file: 'src/a.test.ts', test: 'a > b' }, { file: 'src/c.test.ts', test: null }], unfinished: ['src/d.test.ts'], unhandledErrors: 0 };
    expect(await ghClient(download(JSON.stringify(record)), CFG).suiteFailures(77)).toEqual(record);
    expect(await ghClient(download(null), CFG).suiteFailures(77)).toBeNull();
    expect(await ghClient(download('{"failed":[{"file":""}],"unfinished":[],"unhandledErrors":0}'), CFG).suiteFailures(77)).toBeNull();
    expect(await ghClient(download('{"failed":[],"unfinished":[],"unhandledErrors":-1}'), CFG).suiteFailures(77)).toBeNull();
    expect(await ghClient(download('{"failed":[],"unhandledErrors":0}'), CFG).suiteFailures(77)).toBeNull();
    expect(await ghClient(download('{"failed":[],"unfinished":[""],"unhandledErrors":0}'), CFG).suiteFailures(77)).toBeNull();
    expect(await ghClient(download('not json'), CFG).suiteFailures(77)).toBeNull();
  });

  it('gives the failure record with a failed suite, and none when it cannot be read', async () => {
    const record = { failed: [{ file: 'src/a.test.ts', test: 'a' }], unfinished: [], unhandledErrors: 0 };
    const failed = { ...RUN, started: true, done: true, testsFailed: true, conclusion: 'failure' };
    const { ctx } = fakeCtx({ reads: [failed] });
    ctx.github.suiteFailures = async () => record;
    expect(await remoteSuiteResult(ctx, AT, 'abc1234')).toMatchObject({ url: RUN.url, record });
    const broken = fakeCtx({ reads: [failed] });
    broken.ctx.github.suiteFailures = async () => { throw new Error('gh: HTTP 502'); };
    expect(await remoteSuiteResult(broken.ctx, AT, 'abc1234')).toMatchObject({ record: null });
  });
});
