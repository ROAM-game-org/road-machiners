import { describe, expect, it } from 'vitest';
import { FramePace, PACE_FRAMES } from './frame-pace';

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
});
