import { describe, expect, it } from "vitest";
import { FOLD, REACH_TILES, SurfacePatch } from "./groundSurface";

const SIDE = 8;

function patch(height: (x: number, y: number) => number, cliffs: [number, number][] = []): SurfacePatch {
  const cols = SIDE + 2 * REACH_TILES;
  const corners = Float64Array.from({ length: (cols + 1) * (cols + 1) }, (_, k) => height((k % (cols + 1)) - REACH_TILES, Math.floor(k / (cols + 1)) - REACH_TILES));
  const folds = new Uint8Array(cols * cols);
  for (const [x, y] of cliffs) folds[(y + REACH_TILES) * cols + x + REACH_TILES] = FOLD.cliff;
  return new SurfacePatch(-REACH_TILES, -REACH_TILES, cols, corners, folds);
}

describe("ground surface", () => {
  it("keeps an even slope exactly", () => {
    const surface = patch((x, y) => 0.3 * x - 0.2 * y);
    expect(surface.heightAt(3.25, 4.5)).toBeCloseTo(0.3 * 3.25 - 0.2 * 4.5, 9);
    expect(surface.slopeAt(3.25, 4.5).x).toBeCloseTo(0.3, 9);
  });

  it("rounds a lone peak into a smooth hump instead of a point", () => {
    const surface = patch((x, y) => (x === 4 && y === 4 ? 6 : 0));
    expect(surface.heightAt(4, 4)).toBeCloseTo((6 * 4 * 4) / 36, 9);
    expect(surface.heightAt(4.5, 4)).toBeGreaterThan(0);
    expect(surface.heightAt(4.5, 4)).toBeLessThan(surface.heightAt(4, 4));
  });

  it("keeps a cliff square on its own corners and closes the seam with its smooth neighbour", () => {
    const step = (x: number) => (x >= 4 ? 8 : 0);
    const surface = patch((x) => step(x), [[3, 4]]);
    expect(surface.heightAt(3, 4)).toBe(0);
    expect(surface.heightAt(4, 4)).toBe(8);
    expect(surface.heightAt(3.5, 4.5)).toBeCloseTo(4, 9);
    expect(surface.heightAt(4, 4.5)).toBe(8);
  });
});
