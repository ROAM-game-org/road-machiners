import { describe, expect, it } from "vitest";
import { BlockSequencer, blocksOf, Fading, type ArcTuning, type Seams, type Section } from "./designer";

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
  phraseBars: 4,
  next: { intro: { verse: 3, wall: 1 }, verse: { verse: 4, wall: 3, stop: 1 }, wall: { wall: 4, verse: 2, stop: 1 }, stop: { verse: 2, wall: 2 }, solo: { wall: 1 } },
  after: {},
  hot: { intro: 1, verse: 0.4, wall: 3, stop: 0.7, solo: 1 },
  calm: { intro: 1, verse: 2, wall: 0.3, stop: 0.3, solo: 1 },
  seamDb: 10,
};

function seamsOf(sections: Section[], db: (exit: number, target: number) => number = () => 0): Seams {
  const seams: Seams = {};
  for (const s of sections)
    for (let exit = s.from + 1; exit <= s.from + s.bars; exit++) seams[exit] = Object.fromEntries(sections.map((t) => [t.from, db(exit, t.from)]));
  return seams;
}

function sequencer(roll = () => 0) {
  return new BlockSequencer(blocksOf(SECTIONS, 4), ARC, seamsOf(SECTIONS), roll);
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

  it("scales the moves by the two sections before, not only the current one", () => {
    const seq = new BlockSequencer(blocksOf(SECTIONS, 4), { ...ARC, after: { "intro>verse": { stop: 0, wall: 2 } } }, seamsOf(SECTIONS), () => 0);
    seq.next(0);
    seq.next(0);
    seq.next(0);
    expect(seq.choices.some((c) => c.role === "stop")).toBe(false);
    const plain = sequencer();
    [0, 0, 0].forEach((h) => plain.next(h));
    expect(chanceOf(seq, "wall")).toBeGreaterThan(chanceOf(plain, "wall"));
  });

  it("changes only where a phrase ends, however hot the fight is", () => {
    const tuning = { ...ARC, blockBars: 2, next: { ...ARC.next, verse: { wall: 1 } } };
    const seq = new BlockSequencer(blocksOf(SECTIONS, 2), tuning, seamsOf(SECTIONS), () => 0);
    expect([0, 0, 0, 5, 5].map((h) => seq.next(h).bar)).toEqual([5, 7, 9, 11, 21]);
  });

  it("raises the moves a nudge names at the next decision", () => {
    const plain = sequencer();
    const nudged = sequencer();
    for (const seq of [plain, nudged]) [0, 0].forEach((h) => seq.next(h));
    plain.next(0);
    nudged.next(0, { stop: 5 });
    expect(chanceOf(nudged, "stop")).toBeGreaterThan(chanceOf(plain, "stop") * 3);
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
    const sections: Section[] = [{ role: "intro", from: 1, bars: 2 }, { role: "stop", from: 3, bars: 4 }, { role: "verse", from: 7, bars: 2 }];
    const seq = new BlockSequencer(blocksOf(sections, 2), { ...ARC, blockBars: 2, next: { ...ARC.next, intro: { stop: 1 } } }, seamsOf(sections), () => 0);
    expect([0, 0, 0, 0].map((h) => seq.next(h).bar)).toEqual([1, 3, 5, 7]);
  });

  it("never jumps across a seam that sounds like a cut", () => {
    const cutIntoSecondVerse = seamsOf(SECTIONS, (_exit, target) => (target === 41 ? ARC.seamDb + 1 : 0));
    const offered = (seq: BlockSequencer) => Array.from({ length: 12 }, () => (seq.next(0), seq.choices.some((c) => c.from === 41)));
    expect(offered(sequencer())).toContain(true);
    expect(offered(new BlockSequencer(blocksOf(SECTIONS, 4), ARC, cutIntoSecondVerse, () => 0))).not.toContain(true);
  });

  it("fails loud when a song has no seam score for a jump", () => {
    const seq = new BlockSequencer(blocksOf(SECTIONS, 4), ARC, {}, () => 0);
    seq.next(0);
    expect(() => seq.next(0)).toThrow(/no seam from bar 9/);
  });

  it("refuses a section that does not split into blocks", () => {
    expect(() => blocksOf([{ role: "verse", from: 1, bars: 6 }], 4)).toThrow(/multiple of 4/);
  });
});
