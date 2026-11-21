import { describe, expect, it } from "vitest";
import { MusicPace } from "./music-pace";

const times = { spellSeconds: 100, restSeconds: 50, restJitterSeconds: 10 };

describe("MusicPace", () => {
  it("starts a spell for a new holder and rests when it ends", () => {
    const pace = new MusicPace(times, () => 0.5);
    pace.advance("calm", 0);
    pace.advance("calm", 99);
    expect(pace.resting).toBe(false);
    pace.advance("calm", 100);
    expect(pace.resting).toBe(true);
  });

  it("rests for the base time plus or minus the jitter", () => {
    const restEnd = (random: number) => {
      const pace = new MusicPace(times, () => random);
      pace.advance("calm", 0);
      pace.advance("calm", 100);
      for (let t = 100; t < 200; t += 0.5) {
        pace.advance("calm", t);
        if (!pace.resting) return t;
      }
      return Infinity;
    };
    expect(restEnd(0)).toBe(100 + 40);
    expect(restEnd(1)).toBe(100 + 60);
  });

  it("starts a new spell when a rest ends", () => {
    const pace = new MusicPace(times, () => 0.5);
    pace.advance("calm", 0);
    pace.advance("calm", 100);
    pace.advance("calm", 150);
    expect(pace.resting).toBe(false);
    pace.advance("calm", 249);
    expect(pace.resting).toBe(false);
    pace.advance("calm", 250);
    expect(pace.resting).toBe(true);
  });

  it("starts a spell at once when the holder changes during a rest", () => {
    const pace = new MusicPace(times, () => 0.5);
    pace.advance("calm", 0);
    pace.advance("calm", 100);
    pace.advance("town", 110);
    expect(pace.resting).toBe(false);
  });

  it("goes idle with no holder and the next holder starts a spell", () => {
    const pace = new MusicPace(times, () => 0.5);
    pace.advance("calm", 0);
    pace.advance("calm", 100);
    pace.advance(null, 110);
    expect(pace.resting).toBe(false);
    pace.advance("calm", 120);
    expect(pace.resting).toBe(false);
    pace.advance("calm", 219);
    expect(pace.resting).toBe(false);
  });

  it("wake ends a rest and restarts a running spell", () => {
    const pace = new MusicPace(times, () => 0.5);
    pace.advance("calm", 0);
    pace.advance("calm", 100);
    pace.wake(110);
    expect(pace.resting).toBe(false);
    pace.advance("calm", 209);
    expect(pace.resting).toBe(false);
    pace.advance("calm", 210);
    expect(pace.resting).toBe(true);

    const early = new MusicPace(times, () => 0.5);
    early.advance("calm", 0);
    early.wake(90);
    early.advance("calm", 100);
    expect(early.resting).toBe(false);
  });

  it("refuses to wake with no holder", () => {
    expect(() => new MusicPace(times, () => 0.5).wake(0)).toThrow();
  });

  it("makes one change after a long gap", () => {
    const pace = new MusicPace(times, () => 0.5);
    pace.advance("calm", 0);
    pace.advance("calm", 3600);
    expect(pace.resting).toBe(true);
    pace.advance("calm", 3601);
    expect(pace.resting).toBe(true);
  });

  it("throws on a clock that is not finite or runs backwards, and keeps its state", () => {
    const pace = new MusicPace(times, () => 0.5);
    pace.advance("calm", 10);
    expect(() => pace.advance("calm", NaN)).toThrow();
    expect(() => pace.advance("calm", Infinity)).toThrow();
    expect(() => pace.advance("calm", 5)).toThrow();
    pace.advance("calm", 110);
    expect(pace.resting).toBe(true);
  });
});
