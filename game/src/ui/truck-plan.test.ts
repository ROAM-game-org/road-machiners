import { describe, expect, it } from "vitest";
import { CHASSIS } from "../data/chassis";
import { PARTS } from "../data/parts";
import { PLAN_PAD } from "../render/partLooks";
import { baseGrid } from "../sim/grid";
import { planBox } from "./plans";
import { CONDITION_SIDE_INSET, partLook } from "./truck-condition-view";

describe("planBox", () => {
  it("gives the whole inner columns by default, as the inventory draws them", () => {
    for (const id of Object.keys(CHASSIS)) {
      const grid = baseGrid(id);
      const cell = 30;
      expect(planBox(id, cell)).toEqual([(1 - PLAN_PAD) * cell, -PLAN_PAD * cell, (grid.w - 2 + 2 * PLAN_PAD) * cell, (grid.h + 2 * PLAN_PAD) * cell]);
    }
  });

  it("refuses an inset that leaves no body", () => {
    expect(() => planBox("scout", 30, -1.1)).toThrow(/side inset/);
    expect(() => planBox("scout", 30, (baseGrid("scout").w - 2) / 2)).toThrow(/side inset/);
  });

  it("lets the condition body cover every part cell, wheels and guns included", () => {
    for (const id of Object.keys(CHASSIS)) {
      const grid = baseGrid(id);
      const [x, , w] = planBox(id, 1, CONDITION_SIDE_INSET);
      expect(x + PLAN_PAD).toBe(0);
      expect(x + w - PLAN_PAD).toBe(grid.w);
    }
  });
});

describe("partLook", () => {
  it("draws cabs with glass and every other part as its icon", () => {
    for (const def of Object.values(PARTS)) {
      const expected = def.kind === "core" && def.role === "cab" ? "cab" : "icon";
      expect(partLook(def.id)).toBe(expected);
    }
  });
});
