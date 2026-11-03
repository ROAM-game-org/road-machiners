export const CENSUS_TOP: number;

export type CensusStat = { calls: number; selfMs: number; selfBytes: number; sameCalls: number; sameMs: number; sameBytes: number; gcCalls: number };
export type Census = { stats: Record<string, CensusStat>; frames: number; systems: number };
export type CensusRow = { key: string; callsPerFrame: number; msPerFrame: number; kbPerFrame: number; sameShare: number; sameMsPerFrame: number; sameKbPerFrame: number; gcCalls: number };

export function censusRows(stats: Record<string, CensusStat>, frames: number): CensusRow[];
export function bySameStateWork(rows: CensusRow[]): CensusRow[];
export function bySameStateGarbage(rows: CensusRow[]): CensusRow[];
export function censusLines(scene: string, census: Census): string[];
