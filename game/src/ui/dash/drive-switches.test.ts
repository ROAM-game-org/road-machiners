import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BakedMeta, Quad } from "./baked";

const BOXES = new URL("./baked/", import.meta.url);
const DRIVE_SOURCE = new URL("../../../tools/hud-bake/parts/drive.js", import.meta.url);
const VIEWS = ["desktop", "flat"] as const;
const SWITCHES = [0, 1, 2] as const;
const LABELS = ["manual", "lights", "overdrive"] as const;

const read = (view: string): BakedMeta => JSON.parse(readFileSync(new URL(`drive.${view}.json`, BOXES), "utf8")) as BakedMeta;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const rectOf = (quad: Quad): Rect => ({
  x0: Math.min(...quad.map((p) => p[0])),
  y0: Math.min(...quad.map((p) => p[1])),
  x1: Math.max(...quad.map((p) => p[0])),
  y1: Math.max(...quad.map((p) => p[1])),
});

const overlap = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const centerX = (r: Rect) => (r.x0 + r.x1) / 2;
const centerY = (r: Rect) => (r.y0 + r.y1) / 2;

const switchRects = (meta: BakedMeta, i: number): Record<string, Rect> =>
  Object.fromEntries([LABELS[i], `on${i}`, `off${i}`, `lamp${i}`, `rockerHit${i}`].map((name) => [name, rectOf(meta.zones[name].quad)]));

describe.each(VIEWS)("drive switches, %s view", (view) => {
  const meta = read(view);
  const face = rectOf(meta.face);
  const windows = ["fuel", "heat"].map((name) => rectOf(meta.zones[name].quad));
  const windowsBottom = Math.max(...windows.map((r) => r.y1));

  it.each(SWITCHES)("switch %i has every zone", (i) => {
    for (const name of [LABELS[i], `on${i}`, `off${i}`, `lamp${i}`, `rockerHit${i}`]) expect(meta.zones[name], name).toBeDefined();
  });

  it.each(SWITCHES)("switch %i has a click target at least as large as the old one", (i) => {
    const [w, h] = meta.zones[`rockerHit${i}`].size;
    expect(w).toBeGreaterThanOrEqual(28);
    expect(h).toBeGreaterThanOrEqual(38);
  });

  it.each(SWITCHES)("switch %i stays inside the face and below the gauge windows", (i) => {
    for (const [name, r] of Object.entries(switchRects(meta, i))) {
      expect(r.x0, name).toBeGreaterThanOrEqual(face.x0);
      expect(r.x1, name).toBeLessThanOrEqual(face.x1);
      expect(r.y1, name).toBeLessThanOrEqual(face.y1);
      if (name !== `rockerHit${i}`) expect(r.y0, name).toBeGreaterThanOrEqual(windowsBottom);
    }
  });

  it.each([0, 1] as const)("column %i does not overlap the next column", (i) => {
    const here = Object.values(switchRects(meta, i));
    const next = Object.values(switchRects(meta, i + 1));
    for (const a of here) for (const b of next) expect(overlap(a, b)).toBe(false);
  });

  it.each(SWITCHES)("switch %i puts the lamp beside ON and ON above OFF on the lever axis", (i) => {
    const r = switchRects(meta, i);
    expect(centerX(r[`lamp${i}`])).toBeLessThan(r[`on${i}`].x0);
    expect(Math.abs(centerY(r[`lamp${i}`]) - centerY(r[`on${i}`]))).toBeLessThan(3);
    expect(r[`on${i}`].y1).toBeLessThanOrEqual(r[`off${i}`].y0);
    expect(Math.abs(centerX(r[`on${i}`]) - centerX(r[`off${i}`]))).toBeLessThan(1);
    expect(Math.abs(centerX(r[`on${i}`]) - centerX(r[`rockerHit${i}`]))).toBeLessThan(1);
  });
});

describe("drive part source", () => {
  it("bakes no words", () => {
    const source = readFileSync(DRIVE_SOURCE, "utf8");
    expect(source).not.toMatch(/fillText|printMesh/);
  });
});

describe.each(VIEWS)("drive heat lamp, %s view", (view) => {
  const meta = read(view);
  const lamp = rectOf(meta.zones.heatLamp.quad);
  const heat = rectOf(meta.zones.heat.quad);
  const fuel = rectOf(meta.zones.fuel.quad);
  const scale = meta.zones.heatLamp.size[0] / (lamp.x1 - lamp.x0);

  it("sits inside the heat glass, clear of every other zone", () => {
    expect(lamp.x0).toBeGreaterThanOrEqual(heat.x0);
    expect(lamp.x1).toBeLessThanOrEqual(heat.x1);
    expect(lamp.y0).toBeGreaterThanOrEqual(heat.y0);
    expect(lamp.y1).toBeLessThanOrEqual(heat.y1);
    for (const [name, zone] of Object.entries(meta.zones)) {
      if (name === "heatLamp" || name === "dial" || name === "heat") continue;
      expect(overlap(lamp, rectOf(zone.quad)), name).toBe(false);
    }
  });

  it("sits in the lower right of the glass, below the H end", () => {
    expect(centerX(lamp)).toBeGreaterThan(heat.x0 + 0.7 * (heat.x1 - heat.x0));
    expect(centerY(lamp)).toBeGreaterThan(heat.y0 + 0.7 * (heat.y1 - heat.y0));
  });

  it("leaves the two gauge glasses with equal tops and heights", () => {
    expect(Math.abs(fuel.y0 - heat.y0)).toBeLessThan(0.01);
    expect(Math.abs(fuel.y1 - heat.y1)).toBeLessThan(0.01);
  });
});
