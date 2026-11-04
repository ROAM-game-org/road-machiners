import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { makePart } from '../../sim/factory';
import { gridOf, isMounted, placementError } from '../../sim/grid';
import type { GridItem, Vehicle, World } from '../../sim/types';
import { bare } from '../../test/gun-clearance-kit';
import { faultsOf } from '../../test/truck-support-faults';
import { stills } from '../../test/truck-support-stills';
import { SURFACE_ATLAS } from './models';
import type * as TruckMesh from './truckMesh';
import { itemSpotOf } from './vehicle';
import { unitsOf } from '../../sim/body';

vi.mock('./truckMesh', async (load) => (await import('../../test/truck-support-stills')).keepingStills(await load<typeof TruckMesh>()));

SURFACE_ATLAS.value = new THREE.Texture();

function caltropsAt(world: World, v: Vehicle, hp: number, x: number, y: number, rot: 0 | 1 | 2 | 3): GridItem {
  return { id: 'garage-p89', kind: 'part', part: { ...makePart(world, 'caltrops', 0), id: 'p89', hp }, x, y, rot };
}

function withItem(v: Vehicle, item: GridItem): Vehicle {
  return { ...v, items: [...v.items, item] };
}

function strutsDrawn(v: Vehicle): number {
  return stills.slice(0, unitsOf(v.chassisId).length).flatMap((still) => still.children).filter((o) => o.name === 'garage-p89 leg' || o.name === 'garage-p89 brace').length;
}

describe('a worn part on legs', () => {
  it('builds on the struts its spot planned when it is broken at the spot of the crash report', () => {
    const { world, v } = bare('convertible');
    const truck = withItem(v, caltropsAt(world, v, 0, 1, 7, 1));
    expect(faultsOf(truck)).toEqual([]);
    expect(strutsDrawn(truck)).toBeGreaterThan(0);
  });

  it('plans the same spot and struts whatever the wear', () => {
    const { world, v } = bare('convertible');
    const base = new THREE.Group();
    const worn = itemSpotOf(v, caltropsAt(world, v, 0, 1, 7, 1), base);
    const fresh = itemSpotOf(v, caltropsAt(world, v, makePart(world, 'caltrops', 0).hp, 1, 7, 1), base);
    expect(worn).toEqual(fresh);
  });

  it('builds a broken caltrops on every legal mount cell of the convertible without a support fault', () => {
    const { world, v } = bare('convertible');
    const grid = gridOf(v);
    const faults: string[] = [];
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        for (const rot of [0, 1, 2, 3] as const) {
          const item = caltropsAt(world, v, 0, x, y, rot);
          if (placementError(grid, v.items, item, null) !== null || !isMounted(v.chassisId, item)) continue;
          faults.push(...faultsOf(withItem(v, item)));
        }
      }
    }
    expect(faults).toEqual([]);
  });
});
