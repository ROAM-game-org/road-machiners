import { CHASSIS } from '../data/chassis';
import { PARTS } from '../data/parts';
import { WEAPON_POOLS, weaponLook } from '../render/partLooks';
import { makePart } from '../sim/factory';
import { gridOf, MOUNT_CELLS, mountSpots } from '../sim/grid';
import { addVehicle, emptyWorld } from '../sim/testkit';
import type { GridItem } from '../sim/types';
import { faultsOf } from './truck-support-faults';

export const GUN_FILES = 20;

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

export type GunCase = { name: string; chassisId: string; defId: string; lookId: string };

export function gunCases(): GunCase[] {
  const guns = Object.values(PARTS).filter((def) => def.kind === 'weapon');
  return Object.keys(CHASSIS).flatMap((chassisId) =>
    guns.flatMap((def) => lookIds(def.id).map((lookId) => ({ name: `${def.id} ${lookId} on the ${chassisId}`, chassisId, defId: def.id, lookId }))),
  );
}

export function gunCasesOfFile(file: number): GunCase[] {
  return gunCases().filter((_, i) => i % GUN_FILES === file);
}

export function faultsOfGunLook({ chassisId, defId, lookId }: GunCase): string[] {
  const faults: string[] = [];
  const w = emptyWorld();
  const base = addVehicle(w, 'scrapjaw', chassisId, [], { x: 40, y: 30 });
  const probe: GridItem = { id: 'probe', kind: 'part', part: { ...makePart(w, defId, 0), id: lookId }, x: 0, y: 0, rot: 0 };
  for (const spot of mountSpots(gridOf(base), base.items, probe, MOUNT_CELLS.weapon)) {
    try {
      faults.push(...faultsOf({ ...base, items: [...base.items, { ...probe, ...spot }] }));
    } catch (e) {
      faults.push(`${chassisId} ${defId} ${JSON.stringify(weaponLook(lookId, defId))} @${spot.x},${spot.y} r${spot.rot}: ${(e as Error).message}`);
    }
  }
  return faults;
}
