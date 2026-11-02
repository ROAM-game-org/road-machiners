import { OLD_PLACES, type OldPlaceType } from '../data/salvage';
import { isKnockedOut } from './defeat';
import { hasCargoRoom } from './inventory';
import { recall } from './memory';
import { createActivity, createSiteActivity } from './npc-activities';
import { decide, holdFull, keepsWord, knownUnfit, lootTaken, npcProfile, salvageSitesAway } from './npc-decisions';
import { chance, randInt } from './rng';
import { backedOff, canReachSalvage, canTakeAny, canTakeFromTruck, oldSpotsNear, oldStockId, type OldSpotPick } from './salvage';
import { isTerritory } from './sites';
import { spotGoal, territoryAt, territorySpots } from './territory';
import { inTowReach } from './tow';
import type { GoalReason, NpcActivity, SalvageStock, Vehicle, World } from './types';
import { dist, type Vec } from './vec';
import { canVehicleSee } from './vision';

export function visibleSalvage(world: World, vehicle: Vehicle): SalvageStock[] {
  const stripped = strippedStocks(vehicle);
  const visible = world.salvage.filter((stock) => seesSalvage(world, vehicle, stock, stripped));
  return visible.sort((a, b) => dist(vehicle.pos, a.pos) - dist(vehicle.pos, b.pos));
}

export function visibleDowned(world: World, vehicle: Vehicle): Vehicle[] {
  const visible = world.vehicles.filter((v) => seesDowned(world, vehicle, v));
  return visible.sort((a, b) => dist(vehicle.pos, a.pos) - dist(vehicle.pos, b.pos));
}

export function seesDowned(world: World, vehicle: Vehicle, target: Vehicle): boolean {
  if (target.id === vehicle.id || !isKnockedOut(target) || !seesLoot(world, vehicle, target.id, target.pos)) return false;
  return (!inTowReach(vehicle, target) || canTakeFromTruck(vehicle, target)) && lootTaken(world, vehicle, target.id) === null;
}

function seesLoot(world: World, vehicle: Vehicle, id: string, pos: Vec): boolean {
  return !knownUnfit(vehicle, id) && canVehicleSee(world, vehicle, pos);
}

export function seesStock(world: World, vehicle: Vehicle, stock: SalvageStock): boolean {
  return seesSalvage(world, vehicle, stock, strippedStocks(vehicle));
}

function strippedStocks(vehicle: Vehicle): ReadonlySet<string> {
  return new Set(recall(vehicle, 'stripped').map((m) => m.fact.stock));
}

function seesSalvage(world: World, vehicle: Vehicle, stock: SalvageStock, stripped: ReadonlySet<string>): boolean {
  return !passesUpStock(vehicle, stock, stripped) && canVehicleSee(world, vehicle, stock.pos) && couldTakeFrom(world, vehicle, stock);
}

function passesUpStock(vehicle: Vehicle, stock: SalvageStock, stripped: ReadonlySet<string>): boolean {
  return stripped.has(stock.id) || backedOff(stock, vehicle.id) || knownUnfit(vehicle, stock.id);
}

function couldTakeFrom(world: World, vehicle: Vehicle, stock: SalvageStock): boolean {
  return (!canReachSalvage(vehicle, stock) || canTakeAny(world, vehicle, stock)) && lootTaken(world, vehicle, stock.id) === null;
}

export function takeableStocks(world: World, vehicle: Vehicle, stocks: readonly SalvageStock[]): SalvageStock[] {
  const stripped = strippedStocks(vehicle);
  return stocks.filter((stock) => !passesUpStock(vehicle, stock, stripped) && couldTakeFrom(world, vehicle, stock));
}

export function workableSpots(world: World, vehicle: Vehicle): SalvageStock[] {
  if (!hasCargoRoom(vehicle) || holdFull(vehicle)) return [];
  const territory = territoryAt(vehicle.pos);
  if (!territory || !npcProfile(vehicle).salvageSites.includes(territory.id)) return [];
  return takeableStocks(world, vehicle, territorySpots(world, territory.id));
}

export function scavengeGoal(world: World, vehicle: Vehicle): NpcActivity {
  const stock = visibleSalvage(world, vehicle)[0];
  const truck = visibleDowned(world, vehicle)[0];
  if (truck && (!stock || dist(vehicle.pos, truck.pos) < dist(vehicle.pos, stock.pos))) return createActivity('loot', truck.id, { ...truck.pos }, 'lootDowned');
  if (stock) return createActivity('scavenge', stock.id, { ...stock.pos }, 'collectSalvage');
  return siteGoal(world, vehicle);
}

function siteGoal(world: World, vehicle: Vehicle): NpcActivity {
  const sites = salvageSitesAway(vehicle);
  if (sites.length === 0) throw new Error(`${vehicle.id} chose to scavenge with no salvage known`);
  const old = oldSpotGoal(world, vehicle);
  if (old) return old;
  const site = sites[randInt(world, 0, sites.length - 1)];
  return isTerritory(site) ? spotGoal(world, site.id, takeableStocks(world, vehicle, territorySpots(world, site.id))) : createSiteActivity('scavenge', site.id, 'searchSite');
}

const OLD_SPOT_GOALS: Record<OldPlaceType, GoalReason> = {
  homestead: 'searchOldRuin',
  hamlet: 'searchOldRuin',
  lookout: 'searchOldRuin',
  hulks: 'searchOldHulks',
  boats: 'searchOldBoats',
  wreckage: 'searchOldWreckage',
};

function oldSpotGoal(world: World, vehicle: Vehicle): NpcActivity | null {
  const near = takeableOldSpots(world, vehicle, oldSpotsNear(world, vehicle.pos, OLD_PLACES.npcRange));
  if (near.length === 0 || !chance(world, OLD_PLACES.npcShare)) return null;
  const pick = near[randInt(world, 0, near.length - 1)];
  return createActivity('scavenge', oldStockId(pick), { ...pick.pos }, OLD_SPOT_GOALS[pick.type]);
}

function takeableOldSpots(world: World, vehicle: Vehicle, near: OldSpotPick[]): OldSpotPick[] {
  const stocks = near.map((pick) => world.salvage.find((stock) => stock.id === oldStockId(pick)));
  const takeable = new Set(takeableStocks(world, vehicle, stocks.filter((stock) => stock !== undefined)).map((stock) => stock.id));
  const kept = near.filter((pick) => takeable.has(oldStockId(pick)));
  return kept.length > 0 ? kept : near;
}

export function workSpotGoal(world: World, vehicle: Vehicle): NpcActivity | null {
  const spots = workableSpots(world, vehicle);
  if (spots.length === 0 || leftOutOfReach(world, vehicle) || keepsWord(world, vehicle, 'spotWork', null) || decide(world, vehicle, 'spotWork', null, null) === 'moveOn') return null;
  const spot = spots.reduce((a, b) => (dist(vehicle.pos, b.pos) < dist(vehicle.pos, a.pos) ? b : a));
  return createActivity('scavenge', spot.id, { ...spot.pos }, 'searchSpot');
}

function leftOutOfReach(world: World, vehicle: Vehicle): boolean {
  return world.events.some((e) => e.t === 'activity' && e.vehicle === vehicle.id && e.reason === 'salvageOutOfReach');
}
