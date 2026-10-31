import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { makePart } from '../../sim/factory';
import { addVehicle, emptyWorld } from '../../sim/testkit';
import type { GridItem } from '../../sim/types';
import { faultsOf } from '../../test/truck-support-faults';
import { standardWorld } from '../../test/world-cache';
import { SURFACE_ATLAS } from './models';
import type * as TruckMesh from './truckMesh';

vi.mock('./truckMesh', async (load) => {
  const real = await load<typeof TruckMesh>();
  const { stills } = await import('../../test/truck-support-stills');
  return {
    ...real,
    mergeParts: (group: THREE.Group, ...rest: [ReadonlySet<string>, 'armor' | 'parts']) => {
      stills.push(group.clone(true));
      return real.mergeParts(group, ...rest);
    },
  };
});

SURFACE_ATLAS.value = new THREE.Texture();

describe('truck support', () => {
  it('every drawn piece of every new-world truck stands on the truck', () => {
    const world = standardWorld(1337);
    const faults = world.vehicles.flatMap(faultsOf);
    expect(faults).toEqual([]);
  });
});

describe('guns the error report drew', () => {
  it('a harpoon stowed on the scout rear row and one beside the courier side window stand on the truck', () => {
    const faults: string[] = [];
    for (const [chassisId, spot] of [['scout', { x: 2, y: 12, rot: 1 }], ['courier', { x: 1, y: 3, rot: 0 }]] as const) {
      const w = emptyWorld();
      const base = addVehicle(w, 'scrapjaw', chassisId, [], { x: 40, y: 30 });
      const gun: GridItem = { id: 'harpoon', kind: 'part', part: makePart(w, 'harpoon', 0), ...spot };
      faults.push(...faultsOf({ ...base, items: [...base.items, gun] }));
    }
    expect(faults).toEqual([]);
  });
});
