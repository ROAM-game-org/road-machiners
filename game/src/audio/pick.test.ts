import { describe, expect, it } from "vitest";
import { crashEventOf, crashLevel, landingLevel, landingRanks, layersToPlay, pickVariant, shuffled, spatial, VoiceBudget, type VoicePlay } from "./pick";

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

describe("VoiceBudget", () => {
  const play = (cue: string, now: number, over: Partial<VoicePlay> = {}): VoicePlay => ({ cue, maxVoices: 6, budgeted: true, now, endsAt: now + 1, minGapSec: 0, ...over });

  it("cuts a cue's oldest voice when the cue is at its cap, and plays the new one", () => {
    const v = new VoiceBudget(12);
    const first = v.admit(play("mg", 0, { maxVoices: 2 }))!;
    v.admit(play("mg", 0.1, { maxVoices: 2 }));
    expect(v.admit(play("mg", 0.2, { maxVoices: 2 }))!.cut).toEqual([first.id]);
  });

  it("cuts the most crowded cue's oldest voice when the budget is full", () => {
    const v = new VoiceBudget(4);
    const oldestMg = v.admit(play("mg", 0))!;
    v.admit(play("mg", 0.1));
    v.admit(play("mg", 0.2));
    v.admit(play("hit", 0.3));
    expect(v.admit(play("crash", 0.4))!.cut).toEqual([oldestMg.id]);
  });

  it("cuts the new play's own cue first when it is the most crowded", () => {
    const v = new VoiceBudget(3);
    v.admit(play("hit", 0));
    const oldestMg = v.admit(play("mg", 0.1))!;
    v.admit(play("mg", 0.2));
    expect(v.admit(play("mg", 0.3))!.cut).toEqual([oldestMg.id]);
  });

  it("breaks a tie in crowd by the oldest voice", () => {
    const v = new VoiceBudget(2);
    const hit = v.admit(play("hit", 0))!;
    v.admit(play("mg", 0.1));
    expect(v.admit(play("crash", 0.2))!.cut).toEqual([hit.id]);
  });

  it("ranks age by admission, so a play that starts before a delayed layer is still the newest", () => {
    const v = new VoiceBudget(2);
    const echo = v.admit(play("echo", 0, { endsAt: 1.27 }))!;
    v.admit(play("rattle", 0, { endsAt: 1 }));
    expect(v.admit(play("hit", 0))!.cut).toEqual([echo.id]);
  });

  it("frees space when voices end", () => {
    const v = new VoiceBudget(2);
    v.admit(play("mg", 0));
    v.admit(play("mg", 0));
    expect(v.admit(play("mg", 1))!.cut).toEqual([]);
  });

  it("keeps ui voices out of the budget, with only their own cap", () => {
    const v = new VoiceBudget(1);
    v.admit(play("mg", 0));
    expect(v.admit(play("click", 0.1, { budgeted: false, maxVoices: 1 }))!.cut).toEqual([]);
    expect(v.admit(play("hit", 0.2))!.cut).toHaveLength(1);
  });

  it("never holds more budgeted voices than the budget", () => {
    const v = new VoiceBudget(5);
    const live = new Set<number>();
    for (let k = 0; k < 40; k++) {
      const a = v.admit(play(["mg", "hit", "miss"][k % 3], k * 0.01, { maxVoices: 4 }))!;
      for (const id of a.cut) live.delete(id);
      live.add(a.id);
      expect(live.size).toBeLessThanOrEqual(5);
    }
  });

  it("refuses a play inside the cue's minimum gap and admits one at the gap", () => {
    const v = new VoiceBudget(12);
    expect(v.admit(play("tick", 0, { minGapSec: 0.045 }))).not.toBeNull();
    expect(v.admit(play("tick", 0.03, { minGapSec: 0.045 }))).toBeNull();
    expect(v.admit(play("tick", 0.045, { minGapSec: 0.045 }))).not.toBeNull();
  });

  it("does not count a refused play toward the next gap", () => {
    const v = new VoiceBudget(12);
    expect(v.admit(play("tick", 0, { minGapSec: 0.1 }))).not.toBeNull();
    expect(v.admit(play("tick", 0.09, { minGapSec: 0.1 }))).toBeNull();
    expect(v.admit(play("tick", 0.1, { minGapSec: 0.1 }))).not.toBeNull();
  });

  it("rejects a budget below one voice", () => {
    expect(() => new VoiceBudget(0)).toThrow();
  });
});

describe("landing thinning", () => {
  const thin = { levels: [1, 0.7, 0.5], every: 3, restLevel: 0.4 };

  it("plays the first landings of a volley at falling levels, then every third quietly", () => {
    expect(Array.from({ length: 10 }, (_, k) => landingLevel(k, thin))).toEqual([1, 0.7, 0.5, null, null, 0.4, null, null, 0.4, null]);
  });

  it("ranks rounds by when they land, not by when they fired", () => {
    expect(landingRanks([300, 100, 200, 100])).toEqual([3, 0, 2, 1]);
  });

  it("rejects a bad rank", () => {
    expect(() => landingLevel(-1, thin)).toThrow();
    expect(() => landingLevel(1.5, thin)).toThrow();
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
