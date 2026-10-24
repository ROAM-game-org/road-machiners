import { CHASSIS_FEATURES, chassisDef, type ChassisAbility } from '../data/chassis';
import { isShield, type PartDef } from '../data/parts';

export function chassisAbility(chassisId: string): ChassisAbility | null {
  chassisDef(chassisId);
  return CHASSIS_FEATURES[chassisId] ?? null;
}

function factor(chassisId: string, pick: (a: ChassisAbility) => number | undefined): number {
  const ability = chassisAbility(chassisId);
  return ability ? (pick(ability) ?? 1) : 1;
}

function bonus(chassisId: string, pick: (a: ChassisAbility) => number | undefined): number {
  const ability = chassisAbility(chassisId);
  return ability ? (pick(ability) ?? 0) : 0;
}

export const topSpeedFactor = (chassisId: string) => factor(chassisId, (a) => a.topSpeed);
export const accelFactor = (chassisId: string) => factor(chassisId, (a) => a.accel);
export const gunPowerFactor = (chassisId: string) => factor(chassisId, (a) => a.gunPower);
export const sightFactor = (chassisId: string) => factor(chassisId, (a) => a.sight);
export const rangeFactor = (chassisId: string) => factor(chassisId, (a) => a.range);
export const mountedMassShare = (chassisId: string) => factor(chassisId, (a) => a.mountedMass);
export const cargoRowFactor = (chassisId: string) => factor(chassisId, (a) => a.cargoRows);
export const offRoadWear = (chassisId: string) => factor(chassisId, (a) => a.offRoadWear);

export const bedRows = (chassisId: string) => bonus(chassisId, (a) => a.bedRows);
export const nimbleSpread = (chassisId: string) => bonus(chassisId, (a) => a.nimble);
export const offRoadCut = (chassisId: string) => bonus(chassisId, (a) => a.offRoadCut);
export const arcBonus = (chassisId: string) => bonus(chassisId, (a) => a.arc);
export const reloadCut = (chassisId: string) => bonus(chassisId, (a) => a.reloadCut);

export function partArmorBonus(chassisId: string, def: PartDef, onDeck: boolean): number {
  if (isShield(def)) return 0;
  return bonus(chassisId, (a) => a.partArmor) + (onDeck ? bonus(chassisId, (a) => a.deckArmor) : 0);
}

export function chassisTopSpeed(chassisId: string): number {
  return chassisDef(chassisId).maxSpeed * topSpeedFactor(chassisId);
}
