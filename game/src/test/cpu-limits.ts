export const TEST_CPU_LIMIT_MS = 30_000;
export const FILE_CPU_LIMIT_MS = 90_000;
export const REFERENCE_WORKLOAD_MS = 1470;
export const WORKLOAD_RUNS = 3;

export function cpuMs(usage: NodeJS.CpuUsage): number {
  return (usage.user + usage.system) / 1000;
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median needs at least one value');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export const SPEED_WORKLOAD_ROUNDS = 80;
const SPEED_WORKLOAD_ITEMS = 20_000;

type WorkloadItem = { id: number; x: number; y: number; weight: number };

function nextRandom(state: number): number {
  return (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
}

export function speedWorkload(rounds = SPEED_WORKLOAD_ROUNDS): number {
  let seed = 1;
  let checksum = 0;
  for (let round = 0; round < rounds; round++) {
    const items: WorkloadItem[] = [];
    const byId = new Map<number, WorkloadItem>();
    for (let i = 0; i < SPEED_WORKLOAD_ITEMS; i++) {
      seed = nextRandom(seed);
      const item = { id: seed % 50_000, x: (seed & 0xffff) / 0xffff, y: (seed >>> 16) / 0xffff, weight: 0 };
      item.weight = Math.sqrt(item.x * item.x + item.y * item.y) + Math.sin(item.x * 7) * Math.cos(item.y * 3);
      items.push(item);
      byId.set(item.id, item);
    }
    items.sort((a, b) => a.weight - b.weight || a.id - b.id);
    for (let i = 0; i < items.length; i += 7) checksum = (checksum + (byId.get(items[i].id)?.id ?? 0) + Math.floor(items[i].weight * 1000)) % 1_000_000_007;
  }
  return checksum;
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
  return `${what} used ${(usedMs / 1000).toFixed(1)} s of CPU time, over its limit of ${(limitMs / 1000).toFixed(1)} s (${baseLimitMs / 1000} s times a runner speed factor of ${factor.toFixed(2)}). Keep every case, seed and turn. Build shared worlds once and clone them, and split cases into their own tests or files. See docs/testing.md.`;
}
