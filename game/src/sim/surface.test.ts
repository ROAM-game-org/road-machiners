import { describe, expect, it } from "vitest";
import { blurredHeights, FOLD, GroundSurface, MESH_STEPS } from "./surface";

const SIDE = 24;

function surface(height: (x: number, y: number) => number, cliffs: [number, number][] = []): GroundSurface {
  const heights = Array.from({ length: (SIDE + 1) ** 2 }, (_, k) => height(k % (SIDE + 1), Math.floor(k / (SIDE + 1))));
  const cliff = (x: number, y: number) => cliffs.some(([cx, cy]) => cx === x && cy === y);
  return new GroundSurface({ size: SIDE, heights, foldOf: (x, y) => (cliff(x, y) ? FOLD.cliff : FOLD.smooth) });
}

describe("ground surface", () => {
  it("keeps an even slope exactly", () => {
    const ground = surface((x, y) => 0.3 * x - 0.2 * y);
    expect(ground.heightAt(12.25, 11.5)).toBeCloseTo(0.3 * 12.25 - 0.2 * 11.5, 5);
    expect(ground.slopeAt(12.25, 11.5).x).toBeCloseTo(0.3, 5);
  });

  it("rounds a lone peak into a low smooth hump instead of a point", () => {
    const ground = surface((x, y) => (x === 12 && y === 12 ? 6 : 0));
    expect(ground.heightAt(12, 12)).toBeGreaterThan(0);
    expect(ground.heightAt(12, 12)).toBeLessThan(1);
    expect(ground.heightAt(12.5, 12)).toBeLessThan(ground.heightAt(12, 12));
  });

  it("keeps a cliff square on its own raw corners", () => {
    const ground = surface((x) => (x >= 12 ? 8 : 0), [[11, 12]]);
    expect(ground.heightAt(11, 12)).toBe(0);
    expect(ground.heightAt(12, 12)).toBe(8);
    expect(ground.heightAt(11.5, 12.5)).toBeCloseTo(4, 9);
    expect(ground.heightAt(12, 12.5)).toBe(8);
  });

  it("leaves no step where a cliff square meets the smooth ground beside it", () => {
    const ground = surface((x, y) => (x >= 12 ? 8 : 0) + 0.1 * y, [[11, 12], [11, 13]]);
    for (const [x, y] of [[12, 12.5], [11, 12.25], [12, 13.75], [11.5, 12], [11.5, 14], [12, 14]]) {
      for (const [dx, dy] of [[1e-7, 0], [-1e-7, 0], [0, 1e-7], [0, -1e-7]]) expect(ground.heightAt(x + dx, y + dy), `${x},${y}`).toBeCloseTo(ground.heightAt(x, y), 4);
    }
  });

  it("samples a grid exactly as it samples each point, beside cliffs and at the map edge too", () => {
    const ground = surface((x, y) => (x >= 12 ? 8 : 0) + Math.sin(x * 1.3 + y * 0.7) * 2, [[11, 12], [11, 13], [11, 14]]);
    for (const [x0, y0, width, depth] of [[0, 0, SIDE, SIDE], [9, 10, 5, 7], [20, 3, 4, 2]]) {
      const grid = ground.grid(x0, y0, width, depth);
      const cols = width * MESH_STEPS + 1;
      for (let q = 0; q <= depth * MESH_STEPS; q++)
        for (let p = 0; p < cols; p++) expect(grid[q * cols + p], `${x0 + p / MESH_STEPS},${y0 + q / MESH_STEPS}`).toBe(ground.heightAt(x0 + p / MESH_STEPS, y0 + q / MESH_STEPS));
    }
  });

  it("gives the same heights whatever order the ground is first read in", () => {
    const height = (x: number, y: number) => (x >= 12 ? 8 : 0) + Math.sin(x * 1.3 + y * 0.7) * 2;
    const first = surface(height, [[11, 12], [11, 13]]);
    const second = surface(height, [[11, 12], [11, 13]]);
    second.grid(0, 0, SIDE, SIDE);
    for (let y = SIDE; y >= 0; y -= 0.75) for (let x = 0; x <= SIDE; x += 0.6) expect(first.heightAt(x, y)).toBe(second.heightAt(x, y));
  });

  it("keeps an even slope even out to the edge of the map and flat past it", () => {
    const ground = surface((x, y) => 0.5 * x + 0.25 * y);
    expect(ground.heightAt(0, 0)).toBeCloseTo(0, 9);
    expect(ground.heightAt(SIDE, 0.5)).toBeCloseTo(0.5 * SIDE + 0.125, 9);
    expect(ground.heightAt(-3, 4)).toBe(ground.heightAt(0, 4));
    expect(ground.heightAt(SIDE + 2, 4)).toBe(ground.heightAt(SIDE, 4));
  });
});

const BLUR_SIDE = 41;
const MIDDLE = 20 * BLUR_SIDE + 20;

function grid(height: (x: number, y: number) => number): Float32Array {
  return Float32Array.from({ length: BLUR_SIDE * BLUR_SIDE }, (_, k) => height(k % BLUR_SIDE, Math.floor(k / BLUR_SIDE)));
}

describe("height blur", () => {
  it("keeps the height of a long even hillside", () => {
    expect(blurredHeights(grid((x) => 0.25 * x), BLUR_SIDE, 3)[MIDDLE]).toBeCloseTo(5, 4);
  });

  it("flattens a small bump so it casts no hill shadow of its own", () => {
    const bump = grid((x, y) => (x === 20 && y === 20 ? 2 : 0));
    expect(blurredHeights(bump, BLUR_SIDE, 3)[MIDDLE]).toBeLessThan(0.2);
  });

  it("smooths over half a tile instead of rounding the blur away", () => {
    const zigzag = grid((x) => (x % 2) * 0.4);
    const raw = blurredHeights(zigzag, BLUR_SIDE, 0)[MIDDLE + 1];
    const smoothed = blurredHeights(zigzag, BLUR_SIDE, 0.5)[MIDDLE + 1];
    expect(raw - smoothed).toBeGreaterThan(0.05);
  });
});
