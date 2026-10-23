
import { ECONOMY } from '../data/goods';
import { EFFORT } from '../data/market';
import { RULES } from '../data/rules';
import { playerVehicle } from './damage';
import { skillEffect, vehicleHasPerk } from './progress';
import { townNear } from './sites';
import type { Vehicle, World } from './types';

function restsNow(world: World, me: Vehicle): boolean {
  return me.speed <= RULES.parkedSpeed || vehicleHasPerk(world, me, 'longHaul');
}

export function maxHealthOf(world: World): number {
  return Math.round(RULES.maxHealth * (1 + skillEffect(world, playerVehicle(world), 'toughness', 'maxHealth')));
}

export function firstAidSupplies(): number {
  return ((RULES.townHealMult - 1) * RULES.healPerTurn * EFFORT.wage[1]) / ECONOMY.supplyPrice.supplies;
}

export function firstAidTurnSupplies(world: World): number {
  return RULES.healSupplies + (townNear(world) ? 0 : firstAidSupplies());
}

export function firstAidTurns(world: World): number {
  const missing = Math.max(0, maxHealthOf(world) - world.player.health);
  return Math.ceil(missing / (RULES.healPerTurn * RULES.townHealMult));
}

export function healPlayer(world: World): void {
  const p = world.player;
  const max = maxHealthOf(world);
  if (p.state === 'dead' || p.health <= 0 || p.supplies <= 0 || p.health >= max) return;
  const me = playerVehicle(world);
  if (!restsNow(world, me)) return;
  const dressing = me.job?.kind === 'firstAid';
  const townRate = RULES.healPerTurn * RULES.townHealMult;
  const rate = townNear(world) || dressing ? townRate : RULES.healPerTurn;
  p.health = Math.min(max, p.health + rate);
  const spent = dressing ? firstAidTurnSupplies(world) : RULES.healSupplies;
  p.supplies = Math.max(0, p.supplies - spent);
}
