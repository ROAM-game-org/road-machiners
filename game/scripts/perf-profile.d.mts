export const TOP_COUNT: number;

export type TraceEvent = Record<string, unknown>;
export type ProfileEntry = { name: string; file: string; line: number | null; ms: number; pct: number };
export type ProfileGroup = {
  kind: 'slowFrames' | 'workerTurns' | 'mainTurns';
  scene: string;
  thread: string;
  windows: number;
  windowMs: number;
  busyMs: number;
  top: ProfileEntry[];
};
export type ProfileReport = { groups: ProfileGroup[] };

export function measureWindows(events: TraceEvent[]): { kind: string; scene: string; pid: number; tid: number; from: number; to: number }[];
export function profileReport(trace: { traceEvents: TraceEvent[] } | TraceEvent[]): ProfileReport;
export function profileLines(profile: ProfileReport): string[];

export type AllocationSite = { name: string; file: string; line: number | null };
export type AllocationEntry = AllocationSite & { caller: AllocationSite; bytes: number; mb: number; pct: number };
export type AllocationReport = { totalMb: number; top: AllocationEntry[] };
export type HeapSamplingNode = { callFrame: { functionName: string; url: string; lineNumber: number }; selfSize: number; children?: HeapSamplingNode[] };
export function allocationReport(sampling: { head: HeapSamplingNode }): AllocationReport;
export function allocationLines(allocations: AllocationReport): string[];
