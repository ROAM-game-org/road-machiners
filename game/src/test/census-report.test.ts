import { describe, expect, it } from 'vitest';
import { bySameStateGarbage, bySameStateWork, censusLines, censusRows, type CensusStat } from '../../scripts/census-report.mjs';

const stat = (over: Partial<CensusStat>): CensusStat => ({ calls: 0, selfMs: 0, selfBytes: 0, sameCalls: 0, sameMs: 0, sameBytes: 0, gcCalls: 0, ...over });

describe('census rows', () => {
  it('gives each method its calls, own time, garbage and same-state share per frame', () => {
    const rows = censusRows({ 'trucks.viewOf': stat({ calls: 40, selfMs: 20, selfBytes: 40 * 1024, sameCalls: 30, sameMs: 12, sameBytes: 20 * 1024 }) }, 10);
    expect(rows).toEqual([{ key: 'trucks.viewOf', callsPerFrame: 4, msPerFrame: 2, kbPerFrame: 4, sameShare: 0.75, sameMsPerFrame: 1.2, sameKbPerFrame: 2, gcCalls: 0 }]);
  });

  it('fails loud when no frame ran', () => {
    expect(() => censusRows({}, 0)).toThrow('no game frames');
  });

  it('ranks redone work by time and by garbage, leaving out methods that never repeated', () => {
    const rows = censusRows({ a: stat({ calls: 2, selfMs: 9 }), b: stat({ calls: 2, sameCalls: 1, sameMs: 2, sameBytes: 4096 }), c: stat({ calls: 2, sameCalls: 2, sameMs: 3, sameBytes: 1024 }) }, 1);
    expect(bySameStateWork(rows).map((row) => row.key)).toEqual(['c', 'b']);
    expect(bySameStateGarbage(rows).map((row) => row.key)).toEqual(['b', 'c']);
  });

  it('prints a scene census with both rankings', () => {
    const lines = censusLines('drive', { stats: { 'labels.update': stat({ calls: 5, sameCalls: 5, sameMs: 5, sameBytes: 5120 }) }, frames: 5, systems: 3 });
    expect(lines[0]).toContain('Census of drive: 5 frames, 3 systems wrapped');
    expect(lines.filter((line) => line.includes('labels.update'))).toHaveLength(2);
  });
});
