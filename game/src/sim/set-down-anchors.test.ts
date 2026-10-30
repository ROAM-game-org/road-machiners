import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { atlasOf, atlasSites } from './atlas';
import { highwayMap } from './highway';
import { mapObstacles } from './mapgen';
import { CELL, componentOf, navLayer } from './nav/layer';
import { setDownAnchors } from './sites';
import type { BakedMap } from './terrain';
import { TEST_MAP } from '../test/map';

const RADII = [...new Set(Object.values(CHASSIS).map((c) => c.radius))];

function padComponents(map: BakedMap, radius: number): number[][] {
  const layer = navLayer(map.terrain, mapObstacles(map), radius);
  const cell = (p: { x: number; y: number }) => Math.floor(p.y / CELL) * layer.n + Math.floor(p.x / CELL);
  return atlasSites(atlasOf(map.terrain))
    .map((site) => setDownAnchors(site).map((pad) => componentOf(layer, cell(pad))));
}

describe('set-down anchors', () => {
  it('every anchor on Icarus has a nav component for every chassis radius', () => {
    for (const radius of RADII) {
      for (const components of padComponents(TEST_MAP, radius)) expect(components.every((c) => c !== 0), `radius ${radius}`).toBe(true);
    }
  });

  it('every anchor on the first highway outposts has a nav component for every chassis radius', () => {
    for (const window of [0, 1, 2, 3]) {
      for (const radius of RADII) {
        const pads = padComponents(highwayMap(3, window), radius);
        expect(pads.length, `window ${window}`).toBeGreaterThan(0);
        for (const components of pads) expect(components.every((c) => c !== 0), `window ${window} radius ${radius}`).toBe(true);
      }
    }
  });

  it('the anchors of Icarus sites share one component per radius', () => {
    for (const radius of RADII) {
      expect(new Set(padComponents(TEST_MAP, radius).flat()).size, `radius ${radius}`).toBe(1);
    }
  });
});
