import { describe, expect, it } from "vitest";
import { iconCorner, iconScreenScale, shadowFor } from "./truck-icons";

const SHEET = 18;
const CELL = { fromCenterX: -23.5, fromCenterY: -21.5 };

describe("truck icon sizes", () => {
  it("keep a screen size that is on a step exactly", () => {
    expect(iconScreenScale(SHEET, SHEET)).toBe(SHEET);
    expect(iconScreenScale(SHEET / 2, SHEET)).toBe(SHEET / 2);
    expect(iconScreenScale(SHEET / 4, SHEET)).toBe(SHEET / 4);
  });

  it("stay within half a step of the wanted size so the truck keeps its size on the map", () => {
    const halfStep = 2 ** (1 / 16);
    for (let wanted = 2; wanted <= SHEET; wanted += 0.37) {
      const size = iconScreenScale(wanted, SHEET);
      expect(size / wanted).toBeLessThanOrEqual(halfStep + 1e-9);
      expect(wanted / size).toBeLessThanOrEqual(halfStep + 1e-9);
    }
  });

  it("give one size for every wanted size inside a step, so zooming does not rebuild every icon", () => {
    expect(iconScreenScale(6.4, SHEET)).toBe(iconScreenScale(6.6, SHEET));
  });
});

describe("truck icon placement", () => {
  it("lands on whole screen pixels at any device ratio and any glide position", () => {
    for (const ratio of [1, 1.25, 1.5, 2, 2.6, 3]) {
      for (const at of [{ x: 100.3, y: 200.7 }, { x: 0.49, y: 0.51 }, { x: 733.333, y: 41.667 }]) {
        const screen = iconScreenScale(6.67 * ratio, SHEET);
        const { left, top } = iconCorner(at, ratio, CELL, SHEET, screen, shadowFor(ratio).pad);
        expect(Number.isInteger(left)).toBe(true);
        expect(Number.isInteger(top)).toBe(true);
      }
    }
  });

  it("puts the truck's centre on the marker spot to within half a screen pixel", () => {
    const ratio = 2;
    const screen = iconScreenScale(6.67 * ratio, SHEET);
    const { pad } = shadowFor(ratio);
    const at = { x: 321.4, y: 87.9 };
    const { left } = iconCorner(at, ratio, CELL, SHEET, screen, pad);
    const centre = left + pad - (CELL.fromCenterX / SHEET) * screen;
    expect(Math.abs(centre - at.x * ratio)).toBeLessThanOrEqual(0.5);
  });

  it("thickens the shadow with the device ratio and never below one pixel", () => {
    expect(shadowFor(1)).toEqual({ reach: 1, blur: 1, pad: 3 });
    expect(shadowFor(2.4).reach).toBe(2);
    expect(shadowFor(0.5).reach).toBe(1);
  });
});
