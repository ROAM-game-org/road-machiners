import { describe, expect, it } from "vitest";
import { needleAngle, litSegments, dialShare, scaleTicks } from "./panels";
import { knobAngle, lineChanges, wheelFrame, wheelTurn, dashFit } from "./panels";
import { gunPage, utilityEngaged, utilityLamp } from "./weapon-blocks";
import type { UtilityState } from "../weapons";

describe("needleAngle", () => {
  it("points an empty gauge at the start of its sweep", () => {
    expect(needleAngle(0, 240)).toBe(-120);
  });

  it("points a full gauge at the end of its sweep", () => {
    expect(needleAngle(1, 110)).toBe(55);
  });

  it("points a half full gauge straight up", () => {
    expect(needleAngle(0.5, 240)).toBe(0);
  });

  it("holds the needle at the ends when the share is out of range", () => {
    expect(needleAngle(-3, 240)).toBe(-120);
    expect(needleAngle(7, 240)).toBe(120);
  });

  it("refuses a share that is not a number", () => {
    expect(() => needleAngle(Number.NaN, 240)).toThrow(/NaN/);
  });
});

describe("litSegments", () => {
  it("lights none at zero and all at full", () => {
    expect(litSegments(0, 30)).toBe(0);
    expect(litSegments(1, 30)).toBe(30);
  });

  it("rounds a share to the nearest segment", () => {
    expect(litSegments(0.5, 30)).toBe(15);
    expect(litSegments(0.51, 30)).toBe(15);
  });

  it("holds a share past full at every segment", () => {
    expect(litSegments(3, 30)).toBe(30);
  });
});

describe("dialShare", () => {
  it("gives the share of the scale a speed covers", () => {
    expect(dialShare(60, 240)).toBe(0.25);
  });

  it("holds a speed above the scale at the end", () => {
    expect(dialShare(300, 240)).toBe(1);
  });

  it("refuses a scale with no length", () => {
    expect(() => dialShare(10, 0)).toThrow(/above 0/);
  });

  it("refuses a speed that is not a number", () => {
    expect(() => dialShare(Number.NaN, 100)).toThrow(/NaN/);
  });
});

describe("scaleTicks", () => {
  it("starts at zero and ends on the top of the scale", () => {
    const ticks = scaleTicks(120);
    expect(ticks[0]).toMatchObject({ speed: 0, share: 0 });
    expect(ticks.at(-1)).toMatchObject({ speed: 120, share: 1 });
  });

  it("marks few major ticks so the labels fit", () => {
    for (const top of [60, 100, 120, 240, 400]) expect(scaleTicks(top).filter((tick) => tick.major).length).toBeLessThanOrEqual(4);
  });

  it("labels a 120 scale every 40 like a truck speedometer", () => {
    expect(scaleTicks(120).filter((tick) => tick.major).map((tick) => tick.speed)).toEqual([0, 40, 80, 120]);
  });

  it("places every tick on a whole speed", () => {
    for (const top of [60, 100, 120, 240, 400]) for (const tick of scaleTicks(top)) expect(Number.isInteger(tick.speed)).toBe(true);
  });

  it("puts minor ticks between the major ones", () => {
    const ticks = scaleTicks(100);
    expect(ticks.length).toBeGreaterThan(ticks.filter((tick) => tick.major).length);
  });

  it("refuses a scale end that is not a whole number above 0", () => {
    expect(() => scaleTicks(0)).toThrow(/whole number/);
    expect(() => scaleTicks(12.5)).toThrow(/whole number/);
  });
});

describe("lineChanges", () => {
  it("reports a new line at the front as added", () => {
    expect(lineChanges([2, 1], [3, 2, 1])).toEqual({ added: [3], removed: [] });
  });

  it("reports a line that fell off the end as removed", () => {
    expect(lineChanges([3, 2, 1], [4, 3, 2])).toEqual({ added: [4], removed: [1] });
  });

  it("reports nothing when the ids are the same", () => {
    expect(lineChanges([3, 2, 1], [3, 2, 1])).toEqual({ added: [], removed: [] });
  });

  it("adds every line to an empty window", () => {
    expect(lineChanges([], [2, 1])).toEqual({ added: [2, 1], removed: [] });
  });

  it("removes every line when the list empties", () => {
    expect(lineChanges([2, 1], [])).toEqual({ added: [], removed: [2, 1] });
  });
});

describe("knobAngle", () => {
  it("spreads the speeds evenly from the left to the right of the knob", () => {
    expect([0, 1, 2, 3].map((i) => knobAngle(i, 4))).toEqual([-120, -40, 40, 120]);
  });

  it("refuses a position the knob does not have", () => {
    expect(() => knobAngle(4, 4)).toThrow(/below 4/);
  });
});

describe("wheelTurn", () => {
  it("rolls the wheel one rib for every rib of log scrolled, and repeats", () => {
    expect(wheelTurn(0)).toBe(0);
    expect(wheelTurn(3)).toBe(0.5);
    expect(wheelTurn(6)).toBe(0);
    expect(wheelTurn(9)).toBe(0.5);
  });
});

const UTILITY_LAMP_OF: Record<UtilityState, string> = {
  ready: "green",
  aiming: "amber",
  set: "amber",
  armed: "amber",
  recharging: "red",
  blocked: "off",
};

describe("utilityLamp", () => {
  for (const [state, lamp] of Object.entries(UTILITY_LAMP_OF)) {
    it(`lights ${lamp} for the ${state} state`, () => {
      expect(utilityLamp(state as UtilityState)).toBe(lamp);
    });
  }
});

describe("utilityEngaged", () => {
  it("throws the toggle up while the part aims, is set or is armed", () => {
    expect((["aiming", "set", "armed"] as const).map(utilityEngaged)).toEqual([true, true, true]);
  });

  it("leaves the toggle down for the other states", () => {
    expect((["ready", "recharging", "blocked"] as const).map(utilityEngaged)).toEqual([false, false, false]);
  });
});

describe("gunPage", () => {
  it("turns to the page of a newly picked gun", () => {
    expect(gunPage(7, null, 0, 9)).toBe(1);
  });

  it("keeps a page the player turned while the same gun stays picked", () => {
    expect(gunPage(1, 1, 1, 9)).toBe(1);
  });

  it("falls back to the last page when guns are removed", () => {
    expect(gunPage(null, null, 1, 4)).toBe(0);
  });
});

describe("wheelFrame", () => {
  it("steps through every baked frame once per rib", () => {
    expect([0, 1, 2, 3, 4, 5].map((px) => wheelFrame(px, 6))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(wheelFrame(6, 6)).toBe(0);
    expect(wheelFrame(-3, 6)).toBe(0);
  });
});

describe("the bottom row fit", () => {
  const row = { drive: 352.7, weapons: 400, radio: 410, tray: 52, gap: 8 };
  const width = row.drive + row.weapons + row.radio;

  it("keeps full size and full gaps when the row fits", () => {
    expect(dashFit({ width: 1512, height: 860 }, row)).toEqual({ zoom: 1, gap: 8 });
  });

  it("closes the gaps before it shrinks anything", () => {
    const fit = dashFit({ width: width + 6, height: 860 }, row);
    expect(fit.zoom).toBe(1);
    expect(fit.gap).toBeCloseTo(3);
  });

  it("shrinks the three parts together to the layer width once the gaps are gone", () => {
    const fit = dashFit({ width: 640, height: 360 }, row);
    expect(fit.gap).toBe(0);
    expect(fit.zoom * width).toBeCloseTo(640);
  });

  it("shrinks for height when the radio and the top tray do not fit", () => {
    const fit = dashFit({ width: 4000, height: 200 }, row);
    expect(fit.zoom).toBeLessThan(1);
    expect(fit.zoom * ((row.radio * 695) / 1279 + row.tray)).toBeCloseTo(200 - 2 * row.gap);
  });
});

