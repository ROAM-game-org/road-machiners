import { describe, expect, it } from "vitest";
import { crashEventOf, crashLevel, layersToPlay, pickVariant, shuffled, spatial, VoiceLimiter } from "./pick";

describe("shuffled", () => {
  it("reorders a copy by its rolls and keeps every item", () => {
    const items = ["a", "b", "c", "d"];
    expect(shuffled(items, () => 0)).toEqual(["b", "c", "d", "a"]);
    expect(shuffled(items, () => 0.99)).toEqual(items);
    expect(items).toEqual(["a", "b", "c", "d"]);
  });
});

describe("pickVariant", () => {
  it("never repeats the last variant", () => {
    for (let last = 0; last < 3; last++)
      for (const roll of [0, 0.3, 0.5, 0.99]) expect(pickVariant(3, last, roll)).not.toBe(last);
  });
  it("covers every variant", () => {
    const seen = new Set([0, 0.34, 0.67, 0.99].map((r) => pickVariant(3, null, r)));
    expect(seen).toEqual(new Set([0, 1, 2]));
  });
  it("fails on a cue with no files", () => {
    expect(() => pickVariant(0, null, 0.5)).toThrow();
  });
});

describe("spatial", () => {
  it("pans left and right by screen side", () => {
    expect(spatial(0, 100, 0, 40, 0.7).pan).toBeCloseTo(-0.7);
    expect(spatial(50, 100, 0, 40, 0.7).pan).toBeCloseTo(0);
    expect(spatial(100, 100, 0, 40, 0.7).pan).toBeCloseTo(0.7);
    expect(spatial(300, 100, 0, 40, 0.7).pan).toBeCloseTo(0.7);
  });
  it("halves gain at the half-gain distance", () => {
    expect(spatial(50, 100, 0, 40, 0.7).gain).toBe(1);
    expect(spatial(50, 100, 40, 40, 0.7).gain).toBeCloseTo(0.5);
  });
  it("centres the pan when the window has no width", () => {
    for (const width of [0, -5]) {
      const placed = spatial(30, width, 10, 40, 0.7);
      expect(placed.pan).toBe(0);
      expect(Number.isFinite(placed.gain)).toBe(true);
    }
  });
  it("fails loud on a non-finite screen x or distance", () => {
    expect(() => spatial(NaN, 100, 0, 40, 0.7)).toThrow(/finite/);
    expect(() => spatial(Infinity, 100, 0, 40, 0.7)).toThrow(/finite/);
    expect(() => spatial(50, 100, NaN, 40, 0.7)).toThrow(/finite/);
  });
});

describe("VoiceLimiter", () => {
  it("caps sounding plays and frees them when they end", () => {
    const v = new VoiceLimiter();
    expect(v.admit("mg", 2, 0, 1)).toBe(true);
    expect(v.admit("mg", 2, 0, 1)).toBe(true);
    expect(v.admit("mg", 2, 0.5, 1.5)).toBe(false);
    expect(v.admit("cannon", 2, 0.5, 1.5)).toBe(true);
    expect(v.admit("mg", 2, 1, 2)).toBe(true);
  });

  it("refuses a play inside the cue's minimum gap and admits one at the gap", () => {
    const v = new VoiceLimiter();
    expect(v.admit("tick", 1, 0, 0.01, 0.045)).toBe(true);
    expect(v.admit("tick", 1, 0.03, 0.04, 0.045)).toBe(false);
    expect(v.admit("tick", 1, 0.045, 0.05, 0.045)).toBe(true);
  });

  it("does not count a refused play toward the next gap", () => {
    const v = new VoiceLimiter();
    expect(v.admit("tick", 1, 0, 0.01, 0.1)).toBe(true);
    expect(v.admit("tick", 1, 0.09, 0.1, 0.1)).toBe(false);
    expect(v.admit("tick", 1, 0.1, 0.11, 0.1)).toBe(true);
  });

  it("keeps today's behavior with no gap", () => {
    const v = new VoiceLimiter();
    expect(v.admit("tick", 3, 0, 1)).toBe(true);
    expect(v.admit("tick", 3, 0, 1)).toBe(true);
  });
});

describe("crashLevel", () => {
  const curve = { quietImpact: 1.5, fullImpact: 4, quietGain: 0.25 };

  it("plays the quiet gain at and below the quiet impact", () => {
    expect(crashLevel(0, curve)).toBe(0.25);
    expect(crashLevel(1.5, curve)).toBe(0.25);
  });

  it("rises in a straight line up to the full impact", () => {
    expect(crashLevel(2.75, curve)).toBeCloseTo(0.625);
    expect(crashLevel(2, curve)).toBeLessThan(crashLevel(3, curve));
  });

  it("never passes full gain", () => {
    expect(crashLevel(4, curve)).toBe(1);
    expect(crashLevel(40, curve)).toBe(1);
  });

  it("throws on a bad impact or a bad curve", () => {
    expect(() => crashLevel(NaN, curve)).toThrow();
    expect(() => crashLevel(Infinity, curve)).toThrow();
    expect(() => crashLevel(-1, curve)).toThrow();
    expect(() => crashLevel(2, { ...curve, fullImpact: 1.5 })).toThrow();
    expect(() => crashLevel(2, { ...curve, quietGain: 0 })).toThrow();
    expect(() => crashLevel(2, { ...curve, quietGain: 1.2 })).toThrow();
  });
});

describe("layersToPlay", () => {
  const layers = [
    { cue: "crash-thump", delayMs: 0, gain: 1, chance: 1 },
    { cue: "crash-debris", delayMs: 100, gain: 0.5, chance: 0.3 },
  ] as const;

  it("keeps a layer when its own roll falls under its chance", () => {
    const rolls = [0.99, 0.29];
    expect(layersToPlay(layers, () => rolls.shift()!).map((l) => l.cue)).toEqual(["crash-thump", "crash-debris"]);
  });

  it("drops a layer when its roll reaches its chance", () => {
    const rolls = [0, 0.3];
    expect(layersToPlay(layers, () => rolls.shift()!).map((l) => l.cue)).toEqual(["crash-thump"]);
  });

  it("throws on a chance outside (0, 1]", () => {
    for (const chance of [0, -1, 1.5, NaN]) expect(() => layersToPlay([{ ...layers[0], chance }], () => 0)).toThrow();
  });
});

describe("crashEventOf", () => {
  it("plays the light stack under the hard speed and the hard stack from it", () => {
    expect(crashEventOf(3.9, 4)).toBe("crash-light");
    expect(crashEventOf(4, 4)).toBe("crash-hard");
    expect(crashEventOf(40, 4)).toBe("crash-hard");
  });

  it("throws on a bad impact", () => {
    for (const impact of [-1, NaN, Infinity]) expect(() => crashEventOf(impact, 4)).toThrow();
  });
});
