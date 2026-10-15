import { describe, expect, it } from "vitest";
import { BlockSequencer, blocksOf, Fading, SoundDesigner, type AccentPlan, type ArcTuning, type DesignerTuning, type Section } from "./designer";

const GRID = { start: 0, beat: 1, beatsPerBar: 4 };
const TUNING: DesignerTuning = {
  subdivision: 2,
  humanizeMs: 0,
  gainJitter: 0,
  hotHeat: 5,
  pauseRepeats: 2,
  fillChance: 0,
  fillGain: 0.5,
  secondaryPan: 0.3,
  busyFactor: 0,
  stabGapSeconds: 0.3,
  lines: {
    lead: { gain: 1, duck: 0.6, calm: ["x...x..."], hot: ["xxxxxxxx"] },
    secondary: { gain: 0.5, duck: 0.75, calm: ["..x....."], hot: ["..x.x.x."] },
  },
};
const LEAD: AccentPlan = { line: "lead", weight: 0.5, bars: 1, chance: 1 };
const LIGHT: AccentPlan = { line: "secondary", weight: 0.2, bars: 1, chance: 1 };

function designer(tuning = TUNING, roll = () => 0): SoundDesigner {
  return new SoundDesigner(GRID, tuning, roll, 0.1);
}

const times = (hits: { time: number }[]) => hits.map((h) => h.time);

describe("SoundDesigner", () => {
  it("plays the stab so the sound's peak lands on the event", () => {
    const o = designer().offer("a", LEAD, 5.2, 0.15, 0);
    expect(o.result).toBe("played");
    expect(o.stab!.time).toBeCloseTo(5.05);
    expect(o.stab!.pan).toBe(0);
  });

  it("follows the stab with the rhythm's tail from the slot nearest the event", () => {
    const d = designer();
    d.offer("a", LEAD, 5.2, 0.1, 0);
    expect(times(d.step(0.1, 9.9, false, 0))).toEqual([7]);
  });

  it("plays the secondary quieter and to one side", () => {
    const d = designer();
    const o = d.offer("b", LIGHT, 5, 0, 0);
    expect([o.stab!.pan, o.stab!.gain]).toEqual([-0.3, 0.5]);
    expect(d.step(0.1, 9.9, false, 0).map((h) => [h.time, h.pan])).toEqual([[6, -0.3]]);
  });

  it("replaces a line's tail with the newest event's", () => {
    const d = designer();
    d.offer("a", LEAD, 5, 0, 0);
    d.offer("c", LEAD, 6, 0, 0);
    expect(d.step(0.1, 9.9, false, 0).map((h) => `${h.cue}@${h.time}`)).toEqual(["c@8"]);
  });

  it("gives a repeat of the playing accent a dense tail", () => {
    const d = designer();
    d.offer("a", LEAD, 5, 0, 0);
    d.offer("a", LEAD, 6, 0, 0);
    expect(times(d.step(0.1, 9.9, false, 0))).toEqual([6.5, 7, 7.5, 8, 8.5, 9, 9.5]);
  });

  it("takes dense tails once the fight is hot", () => {
    const d = designer();
    d.offer("a", LEAD, 5, 0, 5);
    expect(d.step(0.1, 9.9, false, 0)).toHaveLength(7);
  });

  it("drops a stab too close to the last one on its line", () => {
    const d = designer();
    d.offer("a", LEAD, 5, 0, 0);
    expect(d.offer("c", LEAD, 5.2, 0, 0)).toEqual({ result: "crowded", stab: null });
    expect(d.offer("b", LIGHT, 5.1, 0, 0).result).toBe("played");
  });

  it("lets a light event sound by chance, lower while its line plays a tail", () => {
    const d = designer({ ...TUNING, busyFactor: 1 }, () => 0.5);
    expect(d.offer("b", { ...LIGHT, chance: 0.6 }, 5, 0, 0).result).toBe("played");
    expect(d.offer("c", { ...LIGHT, chance: 0.6 }, 6, 0, 0).result).toBe("skipped");
  });

  it("always plays a lead event", () => {
    const d = designer({ ...TUNING, busyFactor: 10 }, () => 0.99);
    d.offer("a", LEAD, 5, 0, 0);
    expect(d.offer("c", LEAD, 6, 0, 0).result).toBe("played");
  });

  it("repeats the last lead phrase from bar lines pauseRepeats times in a pause, then rests", () => {
    const d = designer();
    d.offer("a", LEAD, 1, 0, 0);
    expect(times(d.step(0.1, 30, true, 0))).toEqual([3, 8, 10, 12, 14]);
  });

  it("rests after a tail when not paused", () => {
    const d = designer();
    d.offer("a", LEAD, 1, 0, 0);
    expect(times(d.step(0.1, 30, false, 0))).toEqual([3]);
  });

  it("adds a fill on the last slot of a lead tail by chance", () => {
    const d = designer({ ...TUNING, fillChance: 1 });
    d.offer("a", LEAD, 4, 0, 0);
    const hits = d.step(0.1, 7.9, false, 0);
    expect(times(hits)).toEqual([6, 7.5]);
    expect(hits[1].gain).toBe(0.5);
  });

  it("fails loud on a rhythm of the wrong length", () => {
    const bad = { ...TUNING, lines: { ...TUNING.lines, lead: { ...TUNING.lines.lead, calm: ["x..."] } } };
    expect(() => designer(bad)).toThrow("Bad lead rhythm");
  });
});

describe("Fading", () => {
  it("halves every half-life and adds on top", () => {
    const f = new Fading(2);
    f.add(0, 4);
    expect(f.read(2)).toBeCloseTo(2);
    f.add(4, 1);
    expect(f.read(4)).toBeCloseTo(2);
  });
});

const SECTIONS: Section[] = [
  { role: "intro", from: 5, bars: 4 },
  { role: "verse", from: 9, bars: 12 },
  { role: "wall", from: 21, bars: 16 },
  { role: "stop", from: 37, bars: 4 },
  { role: "verse", from: 41, bars: 8 },
  { role: "wall", from: 49, bars: 20 },
];
const ARC: ArcTuning = {
  blockBars: 4,
  hotHeat: 2,
  coolHeat: 1,
  memoryHalfLifeBars: 16,
  memoryWeight: 0.08,
  stay: 3,
  next: { intro: { verse: 3, wall: 1 }, verse: { verse: 4, wall: 3, stop: 1 }, wall: { wall: 4, verse: 2, stop: 1 }, stop: { verse: 2, wall: 2 }, solo: { wall: 1 } },
  hot: { intro: 1, verse: 0.4, wall: 3, stop: 0.7, solo: 1 },
  calm: { intro: 1, verse: 2, wall: 0.3, stop: 0.3, solo: 1 },
};

function sequencer(roll = () => 0) {
  return new BlockSequencer(blocksOf(SECTIONS, 4), ARC, roll);
}

function chanceOf(seq: BlockSequencer, role: string): number {
  return seq.choices.filter((c) => c.role === role).reduce((sum, c) => sum + c.chance, 0);
}

describe("BlockSequencer", () => {
  it("starts on the intro and plays it to its end", () => {
    const seq = sequencer();
    expect(seq.next(5).bar).toBe(5);
  });

  it("stays in the verse when the fight is calm", () => {
    const seq = sequencer();
    seq.next(0);
    expect(seq.next(0).role).toBe("verse");
    seq.next(0);
    expect(seq.choices[0]).toMatchObject({ role: "verse", from: 9 });
    expect(chanceOf(seq, "wall")).toBeLessThan(0.15);
  });

  it("leans to the wall when the fight is hot", () => {
    const seq = sequencer();
    seq.next(0);
    seq.next(0);
    seq.next(5);
    expect(chanceOf(seq, "wall")).toBeGreaterThan(0.6);
  });

  it("only offers the moves the table allows from the current section", () => {
    const seq = sequencer();
    seq.next(0);
    seq.next(0);
    expect(new Set(seq.choices.map((c) => c.role))).toEqual(new Set(["verse", "wall"]));
    seq.next(0);
    expect(new Set(seq.choices.map((c) => c.role))).toEqual(new Set(["verse", "wall", "stop"]));
  });

  it("makes staying less likely the longer a section loops", () => {
    const seq = sequencer(() => 0);
    seq.next(0);
    seq.next(0);
    seq.next(0);
    const early = seq.choices.find((c) => c.from === 9)!.chance;
    for (let i = 0; i < 6; i++) seq.next(0);
    const late = seq.choices.find((c) => c.from === 9)!.chance;
    expect(late).toBeLessThan(early);
  });

  it("plays a stop to the end of its section before choosing again", () => {
    const blocks = blocksOf([{ role: "intro", from: 1, bars: 2 }, { role: "stop", from: 3, bars: 4 }, { role: "verse", from: 7, bars: 2 }], 2);
    const seq = new BlockSequencer(blocks, { ...ARC, blockBars: 2, next: { ...ARC.next, intro: { stop: 1 } } }, () => 0);
    expect([0, 0, 0, 0].map((h) => seq.next(h).bar)).toEqual([1, 3, 5, 7]);
  });

  it("refuses a section that does not split into blocks", () => {
    expect(() => blocksOf([{ role: "verse", from: 1, bars: 6 }], 4)).toThrow(/multiple of 4/);
  });
});
