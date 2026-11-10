import { describe, expect, it } from "vitest";
import { blurredHeights } from "../../sim/surface";
import { CREST_SHAPE, crestField, crestGap, crestLines, type CrestPoint } from "./groundCrest";
import { LANDFORM_BLUR_TILES } from "./groundLandform";

const SIDE = 61;
const METERS = 4;
const LEAST = CREST_SHAPE;

function traced(height: (x: number, y: number) => number): CrestPoint[][] {
  const raw = Float32Array.from({ length: SIDE * SIDE }, (_, k) => height(k % SIDE, Math.floor(k / SIDE)));
  return crestLines(blurredHeights(raw, SIDE, LANDFORM_BLUR_TILES), raw, SIDE, METERS, LEAST);
}

const ridge = (x: number) => 2 * Math.exp(-(((x - 30) / 4) ** 2));

describe("ground crests", () => {
  it("traces one line along the top of a long ridge", () => {
    const lines = traced(ridge);
    expect(lines).toHaveLength(1);
    const [line] = lines;
    for (const p of line) expect(Math.abs(p.x - 30)).toBeLessThan(1);
    const ys = line.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(40);
  });

  it("lines a broad low dune that a short reach misses", () => {
    const lines = traced((x) => 2 * Math.exp(-(((x - 30) / 10) ** 2)));
    expect(lines).toHaveLength(1);
    for (const p of lines[0]) expect(Math.abs(p.x - 30)).toBeLessThan(1.5);
  });

  it("finds no crest in scattered low bumps", () => {
    expect(traced((x, y) => 0.1 * Math.sin(x * 1.7) * Math.cos(y * 2.3))).toHaveLength(0);
  });

  it("lines the lip of a cliff and not its foot", () => {
    const lines = traced((x) => (x < 26 ? 3 : x > 30 ? 0 : 3 * (30 - x) / 4));
    expect(lines).toHaveLength(1);
    for (const p of lines[0]) expect(Math.abs(p.x - 26)).toBeLessThan(1);
  });

  const lowDune = (x: number) => (x <= 30 ? 0.6 * Math.max(0, x - 10) / 20 : Math.max(0, 0.6 * (31 - x)));
  const tracedAt = (height: (x: number, y: number) => number, standout: number) => {
    const raw = Float32Array.from({ length: SIDE * SIDE }, (_, k) => height(k % SIDE, Math.floor(k / SIDE)));
    return crestLines(blurredHeights(raw, SIDE, LANDFORM_BLUR_TILES), raw, SIDE, METERS, { ...CREST_SHAPE, leastFoldMeters: 4, standout });
  };

  it("lines the sharp lip of a low dune that stands out from flat ground", () => {
    expect(tracedAt(lowDune, 0)).toHaveLength(0);
    const lines = tracedAt(lowDune, CREST_SHAPE.standout);
    expect(lines).toHaveLength(1);
    for (const p of lines[0]) expect(Math.abs(p.x - 30)).toBeLessThan(1.5);
  });

  it("leaves the same low lip unlined on a big slope", () => {
    expect(tracedAt((x) => lowDune(x) + 0.5 * x, CREST_SHAPE.standout)).toHaveLength(0);
  });

  it("leaves a soft low hump with no sharp edge unlined", () => {
    expect(tracedAt((x) => 0.6 * Math.exp(-(((x - 30) / 6) ** 2)), CREST_SHAPE.standout)).toHaveLength(0);
  });

  it("finds no crest on a plain slope", () => {
    expect(traced((x, y) => 0.2 * x + 0.1 * y)).toHaveLength(0);
  });

  it("lines the rims of a valley and never its bottom", () => {
    const lines = traced((x) => -ridge(x));
    expect(lines).toHaveLength(2);
    for (const p of lines.flat()) expect(Math.abs(p.x - 30)).toBeGreaterThan(4);
  });

  it("stores the offset to the line and thins it toward the ends", () => {
    const lines = traced(ridge);
    const field = crestField(lines, SIDE, METERS);
    const middle = (30 * SIDE + 32) * 4;
    expect(field[middle]).toBeCloseTo(-2 * METERS, 0);
    expect(field[middle + 3]).toBe(1);
    const end = lines[0][0];
    const nearEnd = (Math.round(end.y) * SIDE + Math.round(end.x)) * 4;
    expect(field[nearEnd + 3]).toBeLessThan(0.5);
  });

  it("measures the gap to the line between corners and draws nothing between two ridges", () => {
    const twin = (x: number) => ridge(x - 8) + ridge(x + 8);
    const lines = traced(twin);
    expect(lines).toHaveLength(2);
    const field = crestField(lines, SIDE, METERS);
    for (const y of [25.3, 30.5, 34.9]) {
      expect(crestGap(field, SIDE, METERS, { x: 38.6 * METERS, y: y * METERS }).across).toBeCloseTo(0.6 * METERS, 0);
      expect(crestGap(field, SIDE, METERS, { x: 30 * METERS, y: y * METERS }).across).toBeGreaterThan(6 * METERS);
    }
  });
});
