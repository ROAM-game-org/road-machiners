import { describe, expect, it } from "vitest";
import { formSlopes } from "./groundForm";

const SIDE = 41;

function field(height: (x: number, y: number) => number): Float32Array {
  return Float32Array.from({ length: SIDE * SIDE }, (_, k) => height(k % SIDE, Math.floor(k / SIDE)));
}

function slopeAt(slopes: Float32Array, x: number, y: number): [number, number] {
  const k = (y * SIDE + x) * 2;
  return [slopes[k], slopes[k + 1]];
}

describe("ground form slopes", () => {
  it("keeps the slope of a long even hillside", () => {
    const [dx, dy] = slopeAt(formSlopes(field((x) => 0.25 * x), SIDE, 3), 20, 20);
    expect(dx).toBeCloseTo(0.25, 5);
    expect(dy).toBeCloseTo(0, 5);
  });

  it("flattens a small bump so it gets no shade plane of its own", () => {
    const bump = field((x, y) => (x === 20 && y === 20 ? 2 : 0));
    const raw = Math.max(...[...formSlopes(bump, SIDE, 0.5)].map(Math.abs));
    const form = Math.max(...[...formSlopes(bump, SIDE, 3)].map(Math.abs));
    expect(form).toBeLessThan(raw / 10);
  });
});
