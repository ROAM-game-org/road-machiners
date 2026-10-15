import { describe, expect, it } from "vitest";
import { JAM, JAM_ANSWERS, JAM_MIX, JAM_PARTS, SCORE_BLOCKS, type BandEvent } from "../data/sounds";
import { JamSession, takeLevel, type JamSong, type JamSwitches, type Take } from "./jam-session";

const BAR_SECONDS = 1.6;
const BARS = 120;
const STEP = 1 / 60;

const SONG: JamSong = {
  parts: { drums: "drums.wav", bass: "bass.wav", guitar: "guitar.wav" },
  cymbals: { file: "cymbals.wav", from: 21 },
  bpm: 150,
  length: BARS * BAR_SECONDS,
  barTimes: Array.from({ length: BARS + 1 }, (_, i) => i * BAR_SECONDS),
  barPower: Array.from({ length: BARS }, () => ({ ss: 1, gg: 0.1, sg: 0.1 })),
  sections: [
    { role: "intro", from: 5, bars: 4 },
    { role: "verse", from: 9, bars: 12 },
    { role: "wall", from: 21, bars: 16 },
    { role: "stop", from: 37, bars: 4 },
    { role: "wall", from: 41, bars: 40 },
  ],
  end: 81,
};

type Played = { plays: Take[]; ends: Take[] };

function fight(events: [BandEvent, number][], seconds: number, switches: Partial<JamSwitches> = {}) {
  let seed = 7;
  const roll = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const heard: Played = { plays: [], ends: [] };
  const out = { play: (t: Take) => heard.plays.push(t), end: (t: Take) => heard.ends.push(t), move: () => {}, duck: () => {} };
  const session = new JamSession(SONG, out, roll, { parts: "band", answers: "band", jumps: "ring", ...switches });
  session.start(0);
  let next = 0;
  for (let now = 0; now < seconds; now += STEP) {
    for (; next < events.length && events[next][1] <= now; next++) session.fire(events[next][0], now);
    session.tick(now);
  }
  return { session, heard };
}

const turn = (t: number): [BandEvent, number][] => [
  ["accent-hit", t],
  ["accent-hit", t + 0.05],
  ["accent-miss", t + 0.1],
  ["accent-crit", t + 0.15],
  ["accent-struck", t + 0.6],
];

describe("JamSession", () => {
  it("keeps drums and bass in from the first bar and brings the guitar in after a sighting, on a phrase line", () => {
    const quiet = fight([], 10).session;
    expect(quiet.levelOf("drums", 0.2)).toBeGreaterThan(0.9);
    expect(quiet.levelOf("bass", 0.2)).toBeGreaterThan(0.9);
    expect(quiet.levelOf("guitar", 9)).toBe(0);
    const s = fight([["accent-sighted", 0.5]], 10).session;
    const guitarIn = s.plans.find((p) => p.changes.some((c) => c.part === "guitar" && c.on))!;
    expect(guitarIn.bar % JAM.phraseBars).toBe(0);
    expect(s.levelOf("guitar", guitarIn.start)).toBeGreaterThan(0.9);
  });

  it("plays every part from the first bar when parts are all", () => {
    const s = fight([], 6, { parts: "all" }).session;
    for (const part of JAM_PARTS) expect(s.levelOf(part, 0.2)).toBeGreaterThan(0.9);
  });

  it("answers an event on the next eighth with its parts, cut from the block playing at that spot", () => {
    const s = fight([["accent-hit", 3]], 6).session;
    const press = s.presses[0];
    const eighth = s.beat / JAM_MIX.answerSlotsPerBeat;
    expect(press.slot!).toBeGreaterThanOrEqual(press.at - 1e-9);
    expect(press.slot! - press.at).toBeLessThan(eighth);
    expect(press.answers.map((a) => a.part)).toEqual(JAM_ANSWERS["accent-hit"].parts);
    const answer = press.answers[0];
    const block = s.playingAt(answer.at)!;
    expect(answer.from).toBeCloseTo(SONG.barTimes[block.bar - 1] + answer.at - block.start);
  });

  it("lets a part answer one event at a time, and a heavier event takes it over", () => {
    const s = fight(turn(3), 8).session;
    const [first, second, , crit] = s.presses;
    expect(first.answers).toHaveLength(1);
    expect(second.crowded).toEqual(["guitar"]);
    expect(crit.cut.map((t) => t.part)).toContain("guitar");
    const cutShort = crit.cut.find((t) => t.part === "guitar")!;
    expect(cutShort.until).toBeCloseTo(crit.slot!);
  });

  it("lifts a part that is already in only up to the accent level", () => {
    const s = fight([["accent-hit", 3]], 6, { parts: "all" }).session;
    const answer = s.presses[0].answers[0];
    const block = s.playingAt(answer.at)!;
    expect(answer.gain).toBeCloseTo((JAM_MIX.accent - 1) * SCORE_BLOCKS.songGain * block.level);
  });

  it("rings out bass and guitar on a jump but fades the drums, and fades all of them when jumps fade", () => {
    const hot = [0, 4, 8, 12, 16, 20].flatMap(turn);
    const ring = fight(hot, 30, { parts: "all" });
    const jump = ring.session.blocks.played.find((p) => p.join === "jump")!;
    const ended = ring.heard.ends.filter((t) => t.kind === "block" && Math.abs(t.until - jump.start) < 1e-6);
    expect(ended.filter((t) => t.ring !== null).map((t) => t.part).sort()).toEqual(["bass", "guitar"]);
    expect(ended.find((t) => t.part === "drums")!.ring).toBeNull();
    const fade = fight(hot, 30, { parts: "all", jumps: "fade" });
    expect(fade.heard.ends.filter((t) => t.kind === "block").every((t) => t.ring === null)).toBe(true);
  });

  it("keeps the block score's cymbal lane and guitar lean, and plays no band answers when they are off", () => {
    const { session } = fight(turn(3), 12, { answers: "off" });
    expect(session.presses.every((p) => p.answers.length === 0)).toBe(true);
    expect(session.takes.some((t) => t.kind === "cymbal")).toBe(true);
    expect(session.takes.some((t) => t.kind === "push")).toBe(true);
    const lean = session.blocks.overlays.filter((o) => o.lane === "guitars").at(-1)!;
    expect(session.duckAt((lean.from + lean.to) / 2)).toBeLessThan(1);
    expect(session.duckAt(lean.to + 0.1)).toBeCloseTo(1);
  });

  it("shapes a take with a rise around its start and a ring after its end", () => {
    const take: Take = { kind: "answer", part: "bass", cue: "accent-miss", from: 0, at: 1, fadeIn: 0.01, until: 2, endFade: 0, ring: 0.1, gain: 2 };
    expect(takeLevel(take, 0.98)).toBe(0);
    expect(takeLevel(take, 1)).toBeCloseTo(1);
    expect(takeLevel(take, 1.5)).toBe(2);
    expect(takeLevel(take, 2.1)).toBeCloseTo(2 * Math.exp(-1));
  });
});
