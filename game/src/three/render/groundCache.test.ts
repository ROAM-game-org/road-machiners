import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { exposedAreas, visibleArea, wrapped, type Area } from "./groundCache";
import { groundDetailPx } from "./groundDetail";

function viewOf(halfWidth: number): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfWidth * 0.625, -halfWidth * 0.625, 1, 500);
  camera.position.set(40, 60, 40);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

describe("ground detail level", () => {
  it("holds within a zoom bucket and steps by powers of two", () => {
    const near = groundDetailPx(viewOf(20), 1600, 1000);
    expect(Number.isInteger(Math.log2(near))).toBe(true);
    expect(groundDetailPx(viewOf(21), 1600, 1000)).toBe(near);
    expect(groundDetailPx(viewOf(40), 1600, 1000)).toBe(near * 2);
    expect(groundDetailPx(viewOf(20), 800, 500)).toBe(near * 2);
  });
});

const W = 40;
const H = 30;
const MARGIN = 4;

function pixels(areas: Area[]): Set<string> {
  const out = new Set<string>();
  for (const a of areas) for (let x = a.x.from; x < a.x.to; x++) for (let y = a.y.from; y < a.y.to; y++) out.add(`${x},${y}`);
  return out;
}

describe("ground cache areas", () => {
  it("draws exactly the pixels a pan brings into view, margin included", () => {
    for (const [dx, dy] of [[3, 0], [0, -2], [5, 7], [-6, 4], [-1, -1]]) {
      const was = visibleArea(10, 20, W, H, MARGIN);
      const now = visibleArea(10 + dx, 20 + dy, W, H, MARGIN);
      const drawn = pixels(exposedAreas(was, now));
      const kept = pixels([was]);
      const wanted = [...pixels([now])].filter((p) => !kept.has(p));
      expect(wanted.every((p) => drawn.has(p))).toBe(true);
      expect([...drawn].every((p) => pixels([now]).has(p))).toBe(true);
      expect([...drawn].filter((p) => kept.has(p))).toEqual([]);
    }
  });

  it("redraws the whole view when a pan jumps past the old view", () => {
    const was = visibleArea(0, 0, W, H, MARGIN);
    const now = visibleArea(W + 2 * MARGIN, 0, W, H, MARGIN);
    expect(exposedAreas(was, now)).toEqual([now]);
  });

  it("splits a span at each wrap of the cache and keeps every pixel once", () => {
    const size = W + 2 * MARGIN;
    const pieces = wrapped({ from: -7, to: 2 * size + 5 }, size);
    expect(pieces.map((p) => p.wrap)).toEqual([-1, 0, 1, 2]);
    for (const p of pieces) {
      expect(p.from - p.wrap * size).toBeGreaterThanOrEqual(0);
      expect(p.to - p.wrap * size).toBeLessThanOrEqual(size);
    }
    expect(pieces.reduce((sum, p) => sum + p.to - p.from, 0)).toBe(2 * size + 12);
  });
});
