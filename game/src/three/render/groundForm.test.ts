import { describe, expect, it } from "vitest";
import { FORM_STRIDE, formField } from "./groundForm";

const SIDE = 41;

function heights(height: (x: number, y: number) => number): Float32Array {
  return Float32Array.from({ length: SIDE * SIDE }, (_, k) => height(k % SIDE, Math.floor(k / SIDE)));
}

function slopeAt(field: Float32Array, x: number, y: number): [number, number] {
  const k = (y * SIDE + x) * FORM_STRIDE;
  return [field[k], field[k + 1]];
}

function slopes(field: Float32Array): number[] {
  return Array.from({ length: SIDE * SIDE }, (_, k) => [field[k * FORM_STRIDE], field[k * FORM_STRIDE + 1]]).flat();
}

describe("ground form", () => {
  it("keeps the slope of a long even hillside", () => {
    const [dx, dy] = slopeAt(formField(heights((x) => 0.25 * x), SIDE, 3), 20, 20);
    expect(dx).toBeCloseTo(0.25, 5);
    expect(dy).toBeCloseTo(0, 5);
  });

  it("flattens a small bump so it gets no shade plane of its own", () => {
    const bump = heights((x, y) => (x === 20 && y === 20 ? 2 : 0));
    const raw = Math.max(...slopes(formField(bump, SIDE, 0)).map(Math.abs));
    const form = Math.max(...slopes(formField(bump, SIDE, 3)).map(Math.abs));
    expect(form).toBeLessThan(raw / 10);
  });

  it("smooths over half a tile instead of rounding the blur away", () => {
    const zigzag = heights((x) => (x % 2) * 0.4);
    const rawHeight = formField(zigzag, SIDE, 0)[(20 * SIDE + 21) * FORM_STRIDE + 2];
    const formHeight = formField(zigzag, SIDE, 0.5)[(20 * SIDE + 21) * FORM_STRIDE + 2];
    expect(rawHeight - formHeight).toBeGreaterThan(0.05);
  });

  it("stores the smoothed height for hill shadows", () => {
    const field = formField(heights((x) => 0.5 * x), SIDE, 1);
    expect(field[(20 * SIDE + 20) * FORM_STRIDE + 2]).toBeCloseTo(10, 4);
  });
});
