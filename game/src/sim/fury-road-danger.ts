import { FURY_ROAD, GAME_MODES, type Line } from '../data/modes';
import { PARTS } from '../data/parts';
import { HAULER_KIT, startKit } from '../data/start';
import { enemyGearGrowth } from './settings';
import type { World } from './types';

const DANGER = FURY_ROAD.danger;

export function payOf(j: number): number {
  return lineAt(FURY_ROAD.pay.base, j);
}

function lineAt(line: Line, j: number): number {
  return line.first + line.step * (j - 1);
}

export function dangerPercent(world: World, j: number): number {
  requireStretch(j);
  return DANGER.firstPercent + DANGER.risePercent * enemyGearGrowth(world) * (j - 1);
}

export function enemyTrucks(world: World, j: number): number {
  const danger = dangerPercent(world, j);
  return Math.max(1, Math.min(Math.ceil(danger / DANGER.truckPercent), Math.floor(danger / DANGER.truckFloorPercent)));
}

export function groupSizes(trucks: number): number[] {
  if (!Number.isInteger(trucks) || trucks < 1) throw new Error(`A stretch needs a whole number of trucks above 0, not ${trucks}`);
  const groups = Math.ceil(trucks / DANGER.groupMax);
  const base = Math.floor(trucks / groups);
  return Array.from({ length: groups }, (_, i) => base + (i < trucks % groups ? 1 : 0));
}

export function expectedGear(world: World, j: number): number {
  requireStretch(j);
  let paid = 0;
  for (let k = 1; k < j; k++) paid += payOf(k);
  return startGear() + DANGER.gearShare * paid;
}

export function gearMoneyOf(world: World, j: number): number {
  const percent = Math.min(dangerPercent(world, j) / enemyTrucks(world, j), DANGER.truckPercent);
  return Math.max(DANGER.truckFloor, Math.round((percent / 100) * expectedGear(world, j)));
}

function startGear(): number {
  const id = GAME_MODES.furyRoad.kit;
  if (id === null) throw new Error('Fury Road has no start kit to measure the player gear from');
  const kit = startKit(id);
  const defs = [...kit.parts, ...(kit.placed ?? []).map((p) => p.defId), ...HAULER_KIT.parts];
  return defs.reduce((sum, defId) => sum + PARTS[defId].value, 0);
}

function requireStretch(j: number): void {
  if (!Number.isInteger(j) || j < 1) throw new Error(`Stretch ${j} is not a stretch`);
}
