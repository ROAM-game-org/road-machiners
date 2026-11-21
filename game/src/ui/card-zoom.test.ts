import { describe, expect, it } from "vitest";
import { CARD_ZOOM } from "../data/card-zoom";
import { WORLD_MAP } from "../data/minimap";
import { CardZoom, densityCap, fitZoom } from "./card-zoom";

const SCREEN = { width: 240, height: 125 };
const DRAWING = { width: 200, height: 100 };
const DENSITY = 46;

function zoomed(fit = 1): CardZoom {
  const zoom = new CardZoom();
  zoom.refit(fit, SCREEN, DRAWING, DENSITY);
  return zoom;
}

describe("card zoom fit", () => {
  it("caps the fit at one image pixel per device pixel, never under the floor", () => {
    expect(densityCap(0.923, 1)).toBeCloseTo(2.17, 2);
    expect(densityCap(0.923, 2)).toBe(CARD_ZOOM.minFitCap);
  });

  it("fits the tight axis", () => {
    expect(fitZoom({ width: 400, height: 100 }, { width: 100, height: 100 }, 5)).toBe(1);
    expect(fitZoom({ width: 100, height: 400 }, { width: 100, height: 100 }, 5)).toBe(1);
    expect(fitZoom({ width: 400, height: 400 }, { width: 100, height: 100 }, 2)).toBe(2);
  });

  it("throws on an impossible size", () => {
    expect(() => fitZoom({ width: 0, height: 10 }, { width: 1, height: 1 }, 1)).toThrow();
    expect(() => fitZoom({ width: 10, height: 10 }, { width: NaN, height: 1 }, 1)).toThrow();
  });
});

describe("card zoom magnify", () => {
  it("starts at the fit and cannot zoom out", () => {
    const zoom = zoomed();
    expect(zoom.total()).toBe(1);
    expect(zoom.canZoomOut()).toBe(false);
    expect(zoom.canZoomIn()).toBe(true);
  });

  it("stops at the closest view", () => {
    const zoom = zoomed();
    zoom.zoomAt(100, { x: 0, y: 0 });
    expect(zoom.total() * DENSITY).toBeCloseTo(CARD_ZOOM.closestPxPerMeter, 5);
    expect(zoom.canZoomIn()).toBe(false);
    expect(zoom.canZoomOut()).toBe(true);
  });

  it("stops at the fit going out", () => {
    const zoom = zoomed();
    zoom.zoomAt(2, { x: 0, y: 0 });
    zoom.zoomAt(0.001, { x: 0, y: 0 });
    expect(zoom.total()).toBe(1);
    expect(zoom.pan()).toEqual({ x: 0, y: 0 });
  });

  it("keeps the point under the cursor fixed", () => {
    const zoom = zoomed();
    zoom.zoomAt(2, { x: 30, y: 10 });
    expect(zoom.total()).toBe(2);
    expect(zoom.pan()).toEqual({ x: -30, y: -10 });
  });

  it("steps by the map's button step", () => {
    const zoom = zoomed();
    zoom.step(1);
    expect(zoom.total()).toBe(WORLD_MAP.buttonStep);
    zoom.step(-1);
    expect(zoom.total()).toBe(1);
  });

  it("disables both keys when the fit already reaches the closest view", () => {
    const zoom = zoomed(CARD_ZOOM.closestPxPerMeter / DENSITY);
    expect(zoom.canZoomIn()).toBe(false);
    expect(zoom.canZoomOut()).toBe(false);
  });

  it("throws on a bad factor and before the first refit", () => {
    const zoom = zoomed();
    expect(() => zoom.zoomAt(NaN, { x: 0, y: 0 })).toThrow();
    expect(() => zoom.zoomAt(0, { x: 0, y: 0 })).toThrow();
    expect(() => new CardZoom().total()).toThrow();
  });
});

describe("card zoom pan", () => {
  it("clamps on a large axis and centers on a small one", () => {
    const zoom = zoomed();
    zoom.zoomAt(2, { x: 0, y: 0 });
    zoom.panBy(1000, -1000);
    expect(zoom.pan()).toEqual({ x: (400 - 240) / 2, y: -(200 - 125) / 2 });
    const small = zoomed(0.5);
    small.panBy(50, 50);
    expect(small.pan()).toEqual({ x: 0, y: 0 });
  });

  it("keeps the magnify and clamps the pan on a refit", () => {
    const zoom = zoomed();
    zoom.zoomAt(2, { x: 0, y: 0 });
    zoom.panBy(1000, 0);
    zoom.refit(1, { width: 380, height: 125 }, DRAWING, DENSITY);
    expect(zoom.total()).toBe(2);
    expect(zoom.pan().x).toBe(10);
  });

  it("lowers the magnify when the new fit leaves less room", () => {
    const zoom = zoomed();
    zoom.zoomAt(100, { x: 0, y: 0 });
    zoom.refit(2, SCREEN, DRAWING, DENSITY);
    expect(zoom.total() * DENSITY).toBeLessThanOrEqual(CARD_ZOOM.closestPxPerMeter + 1e-9);
  });

  it("resets to the fit", () => {
    const zoom = zoomed();
    zoom.zoomAt(3, { x: 10, y: 10 });
    zoom.reset();
    expect(zoom.total()).toBe(1);
    expect(zoom.pan()).toEqual({ x: 0, y: 0 });
  });
});
