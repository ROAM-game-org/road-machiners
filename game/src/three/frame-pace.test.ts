import { describe, expect, it } from 'vitest';
import { FramePace, PACE_FRAMES, PACE_SLICE_MS } from './frame-pace';

describe('FramePace', () => {
  it('has no numbers before the first frame', () => {
    expect(new FramePace().summary()).toEqual({ count: 0, medianMs: null, p95Ms: null, over50: 0 });
  });

  it('keeps only the newest frames once the ring wraps', () => {
    const pace = new FramePace();
    for (let i = 0; i < PACE_FRAMES; i++) pace.note(100);
    for (let i = 0; i < PACE_FRAMES; i++) pace.note(16);
    expect(pace.summary()).toEqual({ count: PACE_FRAMES, medianMs: 16, p95Ms: 16, over50: 0 });
  });

  it('reads the median, the 95th percentile and the slow frames of a known run', () => {
    const pace = new FramePace();
    for (let i = 0; i < 95; i++) pace.note(16);
    for (let i = 0; i < 5; i++) pace.note(80);
    expect(pace.summary()).toEqual({ count: 100, medianMs: 16, p95Ms: 80, over50: 5 });
  });

  describe('timeline', () => {
    it('shows a stall that the last 600 frames no longer hold', () => {
      const pace = new FramePace();
      let now = 0;
      for (let i = 0; i < 6; i++) { pace.note(300, now); now += 300; }
      for (let i = 0; i < PACE_FRAMES; i++) { pace.note(8, now); now += 8; }
      expect(pace.summary().over50).toBe(0);
      expect(pace.timeline(now)).toEqual([{ ageS: 0, frames: PACE_FRAMES + 6, slowestMs: 300, over50: 6, programsBuilt: 0, turnWaitMs: 0 }]);
    });

    it('counts program growth as builds and ignores a drop', () => {
      const pace = new FramePace();
      pace.note(8, 0, 99);
      pace.note(8, 10, 101);
      pace.note(8, 20, 90);
      expect(pace.timeline(20)[0].programsBuilt).toBe(2);
    });

    it('keeps the longest turn wait in the slice it ended in', () => {
      const pace = new FramePace();
      pace.note(8, 0);
      pace.noteTurnWait(400, 100);
      pace.noteTurnWait(900, PACE_SLICE_MS + 5);
      pace.noteTurnWait(100, PACE_SLICE_MS + 6);
      expect(pace.timeline(PACE_SLICE_MS + 6).map((slice) => [slice.ageS, slice.turnWaitMs])).toEqual([[10, 400], [0, 900]]);
    });

    it('drops slices older than the window after a long gap', () => {
      const pace = new FramePace();
      pace.note(80, 0);
      pace.note(8, 10 * 60_000);
      expect(pace.timeline(10 * 60_000)).toEqual([{ ageS: 0, frames: 1, slowestMs: 8, over50: 0, programsBuilt: 0, turnWaitMs: 0 }]);
    });

    it('reports the age of each slice, oldest first', () => {
      const pace = new FramePace();
      pace.note(8, 0);
      pace.note(8, 3 * PACE_SLICE_MS);
      expect(pace.timeline(3 * PACE_SLICE_MS + 1).map((slice) => slice.ageS)).toEqual([30, 0]);
    });
  });
});
