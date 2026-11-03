import { SHOPS } from '../../data/market';
import { NPC_UPKEEP } from '../../data/npcs';
import { playerVehicle } from '../damage';
import { siteOf } from '../market';
import type { Site } from '../sites';
import { fuelCap, vehicleStats } from '../stats';
import { heatAt } from '../sun';
import type { World } from '../types';
import { dist, type Vec } from '../vec';

export const SHOP_SITES: readonly Site[] = Object.keys(SHOPS).map(siteOf);

export function fuelForWay(world: World, tiles: number): number {
  const me = playerVehicle(world);
  return tiles * vehicleStats(world, me).fuelPerTile * heatAt(world, me.pos) * NPC_UPKEEP.fuelReserve;
}

export function fuelReaches(world: World, site: Pick<Site, 'pos'>, from?: { pos: Vec; fuel: number }): boolean {
  const full = fuelCap(playerVehicle(world));
  let at = from ?? { pos: playerVehicle(world).pos, fuel: world.player.fuel };
  for (let step = 0; step <= SHOP_SITES.length; step++) {
    if (fuelForWay(world, dist(at.pos, site.pos)) <= at.fuel) return true;
    const stops = SHOP_SITES.filter((s) => fuelForWay(world, dist(at.pos, s.pos)) <= at.fuel && dist(s.pos, site.pos) < dist(at.pos, site.pos));
    const next = stops.reduce<Site | null>((best, s) => (!best || dist(s.pos, site.pos) < dist(best.pos, site.pos) ? s : best), null);
    if (!next) return false;
    at = { pos: next.pos, fuel: full };
  }
  return false;
}

export function reachable<T extends Site>(world: World, sites: readonly T[]): T[] {
  return sites.filter((s) => fuelReaches(world, s));
}
