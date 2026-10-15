export const TEST_CPU_LIMIT_MS = 30_000;
export const FILE_CPU_LIMIT_MS = 90_000;

export function cpuMs(usage: NodeJS.CpuUsage): number {
  return (usage.user + usage.system) / 1000;
}

export function overCpuLimit(what: string, usedMs: number, limitMs: number): string | null {
  if (usedMs <= limitMs) return null;
  return `${what} used ${(usedMs / 1000).toFixed(1)} s of CPU time, over its limit of ${limitMs / 1000} s. Make it cheaper: build shared worlds once, clone them, and use smaller samples. See docs/tools.md.`;
}
