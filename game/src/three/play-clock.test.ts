import { describe, expect, it } from 'vitest';
import { easedStopMs, easedStopSteps, PlayClock } from './play-clock';

const EASE = 100;

function frame(clock: PlayClock, run: (c: PlayClock) => void): number {
  clock.beginFrame();
  run(clock);
  return clock.frameMs();
}

function running(): PlayClock {
  const clock = new PlayClock({ stopMs: EASE, startMs: EASE });
  frame(clock, (c) => c.coast(EASE, true, 1));
  return clock;
}

describe('PlayClock', () => {
  it('follows real time exactly once up to speed, times the speed', () => {
    const clock = running();
    const from = clock.nowMs();
    expect(frame(clock, (c) => c.coast(16, true, 1))).toBeCloseTo(16, 9);
    expect(frame(clock, (c) => c.coast(16, true, 2))).toBeCloseTo(32, 9);
    expect(clock.nowMs() - from).toBeCloseTo(48, 9);
  });

  it('eases in from rest instead of jumping to full speed', () => {
    const clock = new PlayClock({ stopMs: EASE, startMs: EASE });
    const ms = [1, 2, 3, 4].map(() => frame(clock, (c) => c.coast(20, true, 1)));
    expect(ms[0]).toBeLessThan(ms[1]);
    expect(ms[0]).toBeCloseTo(2, 9);
  });

  it('stops within the play time it is given, ending at rest exactly there', () => {
    for (const budget of [0, 40, 133.4]) {
      const clock = running();
      const from = clock.nowMs();
      clock.stopWithin(budget);
      for (let i = 0; i < 100; i++) frame(clock, (c) => c.coast(16.7, false, 1));
      expect(clock.nowMs() - from).toBeCloseTo(budget, 9);
      expect(clock.isMoving()).toBe(false);
    }
    expect(() => running().stopWithin(-1)).toThrow();
  });

  it('goes back to its own stop time after a stop within a budget', () => {
    const clock = running();
    clock.stopWithin(10);
    for (let i = 0; i < 100; i++) frame(clock, (c) => c.coast(16.7, false, 1));
    for (let i = 0; i < 100; i++) frame(clock, (c) => c.coast(16.7, true, 1));
    const from = clock.nowMs();
    for (let i = 0; i < 100; i++) frame(clock, (c) => c.coast(16.7, false, 1));
    expect(clock.nowMs() - from).toBeCloseTo(easedStopMs(EASE), 9);
  });

  it('stands still when no turn plays or is wanted', () => {
    const clock = new PlayClock({ stopMs: EASE, startMs: EASE });
    expect(frame(clock, (c) => c.coast(16, false, 1))).toBe(0);
    expect(clock.nowMs()).toBe(0);
  });

  it('slows to a stop after a turn instead of halting', () => {
    const clock = running();
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
      const clock = running();
      const from = clock.nowMs();
      for (let i = 0; i < 100; i++) frame(clock, (c) => c.coast(dt, false, 1));
      expect(clock.nowMs() - from).toBeCloseTo(easedStopMs(EASE), 9);
      expect(clock.isMoving()).toBe(false);
    }
  });

  it('stops over its stop time and speeds up over its start time', () => {
    const clock = new PlayClock({ stopMs: 10 * EASE, startMs: EASE });
    frame(clock, (c) => c.coast(EASE, true, 1));
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
    expect(() => new PlayClock({ stopMs: EASE, startMs: EASE }).coast(-EASE * 10, true, 1)).toThrow();
  });
});
