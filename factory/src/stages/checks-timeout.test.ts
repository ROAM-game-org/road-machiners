import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CheckTimeoutError } from '../container';
import { causeOf, JobTimeoutError } from '../fail';
import type { Ctx } from '../types';
import { CHECK_RUNS, checkUntilReal, runChecks, timeoutOnly } from './checks';

const FILLER = Array.from({ length: 400 }, (_, index) => `progress line ${index}`).join('\n');
const LIMIT = 'the checks ran past their 45 minute limit, and the factory removed their container.';

function ctxWriting(log: string, output: string): Ctx {
  return {
    cfg: { checksTimeoutMinutes: 45, testStallMinutes: 10 },
    log: () => undefined,
    container: { shell: async () => { writeFileSync(log, `${output}\n${LIMIT}\n`); throw new CheckTimeoutError(LIMIT); } },
  } as unknown as Ctx;
}

async function outcomeOf(output: string) {
  const log = join(mkdtempSync(join(tmpdir(), 'checks-timeout-')), 'checks.log');
  return runChecks(ctxWriting(log, output), { stage: 'merge', issue: null }, '/dir', 'true', log, {});
}

describe('a timed-out checks run', () => {
  it('keeps a failed test that scrolled out of the tail, and takes the run as a real failure', async () => {
    const outcome = await outcomeOf(` FAIL  raid.test.ts > raids\nAssertionError: expected 0 to be greater than or equal to 5\n${FILLER}`);
    expect(outcome?.failure).toContain('AssertionError: expected 0 to be greater than or equal to 5');
    expect(timeoutOnly(outcome!)).toBe(false);
    let reruns = 0;
    const failure = await checkUntilReal(async () => outcome, () => { reruns++; });
    expect(failure).toContain('expected 0 to be greater than or equal to 5');
    expect(reruns).toBe(0);
  });

  it('is only a timeout when the whole output holds no other error', async () => {
    const outcome = await outcomeOf(` FAIL  drive.test.ts > climbs\nError: Test timed out in 30000ms.\n${FILLER}`);
    expect(timeoutOnly(outcome!)).toBe(true);
  });

  it('fails with a timeout cause after the last timed-out run, so the stuck sweep splits the batch', async () => {
    const outcome = await outcomeOf(FILLER);
    let runs = 0;
    const error = await checkUntilReal(async () => { runs++; return outcome; }, () => undefined).catch((caught: unknown) => caught);
    expect(runs).toBe(CHECK_RUNS);
    expect(error).toBeInstanceOf(JobTimeoutError);
    expect(causeOf(error)).toBe('timeout');
  });
});
