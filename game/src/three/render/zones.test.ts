import { describe, expect, it } from 'vitest';
import { flatTerrain } from '../../test/empty-world';
import { ZonesView } from './zones';
import type * as THREE from 'three';
import { isCliff } from '../../sim/terrain';
import { TEST_MAP } from '../../test/map';

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

  it('lays every band vertex on a corner of the ground mesh, so a steep wall cannot cut through the band', () => {
    const steep = flatTerrain(64);
    steep.heights = steep.heights.map((_, k) => ((k * 7919) % 13) - 6);
    const view = new ZonesView();
    view.update(steep, { x: 20.3, y: 20.7 }, 0.5, 3, 0.4);
    const row = steep.size + 1;
    const lift = 0.1;

    for (const positions of bandPositions(view)) {
      expect(positions.length).toBeGreaterThan(0);
      for (let k = 0; k < positions.length; k += 3) {
        const x = positions[k] / 4;
        const y = positions[k + 2] / 4;
        expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
        expect(positions[k + 1]).toBeCloseTo(steep.heights[y * row + x] * 4 + lift, 6);
      }
    }
  });

  it('folds a cliff square along the same diagonal as the ground mesh', () => {
    const t = TEST_MAP.terrain;
    const row = t.size + 1;
    const corner = (x: number, y: number) => t.heights[y * row + x];
    let cliff: { x: number; y: number } | null = null;
    for (let y = 0; y < t.size && !cliff; y++)
      for (let x = 0; x < t.size && !cliff; x++)
        if (isCliff(t, y * t.size + x) && Math.abs(corner(x, y) - corner(x + 1, y + 1)) < Math.abs(corner(x + 1, y) - corner(x, y + 1))) cliff = { x, y };
    if (!cliff) throw new Error('No cliff square that folds along its rising diagonal');
    const view = new ZonesView();
    view.update(t, { x: cliff.x + 3.5, y: cliff.y + 0.5 }, Math.PI, 0, 0.4);
    const geometry = (view.root.children[2] as unknown as { geometry: THREE.BufferGeometry }).geometry;
    const pos = geometry.getAttribute('position');
    const index = geometry.getIndex()!;
    const key = (k: number) => `${pos.getX(k) / 4},${pos.getZ(k) / 4}`;
    const triangles = new Set<string>();
    for (let f = 0; f < index.count; f += 3) triangles.add([0, 1, 2].map((n) => key(index.getX(f + n))).sort().join(' '));
    const along = [`${cliff.x},${cliff.y}`, `${cliff.x},${cliff.y + 1}`, `${cliff.x + 1},${cliff.y + 1}`].sort().join(' ');

    expect(triangles.has(along)).toBe(true);
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
