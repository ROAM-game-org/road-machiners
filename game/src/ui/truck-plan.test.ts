import { describe, expect, it } from "vitest";
import { PARTS } from "../data/parts";
import { partLook } from "./truck-condition-view";

describe("partLook", () => {
  it("draws cabs with glass and every other part as its icon", () => {
    for (const def of Object.values(PARTS)) {
      const expected = def.kind === "core" && def.role === "cab" ? "cab" : "icon";
      expect(partLook(def.id)).toBe(expected);
    }
  });
});
