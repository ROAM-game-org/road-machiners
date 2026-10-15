import { describe, expect, it } from "vitest";
import { BAND } from "../data/sounds";
import { BandSession, BARS_PER_LOOP, BEATS_PER_BAR } from "./band-session";

const BAR_SECONDS = 1.6;
const STEP = 1 / 60;

function fight(shotsAt: number[], seconds: number) {
  let now = 0;
  let seed = 7;
  const roll = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const session = new BandSession({ now: () => now, take: (cue) => ({ file: `${cue}-1.ogg`, peak: 0.1 }), roll, barSeconds: BAR_SECONDS }, 0.5);
  const ticks = [session.tick()];
  let next = 0;
  for (; now < seconds; now += STEP) {
    for (; next < shotsAt.length && shotsAt[next] <= now; next++) session.fire("accent-struck");
    ticks.push(session.tick());
  }
  return { session, ticks };
}

const hotTurns = [2, 10, 18, 26].flatMap((t) => Array.from({ length: 12 }, (_, i) => t + i * 0.1));

describe("BandSession", () => {
  it("gives the same plans, presses and phrases for the same fight", () => {
    const a = fight(hotTurns, 60).session;
    const b = fight(hotTurns, 60).session;
    expect(b.plans).toEqual(a.plans);
    expect(b.presses).toEqual(a.presses);
    expect(b.phrases).toEqual(a.phrases);
  });

  it("changes parts only on phrase starts and fades a loop part in before the bar line", () => {
    const { session } = fight(hotTurns, 60);
    const changed = session.plans.filter((p) => p.changes.length > 0);
    expect(changed.every((p) => p.bar % BAND.phraseBars === 0)).toBe(true);
    const wallIn = changed.find((p) => p.changes.some((c) => c.part === "wall" && c.on))!;
    expect(session.moves.wall[0].at).toBeCloseTo(wallIn.start - session.beat);
    expect(session.levelOf("wall", wallIn.start)).toBeGreaterThan(0.9);
  });

  it("lets a leaving loop part ring out over beats instead of stopping", () => {
    const { session } = fight(hotTurns.slice(0, 12), 70);
    const out = session.plans.find((p) => p.changes.some((c) => c.part === "wall" && !c.on))!;
    expect(session.levelOf("wall", out.start + session.beat)).toBeGreaterThan(0.3);
    expect(session.levelOf("wall", out.start + 4 * session.beat)).toBeLessThan(0.05);
  });

  it("starts keys phrases only on the loop bar they were written for, and never loops them", () => {
    const { session } = fight(hotTurns, 80);
    expect(session.phrases.length).toBeGreaterThan(0);
    for (const p of session.phrases) expect(Math.round((p.at - session.start) / BAR_SECONDS) % BARS_PER_LOOP).toBe(4);
    const keysOut = session.plans.find((p) => p.changes.some((c) => c.part === "keys" && !c.on))!;
    expect(session.phrases.every((p) => p.at < keysOut.start)).toBe(true);
  });

  it("plays far fewer stabs than events in a dense turn", () => {
    const { session } = fight(hotTurns.slice(0, 12), 8);
    expect(session.presses).toHaveLength(12);
    expect(session.presses.filter((p) => p.stab).length).toBeLessThanOrEqual(BEATS_PER_BAR);
  });
});
