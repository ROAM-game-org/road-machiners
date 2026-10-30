import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CheckTimeoutError } from '../container';
import { causeOf, FAILURE_TAIL_LINES } from '../fail';
import { checkFailure, checkUntilReal, ChecksTimeoutError, type CheckOutcome } from './checks';

const HUNG = 'the checks ran past their 45 minute limit, and the factory removed their container.';

function logOf(lines: string[]): string {
  const path = join(mkdtempSync(join(tmpdir(), 'checks-timeout-')), 'checks.log');
  writeFileSync(path, lines.join('\n'));
  return path;
}

const filler = (count: number) => Array.from({ length: count }, (_, index) => `turn ${index} ok`);

describe('timed-out checks', () => {
  it('keeps a failure that scrolled out of the log tail and sends it to the session', async () => {
    const log = logOf([' FAIL  src/raid.test.ts > raids', 'AssertionError: expected 0 to be greater than or equal to 5', ...filler(FAILURE_TAIL_LINES * 2)]);
    const outcome = checkFailure(log, new CheckTimeoutError(HUNG), 0);
    expect(outcome.timedOut).toBe(true);
    expect(outcome.failure).toContain('AssertionError: expected 0 to be greater than or equal to 5');
    expect(outcome.failure).toContain(`turn ${FAILURE_TAIL_LINES * 2 - 1} ok`);
    let runs = 0;
    const failure = await checkUntilReal(async () => { runs++; return outcome; }, () => {});
    expect(runs).toBe(1);
    expect(failure).toContain('expected 0 to be greater than or equal to 5');
  });

  it('reads only what this run wrote to a shared log', () => {
    const earlier = 'AssertionError: an older run failed';
    const log = logOf([earlier, ...filler(3)]);
    const from = earlier.length + 1;
    const outcome = checkFailure(log, new CheckTimeoutError(HUNG), from);
    expect(outcome.errors).toEqual([]);
    expect(outcome.failure).not.toContain('older run');
  });

  it('fails with the timeout cause after three runs that only timed out', async () => {
    const log = logOf(filler(FAILURE_TAIL_LINES * 2));
    let runs = 0;
    const waits: number[] = [];
    const check = async (): Promise<CheckOutcome> => { runs++; return checkFailure(log, new CheckTimeoutError(HUNG), 0); };
    const error = await checkUntilReal(check, (run) => waits.push(run)).catch((caught: unknown) => caught);
    expect(runs).toBe(3);
    expect(waits).toEqual([1, 2]);
    expect(error).toBeInstanceOf(ChecksTimeoutError);
    expect(causeOf(error)).toBe('timeout');
  });

  it('runs again a run whose only errors anywhere in the log are test timeouts', async () => {
    const log = logOf([' FAIL  src/drive.test.ts > climbs', 'Error: Test timed out in 30000ms.', ...filler(FAILURE_TAIL_LINES * 2)]);
    const outcome = checkFailure(log, new CheckTimeoutError(HUNG), 0);
    expect(outcome.errors).toEqual(['Error: Test timed out in 30000ms.']);
    const outcomes: CheckOutcome[] = [outcome, null];
    expect(await checkUntilReal(async () => outcomes.shift() ?? null, () => {})).toBeNull();
  });
});
