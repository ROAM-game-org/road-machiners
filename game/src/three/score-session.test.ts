import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { beatLoopSeconds, SOUNDS } from "../data/sounds";
import { nextRandom } from "../sim/rng";
import { checkStabs, ledgerText, parseScript, RecordingPlayer, renderMix, runScript, SCORE_CHECK, stabInputs, type Decoded, type Stereo } from "./score-sim";
import { ledgerCells, ScoreSession, type MixPlan } from "./score-session";

const RATE = 8000;
const STEP = 1 / 60;

function noise(length: number, seed: number): Float32Array {
  const state = { rngState: seed };
  return Float32Array.from({ length }, () => nextRandom(state) * 2 - 1);
}

function stabSource(file: string, seconds: number, peakAt: number): Decoded {
  const length = Math.round(seconds * RATE);
  const burst = noise(length, file.length);
  const shaped = burst.map((v, n) => v * Math.exp(-Math.abs(n / RATE - peakAt) * 6));
  return { rate: RATE, channels: [shaped] };
}

function syntheticFiles(): Map<string, Decoded> {
  const files = new Map<string, Decoded>();
  for (const [cue, def] of Object.entries(SOUNDS)) {
    for (const file of def.files) {
      if (cue.startsWith("accent-")) files.set(file, stabSource(file, 1.5, 0.2 + (file.length % 3) * 0.1));
      if (def.beat) files.set(file, loopSource(Math.round(beatLoopSeconds(def.beat) * RATE)));
    }
  }
  return files;
}

function loopSource(length: number): Decoded {
  return { rate: RATE, channels: [noise(length, 7), noise(length, 8)].map((c) => c.map((v) => v * 0.3)) };
}

function build(seed: number) {
  const score = { rngState: seed };
  const picks = { rngState: ~seed };
  const player = new RecordingPlayer(SOUNDS, syntheticFiles(), () => nextRandom(picks));
  const session = new ScoreSession({ player, durationOf: (f) => player.durationOf(f), roll: () => nextRandom(score), wallMs: () => player.now() * 1000 });
  return { player, session };
}

const SCRIPT = ["hit@7", "crit@8.5", "sighted@10", "hit@11", "crash@13", "miss@15"];

describe("the combat score session", () => {
  it("gives the lab's frame-by-frame path and the command's script runner the same ledger and mix plan", () => {
    const events = parseScript(SCRIPT);
    const command = build(3);
    runScript(command.session, command.player, events, { stepSeconds: STEP, lengthSeconds: 20 });

    const lab = build(3);
    lab.session.flipCombat();
    lab.session.frame();
    let next = 0;
    for (let i = 1; i <= Math.round(20 / STEP); i++) {
      lab.player.advanceTo(i * STEP);
      while (next < events.length && events[next].at <= i * STEP) lab.session.fire(events[next++].cue);
      lab.session.frame();
    }

    expect(ledgerText(lab.session)).toBe(ledgerText(command.session));
    expect(lab.session.mixPlan()).toEqual(command.session.mixPlan());
    expect(command.session.ledger().length).toBe(SCRIPT.length);
  });

  it("repeats a seed and changes with another", () => {
    const run = (seed: number) => {
      const { player, session } = build(seed);
      runScript(session, player, parseScript(SCRIPT), { stepSeconds: STEP, lengthSeconds: 20 });
      return session.ledger().map((row) => ledgerCells(row).join("|"));
    };
    expect(run(3)).toEqual(run(3));
    expect([4, 5, 6, 7].some((seed) => run(seed).join() !== run(3).join())).toBe(true);
  });

  it("ledger cells match the lab's columns", () => {
    const { player, session } = build(3);
    runScript(session, player, parseScript(["sighted@7"]), { stepSeconds: STEP, lengthSeconds: 12 });
    const [id, event, line, result, heat, tails, note] = ledgerCells(session.ledger()[0]);
    expect([id, event, line, result, heat, tails]).toEqual(["1", "Sighted", "lead", "played", "0.6", "0"]);
    expect(note).toMatch(/^starts \d\.\d\d s in$/);
  });

  it("plays every event with force on, with no duck", () => {
    const { player, session } = build(3);
    session.setForced(true);
    runScript(session, player, parseScript(["miss@7", "miss@7.2", "hit@7.4"]), { stepSeconds: STEP, lengthSeconds: 12 });
    expect(session.ledger().map((r) => r.result)).toEqual(["forced", "forced", "forced"]);
    expect([...session.traces.values()].every((t) => t.duck.length === 0)).toBe(true);
  });

  it("lands a stab on its event, one lead after the press", () => {
    const { player, session } = build(3);
    runScript(session, player, parseScript(["crit@7"]), { stepSeconds: STEP, lengthSeconds: 12 });
    const [stab] = stabInputs(session);
    expect(session.offers[0].at - 7).toBeCloseTo(session.leadMs / 1000, 1);
    expect(stab.start).toBeLessThan(session.offers[0].at);
  });

  it("keeps the lab free of the score engine", () => {
    const lab = readFileSync(new URL("./score-lab.ts", import.meta.url), "utf8");
    for (const engine of ["new CombatScore", "new SoundDirector", "new SoundLoops", "queueAccent", "playDueAccents", "setCombat"]) {
      expect(lab).not.toContain(engine);
    }
  });

  it("rejects a script event it cannot read", () => {
    expect(() => parseScript(["boom@1"])).toThrow(/Bad script event/);
    expect(() => parseScript(["hit@-1"])).toThrow(/Bad script event/);
    expect(() => parseScript(["hit"])).toThrow(/Bad script event/);
    expect(() => parseScript([])).toThrow(/needs events/);
  });
});

describe("the recording player", () => {
  it("drops a play beyond the cue's voice limit, as the real player does", () => {
    const { player } = build(1);
    const cue = SOUNDS["accent-hit"];
    const file = cue.files[0];
    for (let i = 0; i < 4; i++) player.play("accent-hit", { pan: 0, gain: 1 }, 0, { file, rate: 1 });
    expect(player.plays.map((p) => p.admitted)).toEqual([true, true, true, false]);
  });

  it("rejects a file the cue does not own", () => {
    const { player } = build(1);
    expect(() => player.play("accent-hit", { pan: 0, gain: 1 }, 0, { file: SOUNDS["accent-crit"].files[0], rate: 1 })).toThrow(/has no file/);
  });
});

function tone(seconds: number, hz: number): Float32Array {
  return Float32Array.from({ length: Math.round(seconds * RATE) }, (_, n) => Math.sin((2 * Math.PI * hz * n) / RATE));
}

function planWith(stabFile: string, duck: boolean): MixPlan {
  const base = SOUNDS["score-bass"].files[0];
  return {
    bases: [
      {
        id: "score-bass",
        file: base,
        volume: 1,
        when: 0,
        offset: 0,
        duration: 21,
        gain: [{ at: 0, target: 1, tc: 0 }],
        duck: duck ? [{ at: 5, target: 0.5, tc: 0 }] : [],
      },
    ],
    plays: [{ index: 0, cue: "accent-hit", file: stabFile, start: 5, from: 0, volume: 1, pan: 0, stab: true, owner: 1 }],
  };
}

function bandBase(hz: number): Decoded {
  return { rate: RATE, channels: [tone(21, hz), tone(21, hz)] };
}

describe("the mixed render and its check", () => {
  const stabFile = "stab.ogg";
  const sources = (stab: Decoded) => (file: string) => (file === stabFile ? stab : bandBase(700));
  const inputs = [{ id: 1, label: "Hit", start: 5, playIndex: 0, baseGain: 1 }];

  it("flags a stab that only adds low boom to a mid base, and passes a stab that adds mid and high", () => {
    const boom: Decoded = { rate: RATE, channels: [tone(1, 80)] };
    const bright: Decoded = { rate: RATE, channels: [Float32Array.from(tone(1, 700), (v, n) => v + Math.sin((2 * Math.PI * 3000 * n) / RATE)).map((v) => v * 3)] };
    const boomed = checkStabs(renderMix(planWith(stabFile, false), sources(boom), RATE, 8), inputs)[0];
    const bright3 = checkStabs(renderMix(planWith(stabFile, false), sources(bright), RATE, 8), inputs)[0];
    expect(boomed.masked).toBe(true);
    expect(boomed.contrast.low).toBeGreaterThan(SCORE_CHECK.maskedDb);
    expect(boomed.contrast.mid).toBeLessThan(SCORE_CHECK.maskedDb);
    expect(bright3.masked).toBe(false);
  });

  it("measures the duck: the base under a stab of silence drops by the duck level", () => {
    const quiet: Decoded = { rate: RATE, channels: [new Float32Array(RATE)] };
    const ducked = checkStabs(renderMix(planWith(stabFile, true), sources(quiet), RATE, 8), inputs)[0];
    expect(ducked.contrast.mid).toBeCloseTo(20 * Math.log10(0.5), 0);
  });

  it("flags a take that dies fast", () => {
    const click = new Float32Array(Math.round(0.1 * RATE)).fill(0.5);
    const rendered = renderMix(planWith(stabFile, false), sources({ rate: RATE, channels: [click] }), RATE, 8);
    expect(checkStabs(rendered, inputs)[0].short).toBe(true);
    const long = renderMix(planWith(stabFile, false), sources({ rate: RATE, channels: [tone(1, 700)] }), RATE, 8);
    expect(checkStabs(long, inputs)[0].short).toBe(false);
  });

  it("pans a mono stab by the Web Audio rule", () => {
    const plan = planWith(stabFile, false);
    plan.plays[0] = { ...plan.plays[0], pan: 1 };
    const rendered = renderMix(plan, sources({ rate: RATE, channels: [tone(1, 700)] }), RATE, 8);
    const stem = rendered.stems.get(0)!;
    const peak = (channel: Float32Array) => Math.max(...channel.map(Math.abs));
    expect(peak(stem.data[0])).toBeCloseTo(0, 5);
    expect(peak(stem.data[1])).toBeCloseTo(1, 2);
  });

  it("starts the base at its phase and loops it", () => {
    const base = SOUNDS["score-bass"].files[0];
    const ramp: Decoded = { rate: RATE, channels: [Float32Array.from({ length: 100 }, (_, n) => n / 100)] };
    const plan: MixPlan = { bases: [{ id: "score-bass", file: base, volume: 1, when: 0.01, offset: 0.005, duration: 0.0125, gain: [{ at: 0, target: 1, tc: 0 }], duck: [] }], plays: [] };
    const mix: Stereo = renderMix(plan, () => ramp, RATE, 0.1).base;
    const start = Math.round(0.01 * RATE);
    expect(mix[0][start - 1]).toBe(0);
    expect(mix[0][start]).toBeCloseTo(40 / 100 * Math.SQRT1_2, 4);
    expect(mix[0][start + 60]).toBeCloseTo(0, 4);
  });
});
