import { describe, expect, it } from 'vitest';
import { boundOf, driveTurnGaps, drawTotals, emptyBySystem, frameStats, passStats, poolFrames, savingOf, slowFrameSums, spreadOf, turnStats, type FrameRecord, type PassStats } from './report';

const frame = (real: number, extra: Partial<FrameRecord> = {}): FrameRecord => ({ real, tick: real / 2, render: real / 4, gpu: null, uploadBytes: 0, chunkBuilds: 0, calls: 0, timers: {}, ...extra });

describe('turnStats', () => {
  const log = { waits: [40, 60], workers: [30], previews: [], starts: [], steps: {} };

  it('gives no turn stats when no turn scene ran, and no preview stats without the drive', () => {
    expect(turnStats(['town-day'], { ...log, waits: [], workers: [] })).toMatchObject({ waitMs: null, workerTurnMs: null, previewMs: null });
    expect(turnStats(['fight'], log)).toMatchObject({ waitMs: { frames: 2 }, workerTurnMs: { frames: 1 }, previewMs: null });
  });

  it('fails when a scene that measures turns ran but nothing was measured', () => {
    expect(() => turnStats(['drive'], log)).toThrow();
  });
});

describe('driveTurnGaps', () => {
  it('counts a turn that starts while the last one still plays as no wait', () => {
    const gaps = driveTurnGaps(5);
    expect(gaps(5, true, 100)).toBeNull();
    expect(gaps(6, true, 200)).toEqual({ scene: 'drive', ms: 0, ready: true });
  });

  it('times a turn from the moment playback ended', () => {
    const gaps = driveTurnGaps(5);
    expect(gaps(5, false, 100)).toBeNull();
    expect(gaps(5, false, 150)).toBeNull();
    expect(gaps(6, true, 340)).toEqual({ scene: 'drive', ms: 240, ready: false });
    expect(gaps(6, false, 400)).toBeNull();
    expect(gaps(7, true, 410)).toEqual({ scene: 'drive', ms: 10, ready: false });
  });
});

describe('frameStats', () => {
  it('takes the median of an odd list and the mean of the middle pair of an even list', () => {
    expect(frameStats([9, 1, 5]).median).toBe(5);
    expect(frameStats([4, 1, 2, 3]).median).toBe(2.5);
  });

  it('takes p99 by nearest rank', () => {
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(frameStats(hundred).p99).toBe(99);
    expect(frameStats([1, 2, 3]).p99).toBe(3);
    expect(frameStats([7]).p99).toBe(7);
  });

  it('counts frames strictly over 33.3 and over 100 ms and keeps the worst', () => {
    const stats = frameStats([16, 33.3, 33.4, 100, 100.1, 250]);
    expect(stats).toMatchObject({ over33: 4, over100: 2, worst: 250, frames: 6 });
  });

  it('throws on an empty list and on a sample that is not a number', () => {
    expect(() => frameStats([])).toThrow('at least one sample');
    expect(() => frameStats([1, Number.NaN])).toThrow('finite');
  });
});

describe('passStats', () => {
  it('has gpu null when no frame has a GPU time', () => {
    expect(passStats([frame(10), frame(20)]).gpu).toBeNull();
  });

  it('measures gpu when every frame has one', () => {
    const stats = passStats([frame(10, { gpu: 2 }), frame(20, { gpu: 4 })]);
    expect(stats.gpu?.median).toBe(3);
    expect(stats.tickCpu.median).toBe(7.5);
    expect(stats.renderCpu.median).toBe(3.75);
  });

  it('throws when only some frames have a GPU time, so a missing timer never turns into 0', () => {
    expect(() => passStats([frame(10, { gpu: 2 }), frame(20)])).toThrow('no GPU time');
  });
});

describe('poolFrames and spreadOf', () => {
  it('joins the passes in order', () => {
    expect(poolFrames([[frame(1)], [frame(2), frame(3)]]).map((f) => f.real)).toEqual([1, 2, 3]);
  });

  it('judges the passes by mean, since GPU backlog stalls move the median without moving the time played', () => {
    const steady = passStats([frame(20), frame(20), frame(20), frame(20)]);
    const bursty = passStats([frame(5), frame(5), frame(5), frame(65)]);
    expect(bursty.real.median).toBe(5);
    expect(bursty.real.mean).toBe(20);
    expect(spreadOf([steady, bursty])).toBe(0);
  });

  it('divides the gap between two pass means by the smaller one', () => {
    const slow = passStats([frame(22)]);
    const fast = passStats([frame(20)]);
    expect(spreadOf([slow, fast])).toBeCloseTo(0.1);
    expect(spreadOf([fast, fast])).toBe(0);
  });

  it('throws on a wrong pass count and on a zero median', () => {
    const one = passStats([frame(5)]);
    expect(() => spreadOf([one])).toThrow('exactly 2 passes');
    expect(() => spreadOf([one, passStats([frame(0)])])).toThrow('positive');
  });
});

describe('boundOf', () => {
  const pass = (gpu: number | null, tick: number): PassStats => {
    const base = passStats([frame(10)]);
    return { ...base, tickCpu: frameStats([tick]), gpu: gpu === null ? null : frameStats([gpu]) };
  };

  it('is null without a GPU timer', () => {
    expect(boundOf(pass(null, 5))).toBeNull();
  });

  it('is gpu when the GPU median is above the tick CPU median, else cpu', () => {
    expect(boundOf(pass(9, 5))).toBe('gpu');
    expect(boundOf(pass(5, 5))).toBe('cpu');
    expect(boundOf(pass(2, 5))).toBe('cpu');
  });
});

describe('slowFrameSums', () => {
  it('sums only frames over 33.3 ms', () => {
    const frames = [
      frame(16, { uploadBytes: 999, chunkBuilds: 9, timers: { turn: 5 } }),
      frame(40, { render: 10, tick: 30, uploadBytes: 100, chunkBuilds: 1, timers: { route: 4 } }),
      frame(120, { render: 20, tick: 25, uploadBytes: 50, chunkBuilds: 2, timers: { route: 6, fog: 1 } }),
      frame(150, { render: 5, tick: 6 }),
    ];
    expect(slowFrameSums(frames)).toEqual({
      count: 3,
      renderMs: 35,
      tickRestMs: 20 + 5 + 1,
      timers: { route: 10, fog: 1 },
      uploadBytes: 150,
      chunkBuilds: 3,
      over100WithChunkBuild: 1,
    });
  });

  it('is all zero counts for no slow frames', () => {
    expect(slowFrameSums([frame(10)])).toMatchObject({ count: 0, chunkBuilds: 0, over100WithChunkBuild: 0 });
  });
});

describe('savingOf and drawTotals', () => {
  it('subtracts the toggled median from the baseline', () => {
    expect(savingOf(30, 22)).toBe(8);
    expect(savingOf(20, 25)).toBe(-5);
  });

  it('adds draws over systems for each pass and over both passes', () => {
    const by = emptyBySystem();
    by.props.main = { draws: 10, triangles: 100 };
    by.props.shadow = { draws: 4, triangles: 40 };
    by.vehicles.main = { draws: 3, triangles: 30 };
    expect(drawTotals(by)).toEqual({ total: 17, byPass: { main: { draws: 13, triangles: 130 }, shadow: { draws: 4, triangles: 40 } } });
  });
});
