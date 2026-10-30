import { describe, expect, it } from 'vitest';
import { cpuMs, FILE_CPU_LIMIT_MS, measureWorkloadMs, median, overCpuLimit, REFERENCE_WORKLOAD_MS, scaledLimitMs, speedFactor, TEST_CPU_LIMIT_MS, WORKLOAD_RUNS } from './cpu-limits';

describe('CPU time limits', () => {
  it('passes work at or under the limit', () => {
    expect(overCpuLimit('The test "a"', 20_000, 20_000, 1)).toBeNull();
  });

  it('names the work, its CPU time and the limit when over it', () => {
    expect(overCpuLimit('The file src/a.test.ts', 61_250, 60_000, 1)).toMatch(/^The file src\/a\.test\.ts used 61\.3 s of CPU time, over its limit of 60\.0 s/);
  });

  it('tells the reader to keep every case and split work, not to shrink samples', () => {
    const message = overCpuLimit('The test "a"', 40_000, 30_000, 1) ?? '';
    expect(message).toContain('Keep every case, seed and turn');
    expect(message).toContain('clone them');
    expect(message).toContain('split cases into their own tests or files');
    expect(message).not.toContain('smaller samples');
  });

  it('shows the runner speed factor in the message', () => {
    expect(overCpuLimit('The test "a"', 40_000, 30_000, 1.25) ?? '').toContain('30 s times a runner speed factor of 1.25');
  });

  it('counts user and system time in milliseconds', () => {
    expect(cpuMs({ user: 1_500_000, system: 500_000 })).toBe(2000);
  });
});

describe('runner speed scaling', () => {
  it('keeps the base limits exactly on a runner as fast as the reference', () => {
    const factor = speedFactor(REFERENCE_WORKLOAD_MS);
    expect(factor).toBe(1);
    expect(scaledLimitMs(TEST_CPU_LIMIT_MS, factor)).toBe(30_000);
    expect(scaledLimitMs(FILE_CPU_LIMIT_MS, factor)).toBe(90_000);
  });

  it('tightens the limits on a faster runner', () => {
    const factor = speedFactor(REFERENCE_WORKLOAD_MS * 0.7);
    expect(factor).toBeCloseTo(0.7);
    expect(scaledLimitMs(TEST_CPU_LIMIT_MS, factor)).toBeCloseTo(21_000);
  });

  it('loosens the limits on a slower runner', () => {
    expect(scaledLimitMs(FILE_CPU_LIMIT_MS, speedFactor(REFERENCE_WORKLOAD_MS * 1.2))).toBeCloseTo(108_000);
  });

  it('fails on a workload that took no time', () => {
    expect(() => speedFactor(0)).toThrow(/cannot scale a limit/);
    expect(() => speedFactor(Number.NaN)).toThrow(/cannot scale a limit/);
  });

  it('applies the factor in the verdict', () => {
    expect(overCpuLimit('The test "a"', 25_000, 30_000, 0.7)).not.toBeNull();
    expect(overCpuLimit('The test "a"', 25_000, 30_000, 1)).toBeNull();
  });

  it('takes the median of the timings', () => {
    expect(median([5, 1, 9])).toBe(5);
    expect(median([4, 2, 3, 1, 5])).toBe(3);
    expect(() => median([])).toThrow();
  });

  it('runs the workload the fixed number of times and returns its result', () => {
    let runs = 0;
    const { ms, result } = measureWorkloadMs(() => ++runs);
    expect(runs).toBe(WORKLOAD_RUNS);
    expect(result).toBe(WORKLOAD_RUNS);
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});
