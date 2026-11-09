import { describe, expect, it } from "vitest";
import { KNOBS } from "./inkTuning";
import { LOOK_GROUPS, checkLookGroups, valueText } from "./inkMenu";

describe("look menu groups", () => {
  it("list every knob exactly once", () => {
    expect(() => checkLookGroups(LOOK_GROUPS)).not.toThrow();
  });

  it("fail loud on a missing knob", () => {
    const missing = LOOK_GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => k !== "crt") }));
    expect(() => checkLookGroups(missing)).toThrow("crt 0 times");
  });

  it("fail loud on a knob listed twice", () => {
    const twice = [...LOOK_GROUPS, { title: "Again", keys: ["color" as const] }];
    expect(() => checkLookGroups(twice)).toThrow("color 2 times");
  });
});

describe("look menu values", () => {
  it("show the step's decimals and the unit", () => {
    expect(valueText(KNOBS.waveSize, 9)).toBe("9 m");
    expect(valueText(KNOBS.hatchPx, 8)).toBe("8.0 px");
    expect(valueText(KNOBS.edgeSoft, 0.01)).toBe("0.01");
    expect(valueText(KNOBS.crestWidth, 0.8)).toBe("0.80 m");
  });
});
