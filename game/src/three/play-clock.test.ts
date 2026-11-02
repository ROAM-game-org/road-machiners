import { describe, expect, it } from 'vitest';
import { easedStopMs, easedStopSteps, PlayClock } from './play-clock';

const EASE = 100;
const CLOCK = { stopMs: EASE, startMs: EASE, stopFolds: 3 };

function frame(clock: PlayClock, run: (c: PlayClock) => void): number {
  clock.beginFrame(false);
  run(clock);
  return clock.frameMs();
}

function running(): PlayClock {
  const clock = new PlayClock(CLOCK);
  frame(clock, (c) => c.coast(EASE, true, 1));
  return clock;
}

describe('PlayClock', () => {
  it('reports the hold it was given for each frame', () => {
    const clock = running();
    clock.beginFrame(true);
    expect(clock.isHeld()).toBe(true);
    clock.beginFrame(false);
    expect(clock.isHeld()).toBe(false);
  });

  it('follows real time exactly once up to speed, times the speed', () => {
    const clock = running();
    const from = clock.nowMs();
    expect(frame(clock, (c) => c.coast(16, true, 1))).toBeCloseTo(16, 9);
    expect(frame(clock, (c) => c.coast(16, true, 2))).toBeCloseTo(32, 9);
    expect(clock.nowMs() - from).toBeCloseTo(48, 9);
  });

  it('eases in from rest instead of jumping to full speed', () => {
    const clock = new PlayClock(CLOCK);
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
    expect(clock.nowMs() - from).toBeCloseTo(easedStopMs(CLOCK), 9);
  });

  it('stands still when no turn plays or is wanted', () => {
    const clock = new PlayClock(CLOCK);
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
    const clock = new PlayClock(CLOCK);
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
      expect(clock.nowMs() - from).toBeCloseTo(easedStopMs(CLOCK), 9);
      expect(clock.isMoving()).toBe(false);
    }
  });

  it('stops over its stop time and speeds up over its start time', () => {
    const clock = new PlayClock({ ...CLOCK, stopMs: 10 * EASE });
    frame(clock, (c) => c.coast(EASE, true, 1));
    for (let i = 0; i < 25; i++) frame(clock, (c) => c.coast(20, false, 1));
    expect(clock.isMoving()).toBe(true);
    for (let i = 0; i < 5; i++) frame(clock, (c) => c.coast(20, true, 1));
    expect(frame(clock, (c) => c.coast(20, true, 1))).toBeCloseTo(20, 9);
  });

  it('falls fast at first and fades out slowly, reaching rest exactly at the stop time', () => {
    const clock = new PlayClock({ ...CLOCK, stopMs: 2000 });
    frame(clock, (c) => c.coast(EASE, true, 1));
    const ms = Array.from({ length: 130 }, () => frame(clock, (c) => c.coast(16, false, 1)));
    const drops = ms.slice(1, 124).map((m, i) => ms[i] - m);
    drops.slice(1).forEach((d, i) => expect(d).toBeLessThan(drops[i]));
    const rest = ms.indexOf(0);
    expect(rest).toBeGreaterThanOrEqual(125);
    expect(rest).toBeLessThanOrEqual(126);
    ms.slice(rest).forEach((m) => expect(m).toBe(0));
    expect(clock.isMoving()).toBe(false);
  });

  it('counts the eased stop in whole physics steps, rounded up', () => {
    const played = (1 - Math.exp(-3)) / 3 - Math.exp(-3);
    expect(easedStopMs({ stopMs: 2000, stopFolds: 3 })).toBeCloseTo((2000 * played) / (1 - Math.exp(-3)), 9);
    expect(easedStopSteps({ stopMs: 2000, stopFolds: 3 }, 60)).toBe(Math.ceil((easedStopMs({ stopMs: 2000, stopFolds: 3 }) / 1000) * 60));
    expect(() => easedStopMs({ stopMs: 2000, stopFolds: 0 })).toThrow();
  });

  it('refuses time running backward', () => {
    expect(() => new PlayClock(CLOCK).coast(-EASE * 10, true, 1)).toThrow();
  });
});
