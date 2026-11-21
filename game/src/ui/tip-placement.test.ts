import { describe, expect, it } from "vitest";
import { tipPlacement, type Box } from "./tip-placement";

const area = { x: 0, y: 0, width: 200, height: 100 };
const tip = { width: 60, height: 20 };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const asBox = (s: { left: number; top: number }): Box => ({ x: s.left, y: s.top, width: tip.width, height: tip.height });

describe("tipPlacement", () => {
  it("sits below a part near the top edge without touching it", () => {
    const part = { x: 80, y: 2, width: 40, height: 20 };
    const spot = tipPlacement(part, tip, area, 2);
    expect(spot.side).toBe("below");
    expect(overlaps(asBox(spot), part)).toBe(false);
  });

  it("sits above a part near the bottom edge and stays inside", () => {
    const part = { x: 80, y: 78, width: 40, height: 20 };
    const spot = tipPlacement(part, tip, area, 2);
    expect(spot.side).toBe("above");
    expect(spot.top).toBeGreaterThanOrEqual(0);
    expect(overlaps(asBox(spot), part)).toBe(false);
  });

  it("clamps sideways at the left and right edges", () => {
    expect(tipPlacement({ x: 0, y: 40, width: 10, height: 10 }, tip, area, 2).left).toBe(0);
    expect(tipPlacement({ x: 190, y: 40, width: 10, height: 10 }, tip, area, 2).left).toBe(140);
  });

  it("takes the side with more room for a tall part and stays inside", () => {
    const part = { x: 80, y: 30, width: 40, height: 66 };
    const spot = tipPlacement(part, tip, area, 2);
    expect(spot.side).toBe("above");
    expect(spot.top).toBeGreaterThanOrEqual(0);
    expect(spot.top + tip.height).toBeLessThanOrEqual(area.height);
  });

  it("pins a tip wider than the area to the left edge", () => {
    expect(tipPlacement({ x: 50, y: 40, width: 10, height: 10 }, { width: 300, height: 20 }, area, 2).left).toBe(0);
  });

  it("uses room outside the part's own box when the area reaches past it", () => {
    const wide = { x: -20, y: -40, width: 240, height: 180 };
    const part = { x: 80, y: 78, width: 40, height: 20 };
    const spot = tipPlacement(part, tip, wide, 2);
    expect(spot.side).toBe("below");
    expect(overlaps(asBox(spot), part)).toBe(false);
  });
});
