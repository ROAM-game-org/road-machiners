import { describe, expect, it } from 'vitest';
import { canvasTransform, clampPan, fitted, fitTileSize, panBy, pinToEdge, toPx, toTile, viewport, zoomAround, type Viewport } from './map-geometry';

const MAP = 600;

function view(center: { x: number; y: number }, tileSize: number, width = 400, height = 300): Viewport {
  return viewport(center, tileSize, width, height);
}

const R = Math.SQRT1_2;

describe('map geometry', () => {
  it('draws compass north up: map north-west is straight above and map east is to the lower right', () => {
    const v = view({ x: 100, y: 100 }, 2);
    const mid = toPx(v, { x: 100, y: 100 });
    expect(mid.x).toBeCloseTo(200);
    expect(mid.y).toBeCloseTo(150);
    const up = toPx(v, { x: 99, y: 99 });
    expect(up.x).toBeCloseTo(200);
    expect(up.y).toBeCloseTo(150 - 2 * Math.SQRT2);
    const east = toPx(v, { x: 101, y: 100 });
    expect(east.x).toBeCloseTo(200 + 2 * R);
    expect(east.y).toBeCloseTo(150 + 2 * R);
    const northEast = toPx(v, { x: 101, y: 99 });
    expect(northEast.x).toBeCloseTo(200 + 2 * Math.SQRT2);
    expect(northEast.y).toBeCloseTo(150);
  });

  it.each([
    [{ x: 321, y: 77 }, 3.5],
    [{ x: 10, y: 590 }, 0.4],
    [{ x: 300, y: 300 }, 8],
  ])('inverts the transform when picking, centre %j at %d px a tile', (center, tileSize) => {
    const v = view(center, tileSize);
    const at = toPx(v, { x: 123, y: 456 });
    const back = toTile(v, at.x, at.y);
    expect(back.x).toBeCloseTo(123);
    expect(back.y).toBeCloseTo(456);
  });

  it('matches the canvas transform to the point transform', () => {
    const v = view({ x: 50, y: 60 }, 1.5);
    const [a, b, c, d, e, f] = canvasTransform(v);
    for (const p of [{ x: 70, y: 20 }, { x: 0, y: 0 }, { x: 590, y: 33 }]) {
      const px = toPx(v, p);
      expect(a * p.x + c * p.y + e).toBeCloseTo(px.x);
      expect(b * p.x + d * p.y + f).toBeCloseTo(px.y);
    }
  });

  it('fits the turned map into the shorter side with all four corners inside', () => {
    expect(fitTileSize(MAP, 400, 300)).toBeCloseTo(300 / (MAP * Math.SQRT2));
    const v = fitted(MAP, 400, 300, { x: 10, y: 590 });
    expect(v.center).toEqual({ x: 300, y: 300 });
    for (const corner of [{ x: 0, y: 0 }, { x: MAP, y: 0 }, { x: MAP, y: MAP }, { x: 0, y: MAP }]) {
      const at = toPx(v, corner);
      expect(at.x).toBeGreaterThanOrEqual(-1e-6);
      expect(at.x).toBeLessThanOrEqual(400 + 1e-6);
      expect(at.y).toBeGreaterThanOrEqual(-1e-6);
      expect(at.y).toBeLessThanOrEqual(300 + 1e-6);
    }
    expect(toPx(v, { x: 0, y: 0 }).x).toBeCloseTo(200);
    expect(toPx(v, { x: 0, y: 0 }).y).toBeCloseTo(0);
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
    expect(zoomAround(v, 0.5, 200, 150, MAP, 8).tileSize).toBeCloseTo(fitTileSize(MAP, 400, 300));
    expect(zoomAround(view({ x: 300, y: 300 }, 6), 4, 200, 150, MAP, 8).tileSize).toBe(8);
  });

  it('moves the land with the pointer when dragged', () => {
    const v = view({ x: 300, y: 300 }, 2);
    const p = { x: 250, y: 280 };
    const before = toPx(v, p);
    const after = toPx(panBy(v, 10, -6, MAP), p);
    expect(after.x - before.x).toBeCloseTo(10);
    expect(after.y - before.y).toBeCloseTo(-6);
  });

  it('keeps the view centre inside the map square at any pan', () => {
    for (const [dx, dy] of [[10000, -10000], [-10000, 10000], [10000, 10000], [-10000, -10000]]) {
      const c = panBy(view({ x: 300, y: 300 }, 2), dx, dy, MAP).center;
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(MAP);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThanOrEqual(MAP);
    }
  });

  it('centres an axis the viewport holds whole', () => {
    const v = clampPan(view({ x: 10, y: 10 }, 0.4, 400, 400), MAP);
    expect(v.center.x).toBeCloseTo(MAP / 2);
    expect(v.center.y).toBeCloseTo(MAP / 2);
    const wide = clampPan(view({ x: 10, y: 10 }, 0.4, 700, 200), MAP);
    const mid = toPx(wide, { x: MAP / 2, y: MAP / 2 });
    expect(mid.x).toBeCloseTo(350);
  });

  it('pins a far site on the edge, on the line from the centre to it', () => {
    const v = view({ x: 100, y: 100 }, 1, 200, 200);
    const far = { x: 500, y: 300 };
    const pinned = pinToEdge(v, far, 6);
    expect(pinned.pinned).toBe(true);
    expect(pinned.y).toBeCloseTo(194);
    const direct = toPx(v, far);
    expect((pinned.y - 100) / (pinned.x - 100)).toBeCloseTo((direct.y - 100) / (direct.x - 100));
    const near = pinToEdge(v, { x: 110, y: 100 }, 6);
    expect(near.pinned).toBe(false);
    expect(near.x).toBeCloseTo(100 + 10 * R);
    expect(near.y).toBeCloseTo(100 + 10 * R);
  });

  it('throws on a tile size that is not a positive number', () => {
    expect(() => view({ x: 0, y: 0 }, 0)).toThrow(/tile size/);
    expect(() => view({ x: 0, y: 0 }, Number.NaN)).toThrow(/tile size/);
  });
});
