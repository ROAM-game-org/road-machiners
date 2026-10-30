import { FAILURE_TAIL_LINES, stripAnsi } from '../fail';
import { GithubError } from '../github';
import { JOB_ID_ENV } from '../jobs';
import { reportObservation } from '../observability';
import type { Ctx, FailedTest, Stage, SuiteFailures, SuiteRun, SuiteScope } from '../types';

export const SUITE_DOWN_MARK = 'The full suite on GitHub Actions could not run';

export class SuiteMachineError extends GithubError {
  constructor(reason: string) {
    super(`${SUITE_DOWN_MARK}: ${reason}`);
  }
}

type At = { stage: Stage; issue: number | null };

export const testName = (test: FailedTest): string => (test.test === null ? `${test.file} (the file itself)` : `${test.file} > ${test.test}`);

export type SuiteResult = { failure: null } | { failure: string; url: string; record: SuiteFailures | null };

export async function remoteSuite(ctx: Ctx, at: At, sha: string): Promise<string | null> {
  return (await remoteSuiteResult(ctx, at, sha)).failure;
}

const suiteName = (scope: SuiteScope | undefined): string => (scope === undefined ? 'full suite' : `rerun of ${scope.files.length} test files`);

export async function remoteSuiteResult(ctx: Ctx, at: At, commit: string, scope?: SuiteScope): Promise<SuiteResult> {
  const sha = await ctx.repo.fullHash(commit);
  const id = await onActions(`the dispatch for ${sha} failed`, () => ctx.github.dispatchSuite(sha, scope));
  const startBy = ctx.now().getTime() + ctx.cfg.suiteStartMinutes * 60_000;
  for (let read = 0; ; read++) {
    const run = await onActions(`reading run ${id} failed`, () => ctx.github.suiteRun(id));
    if (read === 0) ctx.log(at.stage, at.issue, `the ${suiteName(scope)} runs on GitHub Actions for ${sha}: ${run.url}`);
    if (run.done) return verdict(ctx, at, id, sha, run);
    if (!run.started && ctx.now().getTime() > startBy) throw new SuiteMachineError(`run ${id} did not start within ${ctx.cfg.suiteStartMinutes} minutes: ${run.url}`);
    reportTests(ctx);
    await new Promise((done) => setTimeout(done, ctx.cfg.suitePollSeconds * 1000));
  }
}

async function verdict(ctx: Ctx, at: At, id: number, sha: string, run: SuiteRun): Promise<SuiteResult> {
  if (run.passed) return { failure: null };
  if (!run.testsFailed) throw new SuiteMachineError(`run ${id} ended ${run.conclusion ?? 'with no conclusion'} outside its test step: ${run.url}`);
  const log = await onActions(`reading the log of run ${id} failed`, () => ctx.github.suiteLog(id));
  const tail = stripAnsi(log).split('\n').slice(-FAILURE_TAIL_LINES).join('\n');
  const record = await failuresOf(ctx, at, id);
  return { failure: failureText(sha, run.url, tail, record), url: run.url, record };
}

export function failureText(sha: string, url: string, tail: string, record: SuiteFailures | null): string {
  return `The full suite failed on GitHub Actions for ${sha}: ${url}\n\n${recordText(record)}\n\nThe last ${FAILURE_TAIL_LINES} lines of the failed log:\n${tail}`;
}

function recordText(record: SuiteFailures | null): string {
  if (record === null) return 'The run wrote no readable failure record, so only the log below shows what failed. Find every failed test in it, not only the last one.';
  const lines = [`Every failure of the run, ${record.failed.length} failed tests in ${new Set(record.failed.map((test) => test.file)).size} files:`, ...record.failed.map((test) => `- ${testName(test)}`)];
  if (record.unfinished.length > 0) lines.push(`Test files that never finished, ${record.unfinished.length}:`, ...record.unfinished.map((file) => `- ${file}`));
  if (record.unhandledErrors > 0) lines.push(`Unhandled errors outside any test: ${record.unhandledErrors}. The log shows them.`);
  return lines.join('\n');
}

async function failuresOf(ctx: Ctx, at: At, id: number): Promise<SuiteFailures | null> {
  try {
    return await ctx.github.suiteFailures(id);
  } catch (error) {
    ctx.log(at.stage, at.issue, `the failed tests of run ${id} could not be read, so every failure counts: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function onActions<T>(what: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw new SuiteMachineError(`${what}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function reportTests(ctx: Ctx): void {
  const job = process.env[JOB_ID_ENV];
  if (job !== undefined) reportObservation(ctx.cfg.home, job, { type: 'activity', activity: 'tests', phase: 'running', source: 'runner' });
}
