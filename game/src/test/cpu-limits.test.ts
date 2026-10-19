import { describe, expect, it } from 'vitest';
import { cpuLimitsOn, cpuMs, overCpuLimit } from './cpu-limits';

describe('CPU time limits', () => {
  it('passes work at or under the limit', () => {
    expect(overCpuLimit('The test "a"', 20_000, 20_000)).toBeNull();
  });

  it('names the work, its CPU time and the limit when over it', () => {
    expect(overCpuLimit('The file src/a.test.ts', 61_250, 60_000)).toMatch(/^The file src\/a\.test\.ts used 61\.3 s of CPU time, over its limit of 60 s\./);
  });

  it('counts user and system time in milliseconds', () => {
    expect(cpuMs({ user: 1_500_000, system: 500_000 })).toBe(2000);
  });

  it('applies only on GitHub Actions, which sets CI to true', () => {
    expect(cpuLimitsOn({ CI: 'true' })).toBe(true);
    expect(cpuLimitsOn({})).toBe(false);
  });
});
