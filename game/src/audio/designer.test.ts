import { describe, expect, it } from "vitest";
import { BlockSequencer, blocksOf, Fading, type ArcTuning, type Jumps, type Section } from "./designer";

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
  { role: "intro", from: 1, bars: 2 },
  { role: "verse", from: 3, bars: 8 },
  { role: "wall", from: 11, bars: 8 },
  { role: "stop", from: 19, bars: 2 },
  { role: "verse", from: 21, bars: 8 },
  { role: "wall", from: 29, bars: 8 },
];
const ARC: ArcTuning = { blockBars: 2, hotHeat: 2, coolHeat: 1, phraseBars: 8, jumpDb: 3, jumpChords: 0.97, hot: ["wall", "solo"], cool: ["verse"] };
const CLEAN = [1, 1];
const CUT = [9, 0.5];
const HOT = 5;
const WARM = 1.5;
const CALM = 0;

function jumpsOf(clean: [number, number][] = []): Jumps {
  const starts = blocksOf(SECTIONS, 2).map((b) => b.bar);
  const jumps: Jumps = {};
  for (const exit of starts.map((s) => s + 2)) jumps[exit] = Object.fromEntries(starts.map((t) => [t, clean.some(([e, b]) => e === exit && b === t) ? CLEAN : CUT]));
  return jumps;
}

function sequencer(clean: [number, number][] = [], quietExits: number[] = [], roll = () => 0) {
  return new BlockSequencer(blocksOf(SECTIONS, 2), ARC, { jumps: jumpsOf(clean), quietExits, jumpBlockBars: 2 }, roll);
}

function play(seq: BlockSequencer, heats: number[]): number[] {
  return heats.map((h) => seq.next(h).bar);
}

describe("BlockSequencer", () => {
  it("starts on the intro and follows the recording while every part is welcome", () => {
    expect(play(sequencer(), [WARM, WARM, WARM, WARM, WARM, WARM])).toEqual([1, 3, 5, 7, 9, 11]);
  });

  it("jumps to a clean twin that keeps a hot fight in the wall", () => {
    const seq = sequencer([[19, 29]]);
    expect(play(seq, [HOT, HOT, HOT, HOT, HOT, HOT, HOT, HOT, HOT, HOT])).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 29]);
  });

  it("follows the recording through a stop into a verse when the fight cools", () => {
    const seq = sequencer([[19, 29]]);
    expect(play(seq, [HOT, HOT, HOT, HOT, HOT, HOT, HOT, HOT, CALM, CALM])).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
    expect(seq.next(CALM).bar).toBe(21);
  });

  it("never takes a jump that does not sound clean, even to reach where the fight wants", () => {
    const seq = sequencer();
    expect(play(seq, [HOT, HOT, HOT, HOT, HOT, HOT, HOT, HOT, HOT, HOT])).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
  });

  it("lets the band come back in on any part's start after a cut in silence", () => {
    const seq = sequencer([], [21]);
    expect(play(seq, [HOT, HOT, HOT, HOT, HOT, HOT, HOT, HOT, HOT, HOT, HOT])).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 29]);
  });

  it("changes part through a twin only where a phrase ends", () => {
    const seq = sequencer([[7, 29]]);
    expect(play(seq, [CALM, HOT, HOT, HOT])).toEqual([1, 3, 5, 7]);
  });

  it("plays the other copy of a riff when the next block played lately", () => {
    const seq = sequencer([[11, 3], [11, 21], [29, 3], [29, 21]]);
    play(seq, [CALM, CALM, CALM, CALM, CALM]);
    expect(seq.next(CALM).bar).toBe(21);
    play(seq, [CALM, CALM, CALM]);
    expect(seq.next(CALM).bar).toBe(3);
  });

  it("fails loud when a song has no jump score", () => {
    expect(() => new BlockSequencer(blocksOf(SECTIONS, 2), ARC, { jumps: {}, quietExits: [], jumpBlockBars: 2 }, () => 0)).toThrow(/no jump score from bar 3/);
    expect(() => new BlockSequencer(blocksOf(SECTIONS, 2), ARC, { jumps: jumpsOf(), quietExits: [], jumpBlockBars: 4 }, () => 0)).toThrow(/for 4 bar blocks/);
  });

  it("refuses a section that does not split into blocks", () => {
    expect(() => blocksOf([{ role: "verse", from: 1, bars: 6 }], 4)).toThrow(/multiple of 4/);
  });
});
