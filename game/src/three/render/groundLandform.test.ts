import { describe, expect, it } from "vitest";
import { blurredHeights } from "../../sim/surface";
import { LANDFORM_BLUR_TILES, landformSlopes } from "./groundLandform";

const SIDE = 41;
const TILE_METERS = 4;

function form(height: (x: number, y: number) => number): Float32Array {
  return blurredHeights(Float32Array.from({ length: SIDE * SIDE }, (_, k) => height(k % SIDE, Math.floor(k / SIDE))), SIDE, LANDFORM_BLUR_TILES);
}

describe("ground landform", () => {
  it("gives the rise per meter of a plain tilt", () => {
    const slopes = landformSlopes(form((x, y) => 0.3 * x - 0.2 * y), SIDE, TILE_METERS);
    for (const k of [7 * SIDE + 7, 20 * SIDE + 20, 33 * SIDE + 33]) {
      expect(slopes[k * 2]).toBeCloseTo(0.3 / TILE_METERS, 3);
      expect(slopes[k * 2 + 1]).toBeCloseTo(-0.2 / TILE_METERS, 3);
    }
  });

  it("smooths small bumps away and keeps a ridge facing both ways", () => {
    const ridge = (x: number) => 2 * Math.exp(-(((x - 20) / 4) ** 2));
    const slopes = landformSlopes(form((x, y) => ridge(x) + 0.1 * Math.sin(x * 2.9) * Math.cos(y * 3.1)), SIDE, TILE_METERS);
    const across = (x: number) => slopes[(20 * SIDE + x) * 2];
    expect(across(16)).toBeGreaterThan(0.2 / TILE_METERS);
    expect(across(24)).toBeLessThan(-0.2 / TILE_METERS);
    expect(Math.abs(across(20))).toBeLessThan(0.05 / TILE_METERS);
  });
});
