import { describe, expect, it } from 'vitest';
import { createStallWatch, stallMinutes } from './stall';

const MINUTE = 60_000;

describe('stallMinutes', () => {
  it('turns the watch off when TEST_STALL_MINUTES is unset', () => {
    expect(stallMinutes({})).toBeNull();
  });

  it('reads a positive number of minutes', () => {
    expect(stallMinutes({ TEST_STALL_MINUTES: '15' })).toBe(15);
    expect(stallMinutes({ TEST_STALL_MINUTES: '0.05' })).toBe(0.05);
  });

  it('fails loudly on a value that is not a positive number', () => {
    for (const raw of ['', '0', '-3', 'soon']) expect(() => stallMinutes({ TEST_STALL_MINUTES: raw })).toThrow(/TEST_STALL_MINUTES/);
  });
});

describe('createStallWatch', () => {
  it('stays quiet while tests keep finishing', () => {
    const watch = createStallWatch(10 * MINUTE, 0);
    watch.fileStarted('src/a.test.ts', 0);
    watch.caseStarted('a1', 'src/a.test.ts', 'drives');
    watch.caseEnded('a1', 9 * MINUTE);
    expect(watch.stalled(18 * MINUTE)).toBeNull();
  });

  it('names each running file and its running test once nothing finished for the limit', () => {
    const watch = createStallWatch(10 * MINUTE, 0);
    watch.fileStarted('src/a.test.ts', 0);
    watch.fileStarted('src/b.test.ts', 0);
    watch.caseStarted('a1', 'src/a.test.ts', 'drives > into the wall');
    watch.caseStarted('b1', 'src/b.test.ts', 'loads');
    watch.caseEnded('b1', 2 * MINUTE);
    watch.fileEnded('src/b.test.ts', 3 * MINUTE);
    expect(watch.stalled(12 * MINUTE)).toBeNull();
    expect(watch.stalled(13 * MINUTE)).toBe('[test-cache] StallError: no test finished in 10 minutes. Still running: src/a.test.ts > drives > into the wall');
  });

  it('counts a test file that starts as progress, so a slow start is no stall', () => {
    const watch = createStallWatch(MINUTE, 0);
    watch.fileStarted('src/a.test.ts', 3 * MINUTE);
    expect(watch.stalled(3 * MINUTE + 1)).toBeNull();
  });

  it('names a file that hangs before any of its tests start', () => {
    const watch = createStallWatch(MINUTE, 0);
    watch.fileStarted('src/import-hangs.test.ts', 0);
    expect(watch.stalled(MINUTE)).toBe('[test-cache] StallError: no test finished in 1 minutes. Still running: src/import-hangs.test.ts');
  });

  it('does not count a run with nothing running as a stall', () => {
    const watch = createStallWatch(MINUTE, 0);
    watch.fileStarted('src/a.test.ts', 0);
    watch.fileEnded('src/a.test.ts', 0);
    expect(watch.stalled(5 * MINUTE)).toBeNull();
  });
});
