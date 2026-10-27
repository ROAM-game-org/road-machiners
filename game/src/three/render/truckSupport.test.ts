import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CHASSIS, PAINT } from '../../data/chassis';
import { isShield, PARTS, partDef } from '../../data/parts';
import { BODY_PARTS, WEAPON_POOLS, weaponLook } from '../../render/partLooks';
import { unitsOf } from '../../sim/body';
import { makePart } from '../../sim/factory';
import { gridOf, isMounted, MOUNT_CELLS, mountSpots, placementError } from '../../sim/grid';
import { addVehicle, emptyWorld } from '../../sim/testkit';
import type { GridItem, Vehicle } from '../../sim/types';
import { SLOW } from '../../test/gun-clearance-kit';
import { supportFaults, type Piece, type Stand } from '../../test/truck-support-kit';
import { standardWorld } from '../../test/world-cache';
import { SURFACE_ATLAS } from './models';
import type * as TruckMesh from './truckMesh';
import { hidesInside, VehicleView } from './vehicle';

const stills: THREE.Group[] = [];

vi.mock('./truckMesh', async (load) => {
  const real = await load<typeof TruckMesh>();
  return {
    ...real,
    mergeParts: (group: THREE.Group, ...rest: [ReadonlySet<string>, 'armor' | 'parts']) => {
      stills.push(group.clone(true));
      return real.mergeParts(group, ...rest);
    },
  };
});

SURFACE_ATLAS.value = new THREE.Texture();

const STANDS: Record<string, Stand> = { mount: 'corners', leg: 'tip', brace: 'brace' };

function faultsOf(v: Vehicle): string[] {
  stills.length = 0;
  const view = new VehicleView(v, true, PAINT.standard, 'world');
  const units = unitsOf(v.chassisId).length;
  const out: string[] = [];
  stills.slice(0, units).forEach((still, unit) => {
    const [base, ...rest] = still.children;
    const standing = rest.filter((obj) => !sideArmor(v, itemOf(v, obj.name)) && !obj.name.endsWith(' head'));
    const onLegs = (name: string) => standing.some((o) => o.name === `${name} leg` || o.name === `${name} brace`);
    const pieces: Piece[] = standing.map((obj) => ({ name: label(v, obj.name), obj, stand: STANDS[obj.name.split(' ')[1]] ?? (onLegs(obj.name) ? 'corners' : 'underside') }));
    const antenna = view.root.getObjectByName('antenna');
    if (antenna && unit === 0) pieces.push({ name: 'antenna', obj: antenna, stand: 'underside' });
    for (const f of supportFaults(pieces, [base, ...rest.filter((o) => !standing.includes(o))])) {
      out.push(`${v.chassisId} ${v.id} unit ${unit} ${f.name} stands on ${(f.share * 100).toFixed(0)}% with up to ${(f.air * 100).toFixed(1)} cm of air at ${f.at.toArray().map((n) => n.toFixed(2)).join(',')}`);
    }
  });
  const drawn = new Set(stills.slice(0, units).flatMap((still) => still.children.map((o) => o.name.split(' ')[0])));
  for (const item of v.items.filter((it) => mustShow(v, it) && !drawn.has(it.id))) out.push(`${v.chassisId} ${v.id} hides ${label(v, item.id)}`);
  return out;
}

function mustShow(v: Vehicle, item: GridItem): boolean {
  if (item.kind !== 'part' || !isMounted(v.chassisId, item) || hidesInside(v, item)) return false;
  const def = partDef(item.part.defId);
  return !BODY_PARTS.has(def.id) && !(def.kind === 'core' && def.role === 'wheel') && def.kind !== 'weapon';
}

function itemOf(v: Vehicle, name: string): GridItem | undefined {
  const [id] = name.split(' ');
  return v.items.find((it) => it.id === id || (it.kind === 'part' && it.part.id === id));
}

function sideArmor(v: Vehicle, item: GridItem | undefined): boolean {
  return item?.kind === 'part' && isShield(partDef(item.part.defId)) && isMounted(v.chassisId, item);
}

function label(v: Vehicle, name: string): string {
  const item = itemOf(v, name);
  if (!item) return `unnamed ${name}`;
  const role = name.split(' ')[1] ?? '';
  const what = item.kind === 'part' ? partDef(item.part.defId).id : item.kind === 'good' ? item.good : 'parcel';
  const mounted = isMounted(v.chassisId, item) ? 'mounted' : 'loose';
  return `${what} ${role} ${mounted} @${item.x},${item.y} r${item.rot}`;
}

describe('truck support', () => {
  it('every drawn piece of every new-world truck stands on the truck', { timeout: SLOW }, () => {
    const world = standardWorld(1337);
    const faults = world.vehicles.flatMap(faultsOf);
    expect(faults).toEqual([]);
  });
});

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
  it('a caltrops box on any deck cell of any truck stands on the truck', { timeout: SLOW }, () => {
    const faults: string[] = [];
    for (const chassisId of Object.keys(CHASSIS)) {
      const w = emptyWorld();
      const base = addVehicle(w, 'scrapjaw', chassisId, [], { x: 40, y: 30 });
      const box = makePart(w, 'caltrops', 0);
      const probe: GridItem = { id: 'probe', kind: 'part', part: box, x: 0, y: 0, rot: 0 };
      for (const spot of mountSpots(gridOf(base), base.items, probe, MOUNT_CELLS.store)) {
        faults.push(...faultsOf({ ...base, items: [...base.items, { ...probe, ...spot }] }));
      }
    }
    expect(faults).toEqual([]);
  });
});
