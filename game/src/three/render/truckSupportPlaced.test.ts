import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CHASSIS } from '../../data/chassis';
import { PARTS } from '../../data/parts';
import { BODY_PARTS, WEAPON_POOLS, weaponLook } from '../../render/partLooks';
import { makePart } from '../../sim/factory';
import { gridOf, isMounted, itemCells, MOUNT_CELLS, mountSpots, placementError, type Grid } from '../../sim/grid';
import { addVehicle, emptyWorld } from '../../sim/testkit';
import type { GridItem } from '../../sim/types';
import { SLOW } from '../../test/gun-clearance-kit';
import { faultsOf } from '../../test/truck-support-faults';
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

function lookIds(defId: string): string[] {
  const slots = ['receiver', 'barrel', 'extra'] as const;
  const missing = new Set(WEAPON_POOLS[defId].mount.flatMap((mount) => slots.flatMap((slot) => WEAPON_POOLS[defId][slot].map((name) => `${mount}|${slot}|${name}`))));
  const ids: string[] = [];
  for (let n = 0; missing.size > 0; n++) {
    if (n > 10000) throw new Error(`No part ids cover every look of ${defId}`);
    const look = weaponLook(`look${n}`, defId);
    const keys = slots.flatMap((slot) => (look[slot] ? [`${look.mount}|${slot}|${look[slot]}`] : []));
    if (!keys.some((key) => missing.has(key))) continue;
    keys.forEach((key) => missing.delete(key));
    ids.push(`look${n}`);
  }
  return ids;
}

describe('guns on every deck cell', () => {
  it('a gun in every look on any legal cell and rotation of any truck builds and stands on the truck', { timeout: SLOW * 30 }, () => {
    const faults: string[] = [];
    const guns = Object.values(PARTS).filter((def) => def.kind === 'weapon');
    for (const chassisId of Object.keys(CHASSIS)) {
      const w = emptyWorld();
      const base = addVehicle(w, 'scrapjaw', chassisId, [], { x: 40, y: 30 });
      for (const def of guns) {
        for (const id of lookIds(def.id)) {
          const probe: GridItem = { id: 'probe', kind: 'part', part: { ...makePart(w, def.id, 0), id }, x: 0, y: 0, rot: 0 };
          for (const spot of mountSpots(gridOf(base), base.items, probe, MOUNT_CELLS.weapon)) {
            const v = { ...base, items: [...base.items, { ...probe, ...spot }] };
            try {
              faults.push(...faultsOf(v));
            } catch (e) {
              faults.push(`${chassisId} ${def.id} ${JSON.stringify(weaponLook(id, def.id))} @${spot.x},${spot.y} r${spot.rot}: ${(e as Error).message}`);
            }
          }
        }
      }
    }
    expect(faults).toEqual([]);
  });
});

describe('engines on every legal cell', () => {
  it('every engine mounted on every legal cell and turn of every chassis stands on the truck', { timeout: SLOW }, () => {
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

describe('small parts on every deck cell', () => {
  it.each(Object.keys(CHASSIS))('a caltrops box on any deck cell of the %s stands on the truck', { timeout: SLOW }, (chassisId) => {
    const faults: string[] = [];
    const w = emptyWorld();
    const base = addVehicle(w, 'scrapjaw', chassisId, [], { x: 40, y: 30 });
    const box = makePart(w, 'caltrops', 0);
    const probe: GridItem = { id: 'probe', kind: 'part', part: box, x: 0, y: 0, rot: 0 };
    for (const spot of mountSpots(gridOf(base), base.items, probe, MOUNT_CELLS.store)) {
      faults.push(...faultsOf({ ...base, items: [...base.items, { ...probe, ...spot }] }));
    }
    expect(faults).toEqual([]);
  });
});

function atEdge(grid: Grid, item: GridItem): boolean {
  const letter = grid.cells[item.y][item.x];
  return itemCells(item).some(({ x, y }) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => grid.cells[y + dy]?.[x + dx] !== letter)));
}

describe('mounted small parts on every edge cell', () => {
  it('every mounted cargo, scanner, store and utility part on every legal edge cell and turn of every chassis stands on the truck', { timeout: SLOW * 10 }, () => {
    const faults: string[] = [];
    const kinds = new Set(['cargo', 'scanner', 'store', 'utility']);
    const defs = Object.values(PARTS).filter((def) => kinds.has(def.kind) && !BODY_PARTS.has(def.id));
    for (const chassisId of Object.keys(CHASSIS)) {
      const w = emptyWorld();
      const base = addVehicle(w, 'scrapjaw', chassisId, [], { x: 40, y: 30 });
      const grid = gridOf(base);
      for (const def of defs) {
        const probe: GridItem = { id: 'probe', kind: 'part', part: makePart(w, def.id, 0), x: 0, y: 0, rot: 0 };
        for (let y = 0; y < grid.h; y++) {
          for (let x = 0; x < grid.w; x++) {
            for (const rot of [0, 1] as const) {
              const item = { ...probe, x, y, rot };
              if (placementError(grid, base.items, item, null) !== null || !isMounted(chassisId, item) || !atEdge(grid, item)) continue;
              faults.push(...faultsOf({ ...base, items: [...base.items, item] }));
            }
          }
        }
      }
    }
    expect(faults).toEqual([]);
  });
});
