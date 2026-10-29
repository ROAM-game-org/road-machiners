export const TEST_CPU_LIMIT_MS = 30_000;
export const FILE_CPU_LIMIT_MS = 90_000;
export const REFERENCE_WORKLOAD_MS = 1470;
export const WORKLOAD_RUNS = 3;

export function cpuLimitsOn(env: NodeJS.ProcessEnv): boolean {
  return env.CI === 'true';
}

export function cpuMs(usage: NodeJS.CpuUsage): number {
  return (usage.user + usage.system) / 1000;
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median needs at least one value');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function measureWorkloadMs<T>(work: () => T): { ms: number; result: T } {
  const timings: number[] = [];
  let result: T | undefined;
  for (let run = 0; run < WORKLOAD_RUNS; run++) {
    const start = process.threadCpuUsage();
    result = work();
    timings.push(cpuMs(process.threadCpuUsage(start)));
  }
  return { ms: median(timings), result: result as T };
}

export function speedFactor(workloadMs: number): number {
  if (!(workloadMs > 0)) throw new Error(`The runner speed workload took ${workloadMs} ms, which cannot scale a limit.`);
  return workloadMs / REFERENCE_WORKLOAD_MS;
}

export function scaledLimitMs(baseMs: number, factor: number): number {
  return baseMs * factor;
}

export function overCpuLimit(what: string, usedMs: number, baseLimitMs: number, factor: number): string | null {
  const limitMs = scaledLimitMs(baseLimitMs, factor);
  if (usedMs <= limitMs) return null;
  return `${what} used ${(usedMs / 1000).toFixed(1)} s of CPU time, over its limit of ${(limitMs / 1000).toFixed(1)} s (${baseLimitMs / 1000} s times a runner speed factor of ${factor.toFixed(2)}). Keep every case, seed and turn. Build shared worlds once and clone them, and split cases into their own tests or files. See docs/tools.md.`;
}
