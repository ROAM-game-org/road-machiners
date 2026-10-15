import { stripAnsi } from '../fail';
import { GithubError } from '../github';
import { JOB_ID_ENV } from '../jobs';
import { reportObservation } from '../observability';
import type { Ctx, Stage, SuiteRun } from '../types';
import { FAILURE_TAIL_LINES } from './checks';

export const SUITE_DOWN_MARK = 'The full suite on GitHub Actions could not run';

export class SuiteMachineError extends GithubError {
  constructor(reason: string) {
    super(`${SUITE_DOWN_MARK}: ${reason}`);
  }
}

type At = { stage: Stage; issue: number | null };

export async function remoteSuite(ctx: Ctx, at: At, sha: string): Promise<string | null> {
  const id = await onActions(`the dispatch for ${sha} failed`, () => ctx.github.dispatchSuite(sha));
  const startBy = ctx.now().getTime() + ctx.cfg.suiteStartMinutes * 60_000;
  for (let read = 0; ; read++) {
    const run = await onActions(`reading run ${id} failed`, () => ctx.github.suiteRun(id));
    if (read === 0) ctx.log(at.stage, at.issue, `the full suite runs on GitHub Actions for ${sha}: ${run.url}`);
    if (run.done) return verdict(ctx, id, sha, run);
    if (!run.started && ctx.now().getTime() > startBy) throw new SuiteMachineError(`run ${id} did not start within ${ctx.cfg.suiteStartMinutes} minutes: ${run.url}`);
    reportTests(ctx);
    await new Promise((done) => setTimeout(done, ctx.cfg.suitePollSeconds * 1000));
  }
}

async function verdict(ctx: Ctx, id: number, sha: string, run: SuiteRun): Promise<string | null> {
  if (run.passed) return null;
  if (!run.testsFailed) throw new SuiteMachineError(`run ${id} ended ${run.conclusion ?? 'with no conclusion'} outside its test step: ${run.url}`);
  const log = await onActions(`reading the log of run ${id} failed`, () => ctx.github.suiteLog(id));
  const tail = stripAnsi(log).split('\n').slice(-FAILURE_TAIL_LINES).join('\n');
  return `The full suite failed on GitHub Actions for ${sha}: ${run.url}\n${tail}`;
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
