
import { NPC_BEHAVIOR, NPC_UPKEEP, NPCS, SPAWN } from '../data/npcs';
import { SHOPS, shopDef } from '../data/market';
import { REGION } from '../data/region';
import { RULES } from '../data/rules';
import { isDefeated, refitAtHome } from './defeat';
import { fuelRoomAt, scrapFuel, serviceAtCamp, serviceAtStall, serviceVehicle } from './economy';
import { charCodes, chooseNearestSite, createSiteActivity, dropGoal, finishGoal, noteShop, popGoal, pushGoal, reachSite, saleGoal, topGoal } from './npc-activities';
import { dealDue } from './npc-business';
import { vehicleById } from './damage';
import { fitToHunt, getKnownSite, hasSaleCargo, huntsPrey, npcProfile, yields, type NpcProfile } from './npc-decisions';
import { isDamaged, isStrandedForGood } from './npc-repair';
import { getResources } from './resources';
import { hashRandom } from './rng';
import { heatAt } from './sun';
import { ECONOMY } from '../data/goods';
import { route } from './path';
import { randRange } from './rng';
import { canUseSite, type Site } from './sites';
import { isFree } from './spawn';
import { isStranded, suppliesCap, vehicleStats } from './stats';
import { isOnRope } from './tow';
import type { GoalReason, NpcActivity, Vehicle, World } from './types';
import { dist, type Vec } from './vec';

export function servingSiteIds(profile: NpcProfile): string[] {
  return profile.bases.length > 0 ? profile.bases : REGION.towns.map((t) => t.id);
}

export function serveStranded(world: World, vehicle: Vehicle, profile: NpcProfile): void {
  if (!parkedStranded(world, vehicle) || holdsRearm(vehicle)) return;
  const site = servingSiteIds(profile).map(getKnownSite).find((s) => canUseSite(vehicle.pos, s));
  if (!site) return;
  serviceAt(world, vehicle, site);
  scrapFuelIfBroke(world, vehicle, profile, site.id);
  if (isStranded(world, vehicle)) beginRearm(world, vehicle, site);
}

function parkedStranded(world: World, vehicle: Vehicle): boolean {
  return isStranded(world, vehicle) && !isOnRope(world, vehicle.id) && vehicle.speed <= RULES.parkedSpeed;
}

function scrapFuelIfBroke(world: World, vehicle: Vehicle, profile: NpcProfile, siteId: string): void {
  if (isBroke(world, vehicle) && servingSiteIds(profile).includes(siteId)) scrapFuel(world, vehicle);
}

export function resolveResupply(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  const site = reachSite(vehicle, activity);
  if (!dealDue(world, vehicle, activity, site)) return;
  noteShop(world, vehicle, site.id);
  const profile = npcProfile(vehicle);
  serviceAt(world, vehicle, site);
  scrapFuelIfBroke(world, vehicle, profile, site.id);
  if (needsFreshGear(world, vehicle) && servingSiteIds(profile).includes(site.id)) {
    popGoal(world, vehicle, 'finishedService');
    beginRearm(world, vehicle, site);
  } else finishGoal(world, vehicle, 'finishedService');
}

function serviceAt(world: World, vehicle: Vehicle, site: Site): void {
  const kind = 'kind' in site ? site.kind : null;
  if (kind === 'camp') serviceAtCamp(world, vehicle, site.id, NPC_UPKEEP.repairParts);
  else if (shopDef(site.id).kind === 'stall') serviceAtStall(world, vehicle, site.id, NPC_UPKEEP.repairParts);
  else serviceVehicle(world, vehicle, site.id, NPC_UPKEEP.repairParts);
}

function needsFreshGear(world: World, vehicle: Vehicle): boolean {
  return isDefeated(vehicle) || isStranded(world, vehicle) || (huntsPrey(vehicle) && !fitToHunt(world, vehicle));
}

export function holdsRearm(vehicle: Vehicle): boolean {
  return vehicle.brain!.goals.some((g) => g.kind === 'rearm');
}

function rearmTurns(vehicle: Vehicle): number {
  const template = NPCS[vehicle.brain!.templateId];
  if (!template) throw new Error(`${vehicle.id} has unknown template ${vehicle.brain!.templateId}`);
  return template.cap * template.interval;
}

export function beginRearm(world: World, vehicle: Vehicle, site: Site): void {
  if (!servingSiteIds(npcProfile(vehicle)).includes(site.id)) throw new Error(`${vehicle.id} cannot lie up at ${site.id}`);
  const retreat = vehicle.brain!.goals.find((g) => g.kind === 'retreat');
  if (retreat) dropGoal(world, vehicle, retreat, 'homeToLieUp');
  if (holdsRearm(vehicle)) return;
  const until = world.turn + rearmTurns(vehicle);
  pushGoal(world, vehicle, { kind: 'rearm', targetId: site.id, destination: lieUpSpot(world, vehicle, site), phase: 'travel', reason: 'lieUp', until });
}

export function lieUpSpot(world: World, vehicle: Vehicle, site: Site): Vec {
  if (isStranded(world, vehicle)) return { ...vehicle.pos };
  for (let i = 0; i < SPAWN.tries; i++) {
    const spot = tryLieUpSpot(world, vehicle, site);
    if (spot) return spot;
  }
  return { ...vehicle.pos };
}

function tryLieUpSpot(world: World, vehicle: Vehicle, site: Site): Vec | null {
  const { gap, spacing } = NPC_BEHAVIOR.lieUp;
  const radius = vehicleStats(world, vehicle).radius;
  const angle = randRange(world, 0, Math.PI * 2);
  const d = site.radius + randRange(world, gap.min, gap.max);
  const spot = { x: site.pos.x + Math.cos(angle) * d, y: site.pos.y + Math.sin(angle) * d };
  if (canUseSite(spot, site) || !isFree(world, spot, radius + spacing, vehicle.id)) return null;
  const end = route(world, vehicle.pos, spot, radius, [], vehicle).at(-1) ?? vehicle.pos;
  return dist(end, spot) <= RULES.arriveRadius ? spot : null;
}

export function liesUp(vehicle: Vehicle): boolean {
  const top = topGoal(vehicle);
  const lying = top?.kind === 'rearm' || (top?.kind === 'wait' && top.reason === 'restHollow');
  return lying && dist(vehicle.pos, top.destination!) <= NPC_BEHAVIOR.lieUp.reach;
}

export function rearmInvalid(world: World, vehicle: Vehicle): GoalReason | null {
  return needsFreshGear(world, vehicle) ? null : 'fitAgain';
}

export function resolveRearm(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  if (activity.until === undefined) throw new Error(`${vehicle.id} lies up with no until turn`);
  if (!liesUp(vehicle)) return;
  activity.phase = 'act';
  if (world.turn < activity.until) return;
  refitAtHome(world, vehicle);
  finishGoal(world, vehicle, 'refitted');
}

type ServiceNeed = { reason: GoalReason };

function unfitHunter(world: World, vehicle: Vehicle): boolean {
  return huntsPrey(vehicle) && !fitToHunt(world, vehicle);
}

export function pumpsOf(vehicle: Vehicle, profile: NpcProfile, broke: boolean): string[] {
  if (broke) return servingSiteIds(profile);
  if (profile.bases.length > 0) return profile.bases;
  if (profile.towns.length === 0) throw new Error(`${vehicle.id} knows no pump`);
  return [...profile.towns, ...SERVICE_STALLS];
}

const SERVICE_STALLS: readonly string[] = Object.values(SHOPS).filter((s) => s.kind === 'stall').map((s) => s.id);

function fuelSense(world: World, vehicle: Vehicle): number {
  const roll = hashRandom(world.seed, ...charCodes(vehicle.id), ...charCodes('fuel'));
  return 1 + NPC_UPKEEP.fuelSense * (2 * roll - 1);
}

export function fuelForWay(world: World, vehicle: Vehicle, profile: NpcProfile, via: readonly Vec[]): number {
  const stops = [vehicle.pos, ...via];
  const last = stops[stops.length - 1];
  const pump = chooseNearestSite({ pos: last }, pumpsOf(vehicle, profile, isBroke(world, vehicle)));
  const tiles = stops.reduce((sum, stop, i) => sum + (i === 0 ? 0 : dist(stops[i - 1], stop)), 0) + dist(last, pump.pos);
  const need = tiles * vehicleStats(world, vehicle).fuelPerTile * heatAt(world, vehicle.pos) * NPC_UPKEEP.fuelReserve * profile.fuelMargin * fuelSense(world, vehicle);
  if (!Number.isFinite(need)) throw new Error(`${vehicle.id} has no finite fuel need`);
  return need;
}

export function fuelReserveFor(world: World, vehicle: Vehicle, profile: NpcProfile = npcProfile(vehicle)): number {
  return fuelForWay(world, vehicle, profile, []);
}

export function legEnd(world: World, vehicle: Vehicle): Vec | null {
  const goal = topGoal(vehicle);
  if (!goal) return null;
  if (goal.kind !== 'follow') return goal.destination;
  const leader = goal.targetId ? vehicleById(world, goal.targetId) : undefined;
  if (!leader?.brain) return null;
  const leaderGoal = topGoal(leader);
  return leaderGoal && leaderGoal.kind !== 'follow' && leaderGoal.destination ? leaderGoal.destination : leader.pos;
}

function pumpHere(vehicle: Vehicle, profile: NpcProfile): Site | null {
  return pumpsOf(vehicle, profile, false).map(getKnownSite).find((site) => canUseSite(vehicle.pos, site)) ?? null;
}

function canBuyFuelAt(world: World, vehicle: Vehicle, pump: Site): boolean {
  return getResources(world, vehicle).money >= ECONOMY.supplyPrice.fuel && fuelRoomAt(world, vehicle, pump.id) > 0;
}

function shortForLeg(world: World, vehicle: Vehicle, profile: NpcProfile): boolean {
  if (isBroke(world, vehicle)) return false;
  const pump = pumpHere(vehicle, profile);
  const end = pump && legEnd(world, vehicle);
  if (!pump || !end) return false;
  return getResources(world, vehicle).fuel <= fuelForWay(world, vehicle, profile, [end]) && canBuyFuelAt(world, vehicle, pump);
}

export const isLowOnFuel = (world: World, vehicle: Vehicle, profile: NpcProfile): boolean =>
  getResources(world, vehicle).fuel <= fuelReserveFor(world, vehicle, profile) || shortForLeg(world, vehicle, profile);

function serviceNeed(world: World, vehicle: Vehicle, profile: NpcProfile): ServiceNeed | null {
  if (holdsRearm(vehicle) || !yields(world)) return null;
  const needs: [GoalReason, boolean][] = [
    ['lowFuel', isLowOnFuel(world, vehicle, profile)],
    ['lowSupplies', getResources(world, vehicle).supplies <= suppliesCap(vehicle) * NPC_UPKEEP.lowSupplies],
    ['needsRepairs', isDamaged(vehicle)],
    ['unfitToHunt', unfitHunter(world, vehicle)],
  ];
  const held = needs.filter(([, need]) => need).map(([reason]) => reason);
  if (held.length === 0) return null;
  return { reason: held[0] };
}

export function isBroke(world: World, vehicle: Vehicle): boolean {
  return getResources(world, vehicle).money < Math.min(ECONOMY.supplyPrice.fuel, ECONOMY.supplyPrice.supplies);
}

export function serviceGoal(world: World, vehicle: Vehicle, profile: NpcProfile): NpcActivity | null {
  const need = serviceNeed(world, vehicle, profile);
  if (!need) return null;
  if (isBroke(world, vehicle)) return brokeServiceGoal(world, vehicle, profile, need);
  return serviceTrip(world, vehicle, profile, need);
}

function brokeServiceGoal(world: World, vehicle: Vehicle, profile: NpcProfile, need: ServiceNeed): NpcActivity | null {
  if (hasSaleCargo(vehicle)) return saleGoal(world, vehicle, profile);
  const trip = isStranded(world, vehicle) || isLowOnFuel(world, vehicle, profile) || unfitHunter(world, vehicle);
  return trip ? serviceTrip(world, vehicle, profile, need) : null;
}

function serviceTrip(world: World, vehicle: Vehicle, profile: NpcProfile, need: ServiceNeed): NpcActivity {
  const stop = chooseNearestSite(vehicle, serviceStops(world, vehicle, profile));
  if (!stop) throw new Error(`${vehicle.id} knows no service stop`);
  return createSiteActivity('resupply', stop.id, need.reason);
}

function serviceStops(world: World, vehicle: Vehicle, profile: NpcProfile): string[] {
  if (profile.bases.length > 0) return profile.bases;
  if (isStrandedForGood(vehicle)) return servingSiteIds(profile);
  return pumpsOf(vehicle, profile, isBroke(world, vehicle));
}
