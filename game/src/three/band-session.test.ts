import { describe, expect, it } from "vitest";
import { BAND, BAND_ANSWERS, type BandEvent } from "../data/sounds";
import { ANSWER_SLOTS_PER_BEAT, BAND_STEMS, BandSession, BARS_PER_LOOP } from "./band-session";

const BAR_SECONDS = 1.6;
const STEP = 1 / 60;

function fight(events: [BandEvent, number][], seconds: number) {
  let now = 0;
  let seed = 7;
  const roll = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const session = new BandSession({ now: () => now, roll, barSeconds: BAR_SECONDS });
  session.tick();
  let next = 0;
  for (; now < seconds; now += STEP) {
    for (; next < events.length && events[next][1] <= now; next++) session.fire(events[next][0]);
    session.tick();
  }
  return session;
}

const turn = (t: number): [BandEvent, number][] => Array.from({ length: 12 }, (_, i) => ["accent-struck", t + i * 0.1]);
const hotTurns = [2, 10, 18, 26].flatMap(turn);

function changeOf(session: BandSession, part: string, on: boolean) {
  return session.plans.find((p) => p.changes.some((c) => c.part === part && c.on === on));
}

describe("BandSession", () => {
  it("gives the same plans, presses and plays for the same fight", () => {
    const a = fight(hotTurns, 60);
    const b = fight(hotTurns, 60);
    expect(b.plans).toEqual(a.plans);
    expect(b.presses).toEqual(a.presses);
    expect(b.plays).toEqual(a.plays);
  });

  it("starts with drums alone and changes parts only on phrase starts, fading in before the bar line", () => {
    const s = fight(hotTurns, 60);
    expect(s.plans[0].sounding).toEqual(["drums"]);
    expect(s.plans.filter((p) => p.changes.length > 0).every((p) => p.bar % BAND.phraseBars === 0)).toBe(true);
    const bassIn = changeOf(s, "bass", true)!;
    expect(s.moves.bass[0].at).toBeCloseTo(bassIn.start - s.beat);
    expect(s.levelOf("bass", bassIn.start)).toBeGreaterThan(0.9);
  });

  it("thins the band again in the quiet after one hot turn, with a ring-out instead of a stop", () => {
    const s = fight(turn(2), 20);
    const wallOut = changeOf(s, "wall", false)!;
    expect(wallOut.start).toBeLessThan(14);
    expect(s.levelOf("wall", wallOut.start + s.beat)).toBeGreaterThan(0.3);
    expect(s.levelOf("wall", wallOut.start + 4 * s.beat)).toBeLessThan(0.05);
  });

  it("starts keys phrases only on the loop bar they were written for", () => {
    const s = fight(hotTurns, 80);
    const phrases = s.plays.filter((p) => p.seconds === null);
    expect(phrases.length).toBeGreaterThan(0);
    for (const p of phrases) expect(Math.round((p.at - s.start) / BAR_SECONDS) % BARS_PER_LOOP).toBe(4);
  });

  it("answers an event from its parts' own loops on the next eighth after it lands, at the matching loop spot", () => {
    const s = fight([["accent-hit", 3.03]], 6);
    const press = s.presses[0];
    const slot = s.beat / ANSWER_SLOTS_PER_BEAT;
    expect(press.answers.map((a) => a.part)).toEqual(BAND_ANSWERS["accent-hit"].parts);
    const answer = press.answers[0];
    expect(answer.at - press.lands).toBeGreaterThanOrEqual(-slot / 2);
    expect(answer.at - press.lands).toBeLessThan(slot);
    expect(((answer.at - s.start) / slot) % 1).toBeCloseTo(0);
    expect(answer.from).toBeCloseTo((answer.at - s.start) % (BAR_SECONDS * BARS_PER_LOOP));
    expect(answer.file).toBe(BAND_STEMS.wall.kind === "loop" ? BAND_STEMS.wall.file : "");
  });

  it("lets a burst of events play one answer per part at a time", () => {
    const s = fight(turn(2), 6);
    expect(s.presses).toHaveLength(12);
    const answers = s.presses.flatMap((p) => p.answers);
    expect(answers.length).toBeGreaterThan(1);
    expect(answers.length).toBeLessThan(2 * 12);
    for (const a of answers) for (const b of answers) if (a !== b && a.part === b.part) expect(Math.abs(a.at - b.at)).toBeGreaterThanOrEqual(a.seconds! - 1e-9);
  });
});
