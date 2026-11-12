import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { surroundColors } from "./groundSurround";

const SAND = new THREE.Color(0.8, 0.6, 0.4);
const MUD = new THREE.Color(0.05, 0.04, 0.03);

function colorAt(data: Float32Array, cells: number, x: number, y: number): number[] {
  const at = (y * cells + x) * 4;
  return [data[at], data[at + 1], data[at + 2]];
}

describe("ground surround colors", () => {
  it("keeps one plain material at its own color", () => {
    const { cells, data } = surroundColors(new Uint8Array(40 * 40), 40, [SAND]);
    for (const [x, y] of [[0, 0], [7, 13], [cells - 1, cells - 1]]) {
      const [r, g, b] = colorAt(data, cells, x, y);
      expect(r).toBeCloseTo(SAND.r, 5);
      expect(g).toBeCloseTo(SAND.g, 5);
      expect(b).toBeCloseTo(SAND.b, 5);
    }
  });

  it("shows a small mud pit in sand as mostly sand", () => {
    const side = 60;
    const materials = new Uint8Array(side * side);
    for (let y = 28; y < 32; y++) for (let x = 28; x < 32; x++) materials[y * side + x] = 1;
    const { cells, data } = surroundColors(materials, side, [SAND, MUD]);
    const [r] = colorAt(data, cells, 15, 15);
    expect(r).toBeLessThan(SAND.r);
    expect(r).toBeGreaterThan(SAND.r * 0.9);
  });

  it("keeps a wide swamp at the swamp color in its middle", () => {
    const side = 80;
    const materials = new Uint8Array(side * side).fill(1);
    for (let y = 0; y < side; y++) for (let x = 0; x < 8; x++) materials[y * side + x] = 0;
    const { cells, data } = surroundColors(materials, side, [SAND, MUD]);
    const [r] = colorAt(data, cells, cells - 5, cells / 2);
    expect(r).toBeCloseTo(MUD.r, 5);
  });
});
