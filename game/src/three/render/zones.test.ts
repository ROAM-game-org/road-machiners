import { describe, expect, it } from 'vitest';
import { flatTerrain } from '../../test/empty-world';
import { ZonesView } from './zones';

function bandGeometries(view: ZonesView) {
  return view.root.children.slice(0, 3).map((m) => (m as unknown as { geometry: unknown }).geometry);
}

function bandPositions(view: ZonesView): number[][] {
  return view.root.children.slice(0, 3).map((m) => Array.from((m as unknown as { geometry: { attributes: { position?: { array: ArrayLike<number> } } } }).geometry.attributes.position?.array ?? []));
}

describe('ZonesView', () => {
  const terrain = flatTerrain(64);

  it('keeps the band geometry when nothing changed', () => {
    const view = new ZonesView();
    view.update(terrain, { x: 20, y: 20 }, 0.5, 3, 0.4);
    const before = bandGeometries(view);

    view.update(terrain, { x: 20, y: 20 }, 0.5, 3, 0.4);

    expect(bandGeometries(view)).toEqual(before);
    bandGeometries(view).forEach((g, i) => expect(g).toBe(before[i]));
  });

  it.each([
    ['position', (v: ZonesView) => v.update(terrain, { x: 21, y: 20 }, 0.5, 3, 0.4)],
    ['heading', (v: ZonesView) => v.update(terrain, { x: 20, y: 20 }, 0.6, 3, 0.4)],
    ['half angle', (v: ZonesView) => v.update(terrain, { x: 20, y: 20 }, 0.5, 3, 0.5)],
    ['terrain', (v: ZonesView) => v.update(flatTerrain(64), { x: 20, y: 20 }, 0.5, 3, 0.4)],
  ])('rebuilds the bands when the %s changes', (_name, change) => {
    const view = new ZonesView();
    view.update(terrain, { x: 20, y: 20 }, 0.5, 3, 0.4);
    const before = bandGeometries(view);

    change(view);

    expect(bandGeometries(view)[2]).not.toBe(before[2]);
  });

  it('gives the same vertices as a fresh build after a change', () => {
    const view = new ZonesView();
    view.update(terrain, { x: 20, y: 20 }, 0.5, 3, 0.4);
    view.update(terrain, { x: 22, y: 21 }, 1, 3, 0.4);
    const fresh = new ZonesView();
    fresh.update(terrain, { x: 22, y: 21 }, 1, 3, 0.4);

    expect(bandPositions(view)).toEqual(bandPositions(fresh));
  });

  it('collapses the braking and holding bands when the truck is stopped, then restores them', () => {
    const view = new ZonesView();
    view.update(terrain, { x: 20, y: 20 }, 0.5, 3, 0.4);
    const moving = view.root.children.slice(0, 3).map((m) => m.visible);

    view.update(terrain, { x: 20, y: 20 }, 0.5, 0, 0.4);
    const stopped = view.root.children.slice(0, 3).map((m) => m.visible);
    view.update(terrain, { x: 20, y: 20 }, 0.5, 3, 0.4);

    expect(stopped).toEqual([false, false, true]);
    expect(view.root.children.slice(0, 3).map((m) => m.visible)).toEqual(moving);
  });

  it('builds the hover ring once and only moves and hides it', () => {
    const view = new ZonesView();
    const ring = view.root.children[3] as unknown as { geometry: unknown; visible: boolean; position: { x: number } };
    const geometry = ring.geometry;

    view.hover(terrain, { x: 10, y: 10 }, 0xff0000);
    const first = ring.position.x;
    view.hover(terrain, { x: 12, y: 10 }, 0x00ff00);

    expect(ring.geometry).toBe(geometry);
    expect(ring.position.x).not.toBe(first);
    expect(ring.visible).toBe(true);
    view.hover(terrain, null, 0);
    expect(ring.visible).toBe(false);
  });
});
