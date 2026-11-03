export const CENSUS_TOP: number;
export const WORKER_ANCHORS: string[];

export type CensusStat = { calls: number; selfMs: number; selfBytes: number; sameCalls: number; sameMs: number; sameBytes: number; gcCalls: number };
export type Census = { stats: Record<string, CensusStat>; frames: number; systems: number };
export type CensusRow = { key: string; callsPerFrame: number; msPerFrame: number; kbPerFrame: number; sameShare: number; sameMsPerFrame: number; sameKbPerFrame: number; gcCalls: number };
export type WorkerStepGroup = { anchor: string; totalMs: number; steps: { name: string; ms: number }[] };

export function censusRows(stats: Record<string, CensusStat>, frames: number): CensusRow[];
export function byOwnTime(rows: CensusRow[]): CensusRow[];
export function byGarbage(rows: CensusRow[]): CensusRow[];
export function bySameStateWork(rows: CensusRow[]): CensusRow[];
export function censusLines(scene: string, census: Census, rules: WorkerStepGroup[]): string[];
export function workerSteps(trace: { traceEvents: Record<string, unknown>[] } | Record<string, unknown>[]): WorkerStepGroup[];
