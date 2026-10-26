import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { STEP_FUNCTION, stepCall } from '../activity';
import { testPoolPin } from '../cpus';
import { JOB_ID_ENV } from '../jobs';
import { appendLedger } from '../ledger';
import { GAME_DIR, type Ctx } from '../types';
import { BaselineFailureError } from './checkpoint';
import { runChecks } from './checks';
import { releaseLog } from './release-common';

export const FAILURES_FILE = 'tmp/test-failures.json';
export const FAILURES_ENV = { TEST_FAILURES_FILE: FAILURES_FILE };

export type FailedTest = { file: string; test: string | null; errors: string[] };
export type FailureRecord = { failed: FailedTest[]; unhandledErrors: number };
export type Checked = { stage: 'merge' | 'ship'; dir: string; into: string };

const ERROR_CHARS = 2000;

export function testIdentity(failed: FailedTest): string {
  return failed.test === null ? failed.file : `${failed.file} > ${failed.test}`;
}

const failuresPath = (clone: string): string => join(clone, GAME_DIR, FAILURES_FILE);

export function clearFailureRecord(clone: string): void {
  rmSync(failuresPath(clone), { force: true });
}

const isText = (value: unknown): value is string => typeof value === 'string';
const isTexts = (value: unknown): boolean => Array.isArray(value) && value.every(isText);

const isFile = (value: unknown): boolean => isText(value) && value !== '';
const isTestName = (value: unknown): boolean => value === null || isText(value);

function isFailedTest(item: unknown): item is FailedTest {
  if (typeof item !== 'object' || item === null) return false;
  const { file, test, errors } = item as Record<string, unknown>;
  return isFile(file) && isTestName(test) && isTexts(errors);
}

function parseRecord(raw: string): FailureRecord | null {
  const data: unknown = JSON.parse(raw);
  if (typeof data !== 'object' || data === null) return null;
  const { failed, unhandledErrors } = data as Record<string, unknown>;
  if (!Array.isArray(failed) || !failed.every(isFailedTest) || !Number.isInteger(unhandledErrors)) return null;
  return { failed, unhandledErrors: unhandledErrors as number };
}

export function readFailureRecord(clone: string): FailureRecord | null {
  const path = failuresPath(clone);
  if (!existsSync(path)) return null;
  try {
    return parseRecord(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

const quoted = (word: string): string => `'${word.replaceAll("'", `'\\''`)}'`;

export function baselineScript(files: string[]): string {
  return `set -e
${STEP_FUNCTION}
mkdir -p tmp
${stepCall('npm ci')}
npm ci
${stepCall('tests')}
npm run test:cached -- ${files.map(quoted).join(' ')}
`;
}

function namedTests(record: FailureRecord | null): FailedTest[] | null {
  return record === null || record.failed.length === 0 || record.unhandledErrors > 0 ? null : record.failed;
}

async function baselineOrNull(ctx: Ctx, at: Checked, failed: FailedTest[]): Promise<{ sha: string; record: FailureRecord } | null> {
  try {
    return await baselineRun(ctx, at, [...new Set(failed.map((test) => test.file))]);
  } catch (error) {
    ctx.log(at.stage, null, `the rerun of the failed tests on ${at.into} did not run, so every failure stands: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function withoutBaseline(ctx: Ctx, at: Checked, failure: string): Promise<string> {
  const failed = namedTests(readFailureRecord(at.dir));
  if (failed === null) return failure;
  const base = await baselineOrNull(ctx, at, failed);
  if (base === null) return failure;
  const known = new Set(base.record.failed.map(testIdentity));
  const excluded = failed.filter((test) => known.has(testIdentity(test)));
  if (excluded.length === 0) return failure;
  const fresh = failed.filter((test) => !known.has(testIdentity(test)));
  recordExclusions(ctx, at, base.sha, excluded.map(testIdentity), fresh.map(testIdentity));
  if (fresh.length === 0) throw new BaselineFailureError(at.into, base.sha, excluded.map(testIdentity));
  return freshFailure(fresh);
}

async function baselineRun(ctx: Ctx, at: Checked, files: string[]): Promise<{ sha: string; record: FailureRecord }> {
  const dir = `${at.dir}-baseline`;
  rmSync(dir, { recursive: true, force: true });
  await ctx.repo.fetch();
  await ctx.repo.prepareWorkClone(at.into, at.into, dir);
  const sha = await ctx.repo.workHead(dir);
  ctx.log(at.stage, null, `${files.length} test files failed, running them alone on ${at.into} at ${sha} with one worker`);
  const log = releaseLog(ctx, `${at.stage}-baseline-${at.into.replaceAll('/', '-')}`);
  await runChecks(ctx, { stage: at.stage, issue: null }, dir, baselineScript(files), log, FAILURES_ENV, { ...testPoolPin(ctx.cfg), testWorkers: 1 });
  const record = readFailureRecord(dir);
  if (record === null) throw new Error(`the rerun on ${at.into} at ${sha} wrote no test record, log ${log}`);
  return { sha, record };
}

function recordExclusions(ctx: Ctx, at: Checked, sha: string, excluded: string[], failing: string[]): void {
  ctx.log(at.stage, null, `${excluded.length} failed tests also fail on ${at.into} at ${sha}, so the fix round leaves them out: ${excluded.join(', ')}`);
  appendLedger(ctx.cfg.home, { kind: 'baseline', job: process.env[JOB_ID_ENV] ?? null, stage: at.stage, into: at.into, sha, excluded, failing, at: ctx.now().toISOString() });
}

function freshFailure(fresh: FailedTest[]): string {
  return fresh.map((failed) => `FAIL ${testIdentity(failed)}\n${failed.errors.join('\n').slice(0, ERROR_CHARS)}`).join('\n\n');
}
