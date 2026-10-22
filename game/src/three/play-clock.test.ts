import { describe, expect, it } from 'vitest';
import { easedStopMs, easedStopSteps, PlayClock } from './play-clock';

const EASE = 100;

function frame(clock: PlayClock, run: (c: PlayClock) => void): number {
  clock.beginFrame();
  run(clock);
  return clock.frameMs();
}

describe('PlayClock', () => {
  it('follows playback time exactly while a turn plays', () => {
    const clock = new PlayClock({ stopMs: EASE, startMs: EASE });
    expect(frame(clock, (c) => (c.advance(16), c.coast(16, true, 1)))).toBe(16);
    expect(frame(clock, (c) => (c.advance(32), c.coast(16, true, 2)))).toBe(32);
    expect(clock.nowMs()).toBe(48);
  });

  it('stands still when no turn plays or is wanted', () => {
    const clock = new PlayClock({ stopMs: EASE, startMs: EASE });
    expect(frame(clock, (c) => c.coast(16, false, 1))).toBe(0);
    expect(clock.nowMs()).toBe(0);
  });

  it('slows to a stop after a turn instead of halting', () => {
    const clock = new PlayClock({ stopMs: EASE, startMs: EASE });
    frame(clock, (c) => c.advance(16));
    const tail = [1, 2, 3, 4, 5, 6, 7].map(() => frame(clock, (c) => c.coast(20, false, 1)));
    expect(tail[0]).toBeGreaterThan(tail[2]);
    expect(tail[2]).toBeGreaterThan(0);
    tail.slice(5).forEach((ms) => expect(ms).toBeCloseTo(0, 12));
  });

  it('speeds up while the next turn is wanted, before it plays', () => {
    const clock = new PlayClock({ stopMs: EASE, startMs: EASE });
    const lead = [1, 2, 3].map(() => frame(clock, (c) => c.coast(20, true, 1)));
    expect(lead[0]).toBeGreaterThan(0);
    expect(lead[1]).toBeGreaterThan(lead[0]);
    expect(lead[2]).toBeLessThanOrEqual(20);
  });

  it('adds the same eased stop length while stopping from full speed, at any frame rate', () => {
    for (const dt of [4, 8.3, 16.7, 33]) {
      const clock = new PlayClock({ stopMs: EASE, startMs: EASE });
      frame(clock, (c) => c.advance(0));
      for (let i = 0; i < 100; i++) frame(clock, (c) => c.coast(dt, false, 1));
      expect(clock.nowMs()).toBeCloseTo(easedStopMs(EASE), 9);
      expect(clock.isMoving()).toBe(false);
    }
  });

  it('stops over its stop time and speeds up over its start time', () => {
    const clock = new PlayClock({ stopMs: 10 * EASE, startMs: EASE });
    frame(clock, (c) => c.advance(0));
    for (let i = 0; i < 25; i++) frame(clock, (c) => c.coast(20, false, 1));
    expect(clock.isMoving()).toBe(true);
    for (let i = 0; i < 5; i++) frame(clock, (c) => c.coast(20, true, 1));
    expect(frame(clock, (c) => c.coast(20, true, 1))).toBeCloseTo(20, 9);
  });

  it('counts the eased stop in whole physics steps, rounded up', () => {
    expect(easedStopSteps(350, 60)).toBe(11);
    expect(easedStopSteps(100, 60)).toBe(3);
  });

  it('refuses time running backward', () => {
    expect(() => new PlayClock({ stopMs: EASE, startMs: EASE }).advance(-1)).toThrow();
  });
});
