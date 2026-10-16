import { describe, expect, it } from "vitest";
import { CHASSIS, chassisDef } from "../data/chassis";
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
    expect(() => planBox("scout", 30, -0.1)).toThrow(/side inset/);
    expect(() => planBox("scout", 30, (baseGrid("scout").w - 2) / 2)).toThrow(/side inset/);
  });

  it("runs the condition body edge through the middle of every wheel", () => {
    for (const id of Object.keys(CHASSIS)) {
      const [x, , w] = planBox(id, 1, CONDITION_SIDE_INSET);
      const wheels = chassisDef(id).core.filter((c) => c.defId.startsWith("wheel"));
      expect(wheels.length).toBeGreaterThan(0);
      for (const wheel of wheels) {
        const center = wheel.x + 0.5;
        expect([x + PLAN_PAD, x + w - PLAN_PAD]).toContain(center);
      }
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
