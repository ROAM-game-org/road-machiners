import { appendLedger } from '../ledger';
import type { Ctx, FailedTest, Stage, SuiteFailures } from '../types';
import { BaselineFailureError } from './checkpoint';
import { remoteSuiteResult, testName, type SuiteResult } from './remote-suite';

export type BaselineCheck = { stage: Stage; into: string; base: string; head: string };

type FailedSuite = Exclude<SuiteResult, { failure: null }>;

const BASELINE_WORKERS = 1;

const sameTest = (a: FailedTest, b: FailedTest): boolean => a.file === b.file && a.test === b.test;


function comparable(record: SuiteFailures | null): record is SuiteFailures {
  return record !== null && record.failed.length > 0 && record.unhandledErrors === 0;
}

export async function withoutBaseline(ctx: Ctx, check: BaselineCheck, result: FailedSuite): Promise<string> {
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
  const files = [...new Set(record.failed.map((test) => test.file))].sort();
  try {
    const result = await remoteSuiteResult(ctx, { stage: check.stage, issue: null }, check.base, { files, workers: BASELINE_WORKERS });
    if (result.failure === null) return { failed: [], unfinished: [], unhandledErrors: 0 };
    return result.record;
  } catch (error) {
    ctx.log(check.stage, null, `the rerun of the failed tests on ${check.into} at ${check.base} could not run, so every failure counts: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
