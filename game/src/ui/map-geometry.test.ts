import { describe, expect, it } from 'vitest';
import { canvasTransform, clampPan, fitted, fitTileSize, panBy, pinToEdge, scaleBarTiles, toPx, toTile, viewport, zoomAround, type Viewport } from './map-geometry';

const MAP = 600;

function view(center: { x: number; y: number }, tileSize: number, width = 400, height = 300): Viewport {
  return viewport(center, tileSize, width, height);
}

describe('map geometry', () => {
  it('draws north up: a tile east is right and a tile north is above, at the same distance', () => {
    const v = view({ x: 100, y: 100 }, 2);
    const mid = toPx(v, { x: 100, y: 100 });
    expect(mid).toEqual({ x: 200, y: 150 });
    const east = toPx(v, { x: 101, y: 100 });
    const north = toPx(v, { x: 100, y: 99 });
    expect(east).toEqual({ x: 202, y: 150 });
    expect(north).toEqual({ x: 200, y: 148 });
  });

  it('inverts the transform when picking', () => {
    const v = view({ x: 321, y: 77 }, 3.5);
    const at = toPx(v, { x: 123, y: 456 });
    const back = toTile(v, at.x, at.y);
    expect(back.x).toBeCloseTo(123);
    expect(back.y).toBeCloseTo(456);
  });

  it('matches the canvas transform to the point transform', () => {
    const v = view({ x: 50, y: 60 }, 1.5);
    const [a, b, c, d, e, f] = canvasTransform(v);
    const p = { x: 70, y: 20 };
    expect({ x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f }).toEqual(toPx(v, p));
  });

  it('fits the whole map into the shorter side and centres it', () => {
    expect(fitTileSize(MAP, 400, 300)).toBe(0.5);
    const v = fitted(MAP, 400, 300, { x: 10, y: 590 });
    expect(v.center).toEqual({ x: 300, y: 300 });
    expect(toPx(v, { x: 0, y: 0 }).y).toBeCloseTo(0);
    expect(toPx(v, { x: 0, y: MAP }).y).toBeCloseTo(300);
  });

  it('zooms about a canvas point and keeps the tile under it', () => {
    const v = view({ x: 300, y: 300 }, 1);
    const before = toTile(v, 120, 90);
    const z = zoomAround(v, 2, 120, 90, MAP, 8);
    expect(z.tileSize).toBe(2);
    const after = toTile(z, 120, 90);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('keeps the zoom between the fitted scale and the top scale', () => {
    const v = fitted(MAP, 400, 300, { x: 300, y: 300 });
    expect(zoomAround(v, 0.5, 200, 150, MAP, 8).tileSize).toBe(0.5);
    expect(zoomAround(view({ x: 300, y: 300 }, 6), 4, 200, 150, MAP, 8).tileSize).toBe(8);
  });

  it('stops the pan at the map edge on an axis the map overfills', () => {
    const v = panBy(view({ x: 300, y: 300 }, 2), 10000, -10000, MAP);
    expect(toPx(v, { x: 0, y: 0 }).x).toBeCloseTo(0);
    expect(toPx(v, { x: MAP, y: MAP }).y).toBeCloseTo(300);
  });

  it('centres an axis the viewport holds whole', () => {
    const v = clampPan(view({ x: 10, y: 10 }, 0.6, 400, 400), MAP);
    expect(v.center.x).toBe(MAP / 2);
    expect(v.center.y).toBe(MAP / 2);
    const wide = clampPan(view({ x: 10, y: 10 }, 0.6, 600, 300), MAP);
    expect(wide.center.x).toBe(MAP / 2);
    expect(wide.center.y).toBe(250);
  });

  it('pins a far site on the edge, on the line from the centre to it', () => {
    const v = view({ x: 100, y: 100 }, 1, 200, 200);
    const far = { x: 500, y: 300 };
    const pinned = pinToEdge(v, far, 6);
    expect(pinned.pinned).toBe(true);
    expect(pinned.x).toBeCloseTo(194);
    const direct = toPx(v, far);
    expect((pinned.y - 100) / (pinned.x - 100)).toBeCloseTo((direct.y - 100) / (direct.x - 100));
    expect(pinToEdge(v, { x: 110, y: 100 }, 6)).toEqual({ x: 110, y: 100, pinned: false });
  });

  it('throws on a tile size that is not a positive number', () => {
    expect(() => view({ x: 0, y: 0 }, 0)).toThrow(/tile size/);
    expect(() => view({ x: 0, y: 0 }, Number.NaN)).toThrow(/tile size/);
  });
});

describe('scale bar', () => {
  const metersOf = (tileSize: number, width: number) => scaleBarTiles(tileSize, width) * 4;

  it('takes the longest step that fits its share of the width', () => {
    expect(metersOf(8, 1000)).toBe(100);
    expect(metersOf(1, 1000)).toBe(1000);
    expect(metersOf(0.2, 1000)).toBe(2000);
  });

  it('fits the minimap reaches at their canvas width', () => {
    const width = 220;
    expect(metersOf(fitTileSize(100, width, width), width)).toBe(100);
    expect(metersOf(fitTileSize(200, width, width), width)).toBe(100);
    expect(metersOf(fitTileSize(400, width, width), width)).toBe(250);
  });

  it('falls back to the shortest step when none fits', () => {
    expect(metersOf(100, 200)).toBe(50);
  });

  it('draws the labelled distance at the tile size', () => {
    expect(scaleBarTiles(8, 1000) * 8).toBeLessThanOrEqual(300);
  });

  it('throws on a tile size or width that is not positive', () => {
    expect(() => scaleBarTiles(0, 100)).toThrow();
    expect(() => scaleBarTiles(1, 0)).toThrow();
  });
});
