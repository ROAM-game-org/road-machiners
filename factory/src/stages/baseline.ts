import { appendLedger, type RerunOutcome } from '../ledger';
import type { Ctx, FailedTest, Stage, SuiteFailures } from '../types';
import { BaselineFailureError } from './checkpoint';
import { remoteSuiteResult, testName, type SuiteResult } from './remote-suite';

export type BaselineCheck = { stage: Stage; issue: number | null; into: string; base: string; head: string };

type FailedSuite = Exclude<SuiteResult, { failure: null }>;

const BASELINE_WORKERS = 1;
const SHARD_WORKERS = null;

const sameTest = (a: FailedTest, b: FailedTest): boolean => a.file === b.file && a.test === b.test;

function comparable(record: SuiteFailures | null): record is SuiteFailures {
  return record !== null && record.failed.length > 0 && record.unfinished.length === 0 && record.unhandledErrors === 0;
}

const failedFiles = (record: SuiteFailures): string[] => [...new Set(record.failed.map((test) => test.file))].sort();

export type ConfirmSuite = (() => Promise<SuiteResult>) | null;

export async function suiteVerdict(ctx: Ctx, check: BaselineCheck, result: FailedSuite, confirm: ConfirmSuite): Promise<string | null> {
  const real = await withoutTransient(ctx, check, result);
  if (real !== null) return withoutBaseline(ctx, check, real);
  if (confirm === null) return null;
  const full = await confirm();
  ctx.log(check.stage, check.issue, `the full suite ran again on ${check.head} after its failed files passed alone: ${full.failure === null ? 'passed' : 'failed'}`);
  return full.failure === null ? null : withoutBaseline(ctx, check, full);
}

async function withoutTransient(ctx: Ctx, check: BaselineCheck, result: FailedSuite): Promise<FailedSuite | null> {
  const record = result.record;
  if (!comparable(record)) return result;
  const files = failedFiles(record);
  if (files.length > ctx.cfg.suiteRerunFiles) {
    ctx.log(check.stage, check.issue, `the suite failed in ${files.length} files, more than ${ctx.cfg.suiteRerunFiles}, so they do not run again on ${check.head}`);
    return result;
  }
  const outcome = await sameHeadOutcome(ctx, check, files);
  appendLedger(ctx.cfg.home, { kind: 'rerun', stage: check.stage, issue: check.issue, head: check.head, files, outcome, at: ctx.now().toISOString() });
  ctx.log(check.stage, check.issue, `the ${files.length} failed test files ran again on ${check.head}: ${outcome}`);
  if (outcome === 'passed') return null;
  if (outcome === 'unknown') return result;
  return { ...result, failure: `${result.failure}\n\nThe factory ran the failed test files again on ${check.head}, and they failed again, so these failures are real: ${files.join(', ')}.` };
}

async function sameHeadOutcome(ctx: Ctx, check: BaselineCheck, files: string[]): Promise<RerunOutcome> {
  try {
    const rerun = await remoteSuiteResult(ctx, { stage: check.stage, issue: check.issue }, check.head, { files, workers: SHARD_WORKERS });
    return rerun.failure === null ? 'passed' : 'failed';
  } catch (error) {
    ctx.log(check.stage, check.issue, `the rerun of the failed tests on ${check.head} could not run, so every failure counts: ${error instanceof Error ? error.message : String(error)}`);
    return 'unknown';
  }
}

async function withoutBaseline(ctx: Ctx, check: BaselineCheck, result: FailedSuite): Promise<string> {
  const record = result.record;
  if (!comparable(record)) return result.failure;
  const base = await baseRecord(ctx, check, record);
  if (base === null) return result.failure;
  const shared = record.failed.filter((test) => test.test !== null && base.failed.some((other) => sameTest(test, other)));
  if (shared.length === 0) return result.failure;
  const fresh = record.failed.filter((test) => !shared.some((other) => sameTest(test, other)));
  appendLedger(ctx.cfg.home, { kind: 'baseline', stage: check.stage, into: check.into, base: check.base, head: check.head, excluded: shared, failing: fresh, at: ctx.now().toISOString() });
  ctx.log(check.stage, null, `${shared.length} failed tests also fail on ${check.into} at ${check.base}, ${fresh.length} fail only here`);
  if (fresh.length === 0) throw new BaselineFailureError(check.into, check.base, shared.map(testName), result.failure);
  return `${result.failure}\n\nThese failed tests also fail on ${check.into} at ${check.base}, so they are not this change's to fix. Leave them alone: ${shared.map(testName).join('; ')}.\nFix these, which fail only here: ${fresh.map(testName).join('; ')}.`;
}

async function baseRecord(ctx: Ctx, check: BaselineCheck, record: SuiteFailures): Promise<SuiteFailures | null> {
  try {
    const result = await remoteSuiteResult(ctx, { stage: check.stage, issue: null }, check.base, { files: failedFiles(record), workers: BASELINE_WORKERS });
    if (result.failure === null) return { failed: [], unfinished: [], unhandledErrors: 0 };
    return result.record;
  } catch (error) {
    ctx.log(check.stage, null, `the rerun of the failed tests on ${check.into} at ${check.base} could not run, so every failure counts: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
