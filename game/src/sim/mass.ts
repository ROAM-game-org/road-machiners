
import { chassisDef } from '../data/chassis';
import { CRATE_MASS, GOODS, PARCEL } from '../data/goods';
import { partDef } from '../data/parts';
import { RULES } from '../data/rules';
import { unitOfCells, unitsOf } from './body';
import { mountedMassShare } from './chassis-features';
import { isMounted, itemCells } from './grid';
import type { Loadout } from './loadout-memo';
import type { GridItem, Vehicle } from './types';

export function vehicleMass(v: Loadout): number {
  let mass = chassisDef(v.chassisId).mass;
  for (const it of v.items) mass += itemMass(it);
  return mass;
}

export function loadMass(v: Loadout): number {
  const share = mountedMassShare(v.chassisId);
  if (share === 1) return vehicleMass(v);
  let mass = chassisDef(v.chassisId).mass;
  for (const it of v.items) mass += itemMass(it) * (isMounted(v.chassisId, it) ? share : 1);
  return mass;
}

export function unitMasses(v: Vehicle): number[] {
  const all = unitsOf(v.chassisId);
  if (all.length === 1) return [vehicleMass(v)];
  const rows = all[all.length - 1].rows[1];
  const masses = all.map((u) => (chassisDef(v.chassisId).mass * (u.rows[1] - u.rows[0])) / rows);
  for (const it of v.items) masses[unitOfCells(v.chassisId, itemCells(it)).index] += itemMass(it);
  return masses;
}

export function loadFactor(v: Loadout, extraMass = 0): number {
  return loadFactorAt(v.chassisId, loadMass(v) + extraMass);
}

export function loadFactorAt(chassisId: string, mass: number): number {
  const ch = chassisDef(chassisId);
  const overload = mass > ch.ratedMass ? (ch.ratedMass / mass) ** RULES.overloadExponent : 1;
  return Math.sqrt(ch.handlingMass / mass) * overload;
}

export function itemMass(it: GridItem): number {
  if (it.kind === 'parcel') return PARCEL.mass;
  return it.kind === 'part' ? partDef(it.part.defId).mass : goodMass(it.good);
}

function goodMass(id: string): number {
  if (!GOODS[id]) throw new Error(`Unknown good ${id}`);
  return CRATE_MASS;
}
