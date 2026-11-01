import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CHASSIS } from '../../data/chassis';
import { PARTS } from '../../data/parts';
import { makePart } from '../../sim/factory';
import { gridOf, isMounted, placementError } from '../../sim/grid';
import { addVehicle, emptyWorld } from '../../sim/testkit';
import type { GridItem } from '../../sim/types';
import { faultsOf } from '../../test/truck-support-faults';
import { SURFACE_ATLAS } from './models';
import type * as TruckMesh from './truckMesh';

vi.mock('./truckMesh', async (load) => (await import('../../test/truck-support-stills')).keepingStills(await load<typeof TruckMesh>()));

SURFACE_ATLAS.value = new THREE.Texture();

describe('engines on every legal cell', () => {
  it('every engine mounted on every legal cell and turn of every chassis stands on the truck', () => {
    const faults: string[] = [];
    const engines = Object.values(PARTS).filter((def) => def.kind === 'engine');
    for (const chassisId of Object.keys(CHASSIS)) {
      const w = emptyWorld();
      const base = addVehicle(w, 'scrapjaw', chassisId, [], { x: 40, y: 30 });
      const grid = gridOf(base);
      for (const def of engines) {
        const probe: GridItem = { id: 'probe', kind: 'part', part: makePart(w, def.id, 0), x: 0, y: 0, rot: 0 };
        for (let y = 0; y < grid.h; y++) {
          for (let x = 0; x < grid.w; x++) {
            for (const rot of [0, 1, 2, 3] as const) {
              const item = { ...probe, x, y, rot };
              if (placementError(grid, base.items, item, null) !== null || !isMounted(chassisId, item)) continue;
              faults.push(...faultsOf({ ...base, items: [...base.items, item] }));
            }
          }
        }
      }
    }
    expect(faults).toEqual([]);
  });
});
