
import { chassisDef } from '../data/chassis';
import { CRATE_MASS, GOODS, PARCEL } from '../data/goods';
import { partDef } from '../data/parts';
import { RULES } from '../data/rules';
import type { GridItem, Vehicle } from './types';

export function vehicleMass(v: Vehicle): number {
  let mass = chassisDef(v.chassisId).mass;
  for (const it of v.items) mass += itemMass(it);
  return mass;
}

export function loadFactor(v: Vehicle, extraMass = 0): number {
  const ch = chassisDef(v.chassisId);
  const mass = vehicleMass(v) + extraMass;
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
