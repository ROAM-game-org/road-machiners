import { describe, expect, it } from "vitest";
import { blurredHeights } from "./groundForm";

const SIDE = 41;
const MIDDLE = 20 * SIDE + 20;

function heights(height: (x: number, y: number) => number): Float32Array {
  return Float32Array.from({ length: SIDE * SIDE }, (_, k) => height(k % SIDE, Math.floor(k / SIDE)));
}

describe("ground form", () => {
  it("keeps the height of a long even hillside", () => {
    expect(blurredHeights(heights((x) => 0.25 * x), SIDE, 3)[MIDDLE]).toBeCloseTo(5, 4);
  });

  it("flattens a small bump so it casts no hill shadow of its own", () => {
    const bump = heights((x, y) => (x === 20 && y === 20 ? 2 : 0));
    expect(blurredHeights(bump, SIDE, 3)[MIDDLE]).toBeLessThan(0.2);
  });

  it("smooths over half a tile instead of rounding the blur away", () => {
    const zigzag = heights((x) => (x % 2) * 0.4);
    const raw = blurredHeights(zigzag, SIDE, 0)[MIDDLE + 1];
    const smoothed = blurredHeights(zigzag, SIDE, 0.5)[MIDDLE + 1];
    expect(raw - smoothed).toBeGreaterThan(0.05);
  });
});
