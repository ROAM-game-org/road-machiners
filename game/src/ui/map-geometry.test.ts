import { describe, expect, it } from 'vitest';
import { canvasTransform, clampPan, fitted, fitTileSize, openingTileSize, panBy, pinToEdge, scaleBarTiles, toPx, toTile, viewport, wheelZoomFactor, zoomAround, type Viewport } from './map-geometry';

const MAP = 600;

function view(center: { x: number; y: number }, tileSize: number, width = 400, height = 300): Viewport {
  return viewport(center, tileSize, width, height);
}

describe('map geometry', () => {
  it('draws north up: map north is straight above and map east is to the right', () => {
    const v = view({ x: 100, y: 100 }, 2);
    const mid = toPx(v, { x: 100, y: 100 });
    expect(mid.x).toBeCloseTo(200);
    expect(mid.y).toBeCloseTo(150);
    const north = toPx(v, { x: 100, y: 99 });
    expect(north.x).toBeCloseTo(200);
    expect(north.y).toBeCloseTo(148);
    const east = toPx(v, { x: 101, y: 100 });
    expect(east.x).toBeCloseTo(202);
    expect(east.y).toBeCloseTo(150);
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

  it('fits the square map into the shorter side with all four corners inside', () => {
    expect(fitTileSize(MAP, 400, 300)).toBeCloseTo(300 / MAP);
    const v = fitted(MAP, 400, 300, { x: 10, y: 590 });
    expect(v.center).toEqual({ x: 300, y: 300 });
    for (const corner of [{ x: 0, y: 0 }, { x: MAP, y: 0 }, { x: MAP, y: MAP }, { x: 0, y: MAP }]) {
      const at = toPx(v, corner);
      expect(at.x).toBeGreaterThanOrEqual(-1e-6);
      expect(at.x).toBeLessThanOrEqual(400 + 1e-6);
      expect(at.y).toBeGreaterThanOrEqual(-1e-6);
      expect(at.y).toBeLessThanOrEqual(300 + 1e-6);
    }
    expect(toPx(v, { x: 0, y: 0 }).x).toBeCloseTo(50);
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
    expect(pinned.x).toBeCloseTo(194);
    const direct = toPx(v, far);
    expect((pinned.y - 100) / (pinned.x - 100)).toBeCloseTo((direct.y - 100) / (direct.x - 100));
    const near = pinToEdge(v, { x: 110, y: 100 }, 6);
    expect(near.pinned).toBe(false);
    expect(near.x).toBeCloseTo(110);
    expect(near.y).toBeCloseTo(100);
  });

  it('throws on a tile size that is not a positive number', () => {
    expect(() => view({ x: 0, y: 0 }, 0)).toThrow(/tile size/);
    expect(() => view({ x: 0, y: 0 }, Number.NaN)).toThrow(/tile size/);
  });
});

describe('scale bar', () => {
  const metersOf = (tileSize: number, width: number) => scaleBarTiles(tileSize, width) * 4;

  it('opens the map tab at a 1 km bar, zoomed in from the whole map', () => {
    for (const [width, height] of [[1200, 450], [1600, 700], [700, 500]]) {
      const tileSize = openingTileSize(780, width, height, 8);
      expect(metersOf(tileSize, width)).toBe(1000);
      expect(tileSize).toBeGreaterThan(fitTileSize(780, width, height));
    }
  });

  it('never opens zoomed out past the whole map or in past the top scale', () => {
    expect(openingTileSize(780, 300, 300, 8)).toBe(fitTileSize(780, 300, 300));
    expect(openingTileSize(20, 1200, 450, 8)).toBe(8);
  });

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

describe('wheelZoomFactor', () => {
  it('zooms one step for a mouse notch in either direction', () => {
    expect(wheelZoomFactor(-100, 0)).toBeCloseTo(1.25);
    expect(wheelZoomFactor(100, 0)).toBeCloseTo(1 / 1.25);
  });

  it('zooms by how far the wheel turns, not by how many events it sends', () => {
    let total = 1;
    for (let i = 0; i < 20; i++) total *= wheelZoomFactor(-4, 0);
    expect(total).toBeCloseTo(wheelZoomFactor(-80, 0));
    expect(total).toBeLessThan(1.25);
  });

  it('never zooms more than one notch in one event', () => {
    expect(wheelZoomFactor(-5000, 0)).toBeCloseTo(1.25);
    expect(wheelZoomFactor(5000, 0)).toBeCloseTo(1 / 1.25);
  });

  it('reads line and page deltas as larger turns', () => {
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(wheelZoomFactor(-99, 0));
    expect(wheelZoomFactor(-1, 2)).toBeCloseTo(1.25);
  });

  it('throws on a delta it cannot read', () => {
    expect(() => wheelZoomFactor(Number.NaN, 0)).toThrow();
    expect(() => wheelZoomFactor(1, 7)).toThrow();
  });
});
