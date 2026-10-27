import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../../config";
import { PHYSICS } from "../../data/physics";
import { TRAVEL_SPEED_CODES } from "../travel-speed";
import { gapMsOf, SimSpeed } from "./panels";

const TURN_MS = PHYSICS.turnSeconds * 1000;

function sim() {
  const gaps: number[] = [];
  return { speed: new SimSpeed((gap) => gaps.push(gap)), gaps };
}

describe("sim speed", () => {
  it("maps each travel speed to a gap of the normal turn length divided by the multiple", () => {
    expect(CONFIG.travelSpeeds.map(gapMsOf)).toEqual(CONFIG.travelSpeeds.map((n) => TURN_MS / n));
    expect(gapMsOf(1)).toBe(TURN_MS);
  });

  it("steps by the bracket keys, sends the new gap at once and stops at both ends", () => {
    const { speed, gaps } = sim();
    const press = (code: string) => speed.step(TRAVEL_SPEED_CODES[code]!);
    for (let i = 0; i < CONFIG.travelSpeeds.length + 1; i++) press("BracketLeft");
    expect(speed.index()).toBe(0);
    press("BracketRight");
    expect(speed.speed()).toBe(CONFIG.travelSpeeds[1]);
    for (let i = 0; i < CONFIG.travelSpeeds.length + 1; i++) press("BracketRight");
    expect(speed.index()).toBe(CONFIG.travelSpeeds.length - 1);
    expect(gaps.at(-1)).toBe(gapMsOf(CONFIG.travelSpeeds.at(-1)!));
    const sent = gaps.length;
    press("BracketRight");
    expect(gaps).toHaveLength(sent);
  });

  it("shows no playing speed while paused", () => {
    const { speed } = sim();
    expect(speed.playing()).toBeNull();
  });

  it("shows the pick while the frames keep up", () => {
    const { speed } = sim();
    speed.step(1);
    speed.run(true);
    const picked = speed.speed();
    for (let turn = 0; turn < 20; turn++) speed.frame(turn, (turn * TURN_MS) / picked);
    expect(speed.playing()).toBe(picked);
  });

  it("shows the speed actually playing when the frames come slower than the pick", () => {
    const { speed } = sim();
    speed.step(1);
    speed.step(1);
    speed.step(1);
    speed.run(true);
    const real = 10;
    for (let turn = 0; turn < 60; turn++) speed.frame(turn, (turn * TURN_MS) / real);
    expect(speed.playing()).toBe(real);
  });

  it("forgets the measure when the pick changes", () => {
    const { speed } = sim();
    speed.run(true);
    for (let turn = 0; turn < 20; turn++) speed.frame(turn, turn * TURN_MS * 4);
    expect(speed.playing()).toBeLessThan(speed.speed());
    speed.step(1);
    expect(speed.playing()).toBe(speed.speed());
  });
});

describe("the run clock follows a speed change at once", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a faster gap while waiting fires the next turn without finishing the old wait", async () => {
    const { SimRun } = await import("../../sim/progression/sim-mode");
    const turns: number[] = [];
    const run = Object.create(SimRun.prototype) as InstanceType<typeof SimRun>;
    Object.assign(run, { playing: true, over: false, gapMs: TURN_MS, timer: null, lastTurnStart: performance.now(), stepOnce: () => turns.push(performance.now()) });
    (run as unknown as { schedule(): void }).schedule();
    vi.advanceTimersByTime(100);
    expect(turns).toHaveLength(0);
    run.handle({ kind: "speed", gapMs: TURN_MS / 64 });
    vi.advanceTimersByTime(1);
    expect(turns).toHaveLength(1);
  });
});
