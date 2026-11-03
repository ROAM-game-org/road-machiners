import { describe, expect, it } from 'vitest';
import { bySameStateWork, censusLines, censusRows, workerSteps, type CensusStat } from '../../scripts/census-report.mjs';

const stat = (over: Partial<CensusStat>): CensusStat => ({ calls: 0, selfMs: 0, selfBytes: 0, sameCalls: 0, sameMs: 0, sameBytes: 0, gcCalls: 0, ...over });

const PID = 1;
const WORKER = 20;
const MAIN = 10;
type Node = { id: number; name: string; parent?: number };

function profile(tid: number, id: string, nodes: Node[], samples: number[], stepMs: number): Record<string, unknown>[] {
  const cpuNodes = nodes.map((n) => ({ id: n.id, parent: n.parent, callFrame: { functionName: n.name, url: '', lineNumber: 0, columnNumber: 0 } }));
  return [
    { name: 'Profile', ph: 'P', pid: PID, tid, id, args: { data: { startTime: 0 } } },
    { name: 'ProfileChunk', ph: 'P', pid: PID, tid: tid + 1, id, args: { data: { cpuProfile: { nodes: cpuNodes, samples }, timeDeltas: samples.map(() => stepMs * 1000) } } },
  ];
}

const TURN_NODES: Node[] = [
  { id: 1, name: '(root)' },
  { id: 2, name: 'computeTurnIn', parent: 1 },
  { id: 3, name: 'endTurn', parent: 2 },
  { id: 4, name: 'timed', parent: 3 },
  { id: 5, name: 'update', parent: 4 },
  { id: 6, name: '(anonymous)', parent: 5 },
  { id: 7, name: 'planNpcOrders', parent: 6 },
  { id: 8, name: 'routeOf', parent: 7 },
  { id: 9, name: 'refreshVision', parent: 6 },
  { id: 10, name: 'captureDrive', parent: 2 },
  { id: 11, name: '(idle)', parent: 1 },
];

function trace(): Record<string, unknown>[] {
  return [
    { ph: 'M', name: 'thread_name', pid: PID, tid: WORKER, args: { name: 'DedicatedWorker thread' } },
    { ph: 'M', name: 'thread_name', pid: PID, tid: MAIN, args: { name: 'CrRendererMain' } },
    ...profile(WORKER, '0x2', TURN_NODES, [8, 8, 7, 9, 10, 11, 11, 7], 10),
    ...profile(MAIN, '0x1', TURN_NODES, [8, 8, 8, 8, 8, 8, 8, 8], 10),
  ];
}

describe('census rows', () => {
  it('gives each method its calls, own time, garbage and same-state share per frame', () => {
    const rows = censusRows({ 'trucks.viewOf': stat({ calls: 40, selfMs: 20, selfBytes: 40 * 1024, sameCalls: 30, sameMs: 12, sameBytes: 20 * 1024 }) }, 10);
    expect(rows).toEqual([{ key: 'trucks.viewOf', callsPerFrame: 4, msPerFrame: 2, kbPerFrame: 4, sameShare: 0.75, sameMsPerFrame: 1.2, sameKbPerFrame: 2, gcCalls: 0 }]);
  });

  it('fails loud when no frame ran', () => {
    expect(() => censusRows({}, 0)).toThrow('no game frames');
  });

  it('ranks same-state work by its time and leaves out methods that never repeated', () => {
    const rows = censusRows({ a: stat({ calls: 2, selfMs: 9, sameCalls: 0 }), b: stat({ calls: 2, selfMs: 4, sameCalls: 1, sameMs: 2 }), c: stat({ calls: 2, selfMs: 3, sameCalls: 2, sameMs: 3 }) }, 1);
    expect(bySameStateWork(rows).map((row) => row.key)).toEqual(['c', 'b']);
  });
});

describe('worker steps', () => {
  it('sums worker time by the step right under each anchor, skipping pass-through frames and idle time', () => {
    const groups = workerSteps(trace());
    expect(groups.find((g) => g.anchor === 'endTurn')).toEqual({ anchor: 'endTurn', totalMs: 40, steps: [{ name: 'planNpcOrders', ms: 30 }, { name: 'refreshVision', ms: 10 }] });
    expect(groups.find((g) => g.anchor === 'computeTurnIn')).toEqual({ anchor: 'computeTurnIn', totalMs: 50, steps: [{ name: 'endTurn', ms: 40 }, { name: 'captureDrive', ms: 10 }] });
  });

  it('reads only worker threads', () => {
    const total = workerSteps(trace()).reduce((sum, g) => sum + g.totalMs, 0);
    expect(total).toBe(90);
  });

  it('prints a scene census with every section', () => {
    const lines = censusLines('drive', { stats: { 'game.frame': stat({ calls: 5, selfMs: 5 }) }, frames: 5, systems: 3 }, workerSteps(trace()));
    expect(lines[0]).toContain('Census of drive: 5 frames, 3 systems wrapped');
    expect(lines).toContain('Worker endTurn, 40 ms in all, by step:');
    expect(lines.some((line) => line.includes('game.frame'))).toBe(true);
  });
});
