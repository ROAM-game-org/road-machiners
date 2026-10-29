
import { LINGER } from '../data/linger';
import { lingersForMoment } from './moments';
import { lingerReasonNow } from './linger';
import { canPayBounty } from './crime';
import { dealAvailable } from './patch';
import { encounterAvailable } from './encounters';
import { canSpareFor } from './aid';
import { isLineGun } from '../data/parts';
import { ECONOMY } from '../data/goods';
import { ESCORT_JOB, SHOPS, graphEdges, type ShopDef } from '../data/market';
import { legRisk } from './road-news';
import { goodStock, goodValue, shopState, stockTarget } from './market';
import { routeThreat } from './escort-job';
import {
  CREW, DECISIONS, HELP_CALL, HUNT, MIN_CHANCE, NPCS, NPC_BEHAVIOR, NPC_UPKEEP, RESCUE_OPTIONS, SPAWN, STATE_WEIGHTS, TRAITS, YIELD_OPTIONS,
  type DecisionId, type DecisionOptions, type Trait, type TraitId, type TraitWeights, type Weighted, type WeightChange,
} from '../data/npcs';
import { REGION } from '../data/region';
import { modeRules } from './settings';
import { RULES } from '../data/rules';
import { awakeFoesOf, fightsAgainst, huntsForLoot, inCombatWithOther, inFeud, inTruce, isHostile } from './combat';
import { ramFactor, ramImpact } from './crash-contact';
import { isDefeated, isKnockedOut } from './defeat';
import { fightOdds, type FightOdds } from './fight-odds';
import { vehicleById } from './damage';
import { sensesOf } from './detect';
import { affordableBuyCount, getTradePrice, getUpkeepReserve } from './economy';
export { getUpkeepReserve } from './economy';
import { cargoRoom, hasCargoRoom } from './inventory';
import { hasPerceivedLoot, knowsCargo, perceivedLoad } from './look-over';
import { maxHp } from './wear';
import { corePart, freeCells, mountedParts } from './grid';
import { hasRansom, ransomOf } from './haul';
import { inDanger, topGoal } from './npc-activities';
import { sampleWeighted } from './npc-loadout';
import { getResources } from './resources';
import { skillEffect } from './progress';
import { randRange } from './rng';
import { remember } from './memory';
import { canReachSalvage, canTakeAny, canTakeFromTruck, CANNOT_HOLD, CLAIMED, claimOnly, hasSalvage, holdsClaim, lootBlocker, STRIPPED, worksOn } from './salvage';
import { passesUpLoot } from './loot-warning';
import { canUseSite, isTerritory, siteGates, siteUnder, type Site } from './sites';
import { territoryAt } from './territory';
import { seesDowned, seesStock, visibleDowned, visibleSalvage, workableSpots } from './loot-picks';
import { divideTurf, turfClaimants, worldHuntingSpots } from './hunting-spots';
import { addState, bindingStatesHeld, boundTo, endState, givesWord, isRobberyFeud, robbing, stateOf, statesHeld } from './states';
import { isStranded, vehicleStats } from './stats';
import { canHire, canTakeEscort, declineFactor, escortsOf, inTowReach, isOnRope, strandedAt, towSite } from './tow';
import { leaderToJoin } from './pairs';
import { ownSide, perceivedGroup } from './sides';
import { canJoin, canMuster, heldBackByCrew, joinFactor } from './crews';
import { companyOf, followersOf, followingOf } from './companies';
import type { Contact, GoalReason, NpcActivity, PassReason, Vehicle, World } from './types';
import { clamp, dist, type Vec } from './vec';
import { icarusAtlas } from './atlas';
import { canVehicleSee } from './vision';
import { huntsOffRoad } from './hunt-style';
import { postsOf } from './watch-posts';
import { keepsToItself } from './sunward';
import { bandAtLeast, bandToward, heedsCall, isAlly, isOutlaw, isRaider, lawCalls } from './relations';

export type NpcProfile = {
  towns: string[];
  bases: string[];
  markets: string[];
  salvageSites: string[];
  travelSites: string[];
  contactReactRadius: number;
  boldness: number;
  fuelMargin: number;
  robs: Trait['robs'];
  tradeStake: number;
};

export function npcTraits(v: Vehicle): TraitId[] {
  if (!v.brain) throw new Error(`${v.id} has no NPC brain`);
  const traits = v.brain.traits;
  if (!traits) throw new Error(`${v.id} has no traits`);
  for (const id of traits) if (!Object.hasOwn(TRAITS, id)) throw new Error(`${v.id} has unknown trait ${id}`);
  return traits;
}

export function hasTrait(v: Vehicle, id: TraitId): boolean {
  return npcTraits(v).includes(id);
}

export function profileOf(traits: TraitId[]): NpcProfile {
  if (traits.length === 0) throw new Error('A profile needs at least one trait');
  const defs = traits.map((id) => {
    if (!Object.hasOwn(TRAITS, id)) throw new Error(`Unknown trait ${id}`);
    return TRAITS[id];
  });
  const union = (key: 'towns' | 'bases' | 'markets' | 'salvageSites' | 'travelSites') => [...new Set(defs.flatMap((t) => t[key]))];
  return {
    towns: union('towns'),
    bases: union('bases'),
    markets: union('markets'),
    salvageSites: union('salvageSites'),
    travelSites: union('travelSites'),
    contactReactRadius: Math.max(...defs.map((t) => t.contactReactRadius)),
    boldness: defs.reduce((product, t) => product * t.boldness, 1),
    fuelMargin: defs.reduce((product, t) => product * t.fuelMargin, 1),
    robs: defs.some((t) => t.robs === 'never') ? 'never' : 'offDuty',
    tradeStake: Math.max(...defs.map((t) => t.tradeStake)),
  };
}

export function npcProfile(v: Vehicle): NpcProfile {
  return profileOf(npcTraits(v));
}

export function getKnownSite(id: string) {
  const site = [...REGION.towns, ...REGION.locations].find((entry) => entry.id === id);
  if (!site) throw new Error(`Unknown site ${id}`);
  return site;
}

export function getCombatCondition(world: World, vehicle: Vehicle): number {
  return isStranded(world, vehicle) ? 0 : bodyCondition(vehicle);
}

export function bodyCondition(vehicle: Vehicle): number {
  const cab = corePart(vehicle, 'cab');
  const parts = mountedParts(vehicle);
  const overall = parts.reduce((sum, part) => sum + part.hp / maxHp(part), 0) / parts.length;
  return Math.min(cab.hp / maxHp(cab), overall);
}

export function firepower(world: World, vehicle: Vehicle): number {
  return vehicleStats(world, vehicle).weapons.filter((weapon) => weapon.part.hp > 0 && !isLineGun(weapon.def)).reduce((sum, weapon) => sum + weapon.def.round.damage * weapon.def.rounds, 0);
}

export function fightOddsAgainst(world: World, vehicle: Vehicle, other: Vehicle): FightOdds {
  const ours = ownSide(world, vehicle);
  const mine = new Set(ours.map((v) => v.id));
  return fightOdds(world, ours, perceivedGroup(world, vehicle, other).filter((v) => !mine.has(v.id)));
}

export function strengthRatio(odds: FightOdds): number {
  return odds.win === 0 ? Infinity : (1 - odds.win) / odds.win;
}

export function judgeDanger(world: World, observer: Vehicle, other: Vehicle): number {
  return strengthRatio(fightOddsAgainst(world, observer, other));
}

export function perceiveDanger(world: World, observer: Vehicle, other: Vehicle): number {
  const spread = NPC_BEHAVIOR.dangerSpread;
  return judgeDanger(world, observer, other) * randRange(world, 1 - spread, 1 + spread);
}

export function dangerJoining(world: World, speaker: Vehicle, fighters: Vehicle[], friend: Vehicle, foes: Vehicle[]): number {
  const fighting = new Set(fighters.map((v) => v.id));
  const { leader, members } = companyOf(world, speaker);
  const company = new Set([leader, ...members].map((v) => v.id));
  const own = ownSide(world, speaker).filter((v) => !company.has(v.id) || fighting.has(v.id));
  const ours = new Map([...own, ...perceivedGroup(world, speaker, friend)].map((v) => [v.id, v]));
  const theirs = new Map(foes.flatMap((foe) => perceivedGroup(world, speaker, foe)).filter((v) => !ours.has(v.id)).map((v) => [v.id, v]));
  const spread = NPC_BEHAVIOR.dangerSpread;
  return strengthRatio(fightOdds(world, [...ours.values()], [...theirs.values()])) * randRange(world, 1 - spread, 1 + spread);
}

export function canAnswerCall(world: World, speaker: Vehicle, caller: Vehicle): boolean {
  const foes = awakeFoesOf(world, caller);
  if (foes.length === 0 || speaker.brain === null || !heedsCall(world, speaker, caller, foes)) return false;
  if (isDefeated(speaker) || isStranded(world, speaker) || inDanger(speaker)) return false;
  if (inCombatWithOther(world, speaker, caller.id) || isHostile(world, speaker, caller)) return false;
  if (keepsWord(world, speaker, 'helpCalled', caller.id)) return false;
  return callFighters(world, speaker, caller).length > 0;
}

function freeToJoin(world: World, member: Vehicle): boolean {
  if (holdsClaim(world, member.id)) return false;
  const following = followingOf(world, member);
  return bindingStatesHeld(world, member.id).every((state) => state === following);
}

function canFight(world: World, member: Vehicle, caller: Vehicle, foes: Vehicle[]): boolean {
  if (member.brain === null || isDefeated(member) || isStranded(world, member) || inDanger(member)) return false;
  if (firepower(world, member) <= 0 || inCombatWithOther(world, member, caller.id)) return false;
  return heedsCall(world, member, caller, foes) && freeToJoin(world, member);
}

export function callFighters(world: World, speaker: Vehicle, caller: Vehicle): Vehicle[] {
  const foes = awakeFoesOf(world, caller);
  const { leader, members } = companyOf(world, speaker);
  const crew = leader.id === speaker.id ? [speaker, ...members.filter((m) => canVehicleSee(world, speaker, m.pos))] : [speaker];
  return crew.filter((member) => canFight(world, member, caller, foes));
}

function advantageOf(danger: number): number {
  return danger > 0 ? 1 / danger : Infinity;
}

function oddsFactor(danger: number): number {
  const advantage = advantageOf(danger);
  return advantage > 1 ? Math.min(advantage, HELP_CALL.oddsCap) ** HELP_CALL.oddsPower : 1;
}

export function staysOutOfCall(world: World, speaker: Vehicle, caller: Vehicle, danger: number): boolean {
  if (!hasTrait(speaker, 'coward') || bandAtLeast(bandToward(world, speaker, caller), 'friendly')) return false;
  return advantageOf(danger) < HELP_CALL.cowardEdge;
}

function helpFactor(world: World, vehicle: Vehicle, _decision: DecisionId, subject: string | null, danger: number | null): number {
  if (danger === null) throw new Error(`${vehicle.id} weighs a call for help with no danger`);
  const caller = subjectOf(world, 'helpCalled', subject);
  if (lawCalls(vehicle, caller, awakeFoesOf(world, caller))) return HELP_CALL.law * oddsFactor(danger);
  const band = bandToward(world, vehicle, caller);
  const bandFactor = band === 'allied' ? HELP_CALL.allied : band === 'friendly' ? HELP_CALL.friendly : 1;
  return bandFactor * oddsFactor(danger);
}

export function isManageable(vehicle: Vehicle, danger: number): boolean {
  return danger <= NPC_BEHAVIOR.threatRatio * npcProfile(vehicle).boldness;
}

export function isWeak(world: World, vehicle: Vehicle): boolean {
  const threshold = topGoal(vehicle)?.kind === 'flee' ? NPC_BEHAVIOR.recoverCondition : NPC_BEHAVIOR.fleeCondition;
  return getCombatCondition(world, vehicle) <= threshold || getResources(world, vehicle).health / RULES.maxHealth <= threshold;
}

function badlyHurt(world: World, vehicle: Vehicle): boolean {
  const line = NPC_BEHAVIOR.recoverCondition;
  return getCombatCondition(world, vehicle) <= line || getResources(world, vehicle).health / RULES.maxHealth <= line;
}

export function huntsPrey(vehicle: Vehicle): boolean {
  return isRaider(vehicle);
}

export function fitToHunt(world: World, vehicle: Vehicle): boolean {
  if (isStranded(world, vehicle) || firepower(world, vehicle) <= 0) return false;
  const line = NPC_BEHAVIOR.recoverCondition;
  return bodyCondition(vehicle) > line && getResources(world, vehicle).health / RULES.maxHealth > line;
}

export function visibleHostiles(world: World, vehicle: Vehicle): Vehicle[] {
  const enemies = world.vehicles.filter((other) => other.id !== vehicle.id && isHostile(world, vehicle, other) && canVehicleSee(world, vehicle, other.pos));
  return enemies.sort((a, b) => dist(vehicle.pos, a.pos) - dist(vehicle.pos, b.pos));
}

export function usefulContacts(world: World, vehicle: Vehicle): Contact[] {
  return npcSenses(world, vehicle).contacts;
}

export function npcSenses(world: World, vehicle: Vehicle): { seen: Vehicle[]; contacts: Contact[] } {
  const radius = npcProfile(vehicle).contactReactRadius;
  const { seen, contacts } = sensesOf(world, vehicle, Infinity);
  const useful = contacts.filter((contact) => contact.radius <= radius);
  return { seen, contacts: useful.sort((a, b) => dist(vehicle.pos, a.center) - dist(vehicle.pos, b.center)) };
}

const WORK: readonly NpcActivity['kind'][] = ['scavenge', 'sell', 'trade', 'resupply', 'loot', 'repair', 'travel', 'claim', 'meet', 'patch', 'tow'];

function isBusy(vehicle: Vehicle): boolean {
  const kind = topGoal(vehicle)?.kind;
  return kind !== undefined && WORK.includes(kind);
}

function threatens(world: World, vehicle: Vehicle, other: Vehicle): boolean {
  if (other.id in vehicle.brain!.attackers) return true;
  return aimsOf(other).some((id) => id === vehicle.id || isNearbyMate(world, vehicle, id));
}

function aimsOf(other: Vehicle): string[] {
  const aims = Object.values(other.weaponOrders).map((order) => order.targetId);
  const fight = other.brain ? topGoal(other) : null;
  return fight?.kind === 'fight' && fight.targetId ? [...aims, fight.targetId] : aims;
}

function isNearbyMate(world: World, vehicle: Vehicle, id: string): boolean {
  const mate = world.vehicles.find((v) => v.id === id);
  if (!mate || mate.id === vehicle.id || !isAlly(world, vehicle, mate)) return false;
  return dist(mate.pos, vehicle.pos) <= SPAWN.neighborHelp && canVehicleSee(world, vehicle, mate.pos);
}

export function isHostileContact(world: World, vehicle: Vehicle, contact: Contact): boolean {
  return world.vehicles.some((other) => other.id === contact.vehicleId && isHostile(world, vehicle, other));
}


export type TradePlan = { source: string; good: string; sellShop: string };

export function tradeSpend(world: World, vehicle: Vehicle): number {
  const stake = npcProfile(vehicle).tradeStake;
  if (!(stake > 0)) throw new Error(`${vehicle.id} weighs a trade with a trade stake of ${stake}`);
  return Math.min(getResources(world, vehicle).money - getUpkeepReserve(vehicle), stake);
}

export const tradeOffers = (world: World, vehicle: Vehicle): Weighted<TradePlan>[] => tradePlans().filter((plan) => planOnBeat(vehicle, plan)).flatMap(tradeOfferer(world, vehicle) ?? (() => []));

const planOnBeat = (vehicle: Vehicle, plan: TradePlan): boolean => !hasTrait(vehicle, 'lawman') || (onBeat(vehicle, getKnownSite(plan.source).pos) && onBeat(vehicle, getKnownSite(plan.sellShop).pos));

const tradePlans = (): TradePlan[] => Object.values(SHOPS).flatMap((from) => Object.values(SHOPS).filter((to) => to.id !== from.id).flatMap((to) => from.goods.filter((good) => to.goods.includes(good)).map((good) => ({ source: from.id, good, sellShop: to.id }))));

function tradeOfferer(world: World, vehicle: Vehicle): ((plan: TradePlan) => Weighted<TradePlan>[]) | null {
  if (!modeRules(world).traffic) return null;
  const [spend, rig] = [tradeSpend(world, vehicle), tradeRig(world, vehicle)];
  return (plan) => runOffer(world, vehicle, plan, spend, 1, rig);
}

const tradeRig = (world: World, vehicle: Vehicle) => ({ fuelPerTile: vehicleStats(world, vehicle).fuelPerTile, room: cargoRoom(vehicle) });

export function tripFuelCost(world: World, vehicle: Vehicle, tiles: number, fuelPerTile = vehicleStats(world, vehicle).fuelPerTile): number {
  if (!Number.isFinite(tiles) || tiles < 0) throw new Error(`${vehicle.id} prices the fuel of a trip of ${tiles} tiles`);
  return tiles * fuelPerTile * ECONOMY.supplyPrice.fuel;
}

export type TradeOutlook = { buy: number; profit: number; count: number; fuel: number; risk: number; net: number; worth: boolean };

export function tradeOutlook(world: World, vehicle: Vehicle, plan: TradePlan, spend: number, trip: number, rig = tradeRig(world, vehicle)): TradeOutlook {
  const fuel = tripFuelCost(world, vehicle, trip, rig.fuelPerTile);
  const buy = getTradePrice(world, vehicle, plan.source, plan.good, 'buy');
  const profit = getTradePrice(world, vehicle, plan.sellShop, plan.good, 'sell') - buy;
  const count = affordableBuyCount(world, vehicle, plan.source, plan.good, rig.room, spend);
  const risk = count * goodValue(plan.good) * legRisk(world, plan.source, plan.sellShop);
  const net = count * profit - fuel - risk;
  return { buy, profit, count, fuel, risk, net, worth: spend >= buy && profit > 0 && net > 0 };
}

export function tradeLegTiles(plan: TradePlan): number {
  return dist(getKnownSite(plan.source).pos, getKnownSite(plan.sellShop).pos);
}

function runOffer(world: World, vehicle: Vehicle, plan: TradePlan, spend: number, need: number, rig: ReturnType<typeof tradeRig>): Weighted<TradePlan>[] {
  const trip = dist(vehicle.pos, getKnownSite(plan.source).pos) + tradeLegTiles(plan);
  const outlook = tradeOutlook(world, vehicle, plan, spend, trip, rig);
  return outlook.worth ? [{ value: plan, weight: (outlook.net * need) / trip }] : [];
}

export function supplyOffers(world: World, vehicle: Vehicle): Weighted<TradePlan>[] {
  if (!modeRules(world).traffic) return [];
  const [spend, rig] = [tradeSpend(world, vehicle), tradeRig(world, vehicle)];
  return graphEdges().flatMap((edge) => {
    if (!planOnBeat(vehicle, { source: edge.from, good: edge.good, sellShop: edge.to })) return [];
    const short = stockTarget(edge.to, edge.good) - goodStock(shopState(world, edge.to), edge.good);
    if (short <= 0) return [];
    return runOffer(world, vehicle, { source: edge.from, good: edge.good, sellShop: edge.to }, spend, short / stockTarget(edge.to, edge.good), rig);
  });
}

export function lootTaken(world: World, vehicle: Vehicle, targetId: string | null): GoalReason | null {
  if (targetId === null || worksOnLoot(vehicle, targetId)) return null;
  const looter = lootBlocker(world, vehicle, targetId);
  return looter && passesUpLoot(world, vehicle, looter, targetId) ? 'lootTaken' : null;
}

export function worksOnLoot(vehicle: Vehicle, targetId: string): boolean {
  return worksOn(vehicle, targetId);
}

export function holdFull(vehicle: Vehicle): boolean {
  const fullAt = vehicle.brain!.fullAt;
  return fullAt !== undefined && freeCells(vehicle) <= fullAt;
}

export function knownUnfit(vehicle: Vehicle, targetId: string): boolean {
  return vehicle.brain!.unfit?.includes(targetId) ?? false;
}

export function noteStripped(world: World, vehicle: Vehicle, stockId: string | null): void {
  const stock = world.salvage.find((s) => s.id === stockId);
  if (!stock) throw new Error(`${vehicle.id} cannot note ${stockId} as stripped: no such stock`);
  if (hasSalvage(stock) && !claimOnly(world, vehicle, stock)) throw new Error(`${vehicle.id} cannot note ${stockId} as stripped: it still holds salvage`);
  remember(world, vehicle, { kind: 'stripped', stock: stock.id });
}

export function noteCannotHold(world: World, vehicle: Vehicle, targetId: string | null): void {
  const brain = vehicle.brain!;
  if (targetId !== null && !fitsAfterSale(world, vehicle, targetId)) brain.unfit = [...(brain.unfit ?? []), targetId];
  else brain.fullAt = freeCells(vehicle);
}

function fitsAfterSale(world: World, vehicle: Vehicle, targetId: string): boolean {
  const sold = afterSale(vehicle);
  const stock = world.salvage.find((s) => s.id === targetId);
  if (stock) return canTakeAny(world, sold, stock);
  const truck = world.vehicles.find((v) => v.id === targetId);
  return truck !== undefined && canTakeFromTruck(sold, truck);
}

export function hasSaleCargo(vehicle: Vehicle): boolean {
  return afterSale(vehicle).items.length < vehicle.items.length;
}

function afterSale(vehicle: Vehicle): Vehicle {
  const mounted = new Set(mountedParts(vehicle).map((part) => part.id));
  let reserve = NPC_UPKEEP.repairParts;
  const kept = vehicle.items.filter((it) => (it.kind === 'part' ? mounted.has(it.part.id) : it.kind === 'good' && it.good === 'parts' && reserve-- > 0));
  return { ...vehicle, items: kept };
}

export function lootPassedUp(vehicle: Vehicle, targetId: string | null): GoalReason | null {
  if (targetId !== null && worksOnLoot(vehicle, targetId)) return null;
  if (holdFull(vehicle)) return 'holdFull';
  return targetId !== null && knownUnfit(vehicle, targetId) ? 'lootWontFit' : null;
}

export function forgetFullHold(world: World, vehicle: Vehicle): void {
  const brain = vehicle.brain!;
  if (!holdFull(vehicle)) delete brain.fullAt;
  if (!brain.unfit) return;
  const kept = brain.unfit.filter((id) => world.salvage.some((s) => s.id === id) || world.vehicles.some((v) => v.id === id));
  if (kept.length > 0) brain.unfit = kept;
  else delete brain.unfit;
}

export function stockLootInvalid(world: World, vehicle: Vehicle, goal: NpcActivity): GoalReason | null {
  const stock = world.salvage.find((s) => s.id === goal.targetId);
  if (!stock) return 'lootGone';
  if (!canReachSalvage(vehicle, stock)) return !hasCargoRoom(vehicle) ? CANNOT_HOLD : null;
  if (!hasSalvage(stock)) return STRIPPED;
  if (claimOnly(world, vehicle, stock)) return CLAIMED;
  return canTakeAny(world, vehicle, stock) ? null : CANNOT_HOLD;
}

export function truckLootInvalid(vehicle: Vehicle, truck: Vehicle): GoalReason | null {
  if (!isKnockedOut(truck)) return 'truckGotAway';
  if (vehicle.job?.kind === 'refit' || !inTowReach(vehicle, truck)) return null;
  return canTakeFromTruck(vehicle, truck) ? null : 'cargoFullLoot';
}

function stands(vehicle: Vehicle, site: Site): boolean {
  return isTerritory(site) ? territoryAt(vehicle.pos)?.id === site.id : canUseSite(vehicle.pos, site);
}

export function salvageSitesAway(vehicle: Vehicle) {
  return npcProfile(vehicle).salvageSites.map(getKnownSite).filter((site) => !stands(vehicle, site));
}

export function huntingGrounds(world: World): readonly Vec[] {
  return worldHuntingSpots(world).spots;
}

function pointsAlong(line: readonly Vec[], spacing: number): Vec[] {
  const points: Vec[] = [];
  let next = spacing / 2;
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const length = dist(a, b);
    for (; next <= walked + length; next += spacing) {
      const t = (next - walked) / length;
      points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    walked += length;
  }
  return points;
}

export function huntingGroundsAway(world: World, vehicle: Vehicle): Vec[] {
  const grounds = huntingGrounds(world).filter((point) => dist(vehicle.pos, point) > RULES.arriveRadius * 2);
  const gates = beatGates(vehicle);
  return gates ? grounds.filter((point) => withinGateReach(gates, point)) : grounds;
}

export function lawmanTowns(): readonly Site[] {
  const ids = new Set(Object.values(NPCS).filter((t) => t.traits.includes('lawman') && t.spawn.kind === 'sites').flatMap((t) => (t.spawn.kind === 'sites' ? t.spawn.ids : [])));
  return [...ids].map(getKnownSite);
}

let lawGates: readonly Vec[] | null = null;

export function nearLawGate(pos: Vec): boolean {
  if (!lawGates) {
    const towns = lawmanTowns();
    if (towns.length === 0) throw new Error('No lawman town: lawman gates would mean nothing');
    lawGates = towns.flatMap((town) => siteGates(town));
  }
  return lawGates.some((gate) => dist(gate, pos) <= NPC_BEHAVIOR.lawGateReach);
}

export function raiderGrounds(world: World, camp: Site): readonly Vec[] {
  return campPosts(world, camp, campGrounds(world, camp), 'raid');
}

function campPosts(world: World, camp: Site, grounds: readonly Vec[], kind: string): readonly Vec[] {
  const posts = postsOf(world, `${kind}:${camp.id}`, grounds);
  if (grounds.length > 0 && posts.length === 0) throw new Error(`Camp ${camp.id} has no ${kind} post`);
  return posts;
}

const turfs = new WeakMap<readonly Vec[], Map<string, Vec[]>>();

function turfOf(spots: readonly Vec[]): Map<string, Vec[]> {
  let turf = turfs.get(spots);
  if (!turf) {
    turf = divideTurf(spots, turfClaimants());
    turfs.set(spots, turf);
  }
  return turf;
}

function campGrounds(world: World, camp: Site): readonly Vec[] {
  const turf = turfOf(huntingGrounds(world)).get(camp.id);
  if (!turf) throw new Error(`Camp ${camp.id} claims no hunting turf`);
  return turf;
}

export function raiderGroundsAway(world: World, vehicle: Vehicle): Vec[] {
  return raiderGrounds(world, homeCamp(vehicle)).filter((point) => dist(vehicle.pos, point) > RULES.arriveRadius * 2);
}

function nearestHome(vehicle: Vehicle, ids: readonly string[]): Site {
  const home = vehicle.brain!.home;
  return ids.map(getKnownSite).sort((a, b) => dist(home, a.pos) - dist(home, b.pos))[0];
}

export function homeCamp(vehicle: Vehicle): Site {
  const { bases } = npcProfile(vehicle);
  if (bases.length === 0) throw new Error(`${vehicle.id} knows no camp`);
  return nearestHome(vehicle, bases);
}

export function patrolSite(vehicle: Vehicle): Site {
  return npcProfile(vehicle).bases.length > 0 ? homeCamp(vehicle) : nearestHome(vehicle, npcProfile(vehicle).towns);
}

const withinGateReach = (gates: readonly Vec[], point: Vec): boolean => gates.some((gate) => dist(gate, point) <= NPC_BEHAVIOR.patrolRadius);

export function beatGates(vehicle: Vehicle): readonly Vec[] | null {
  return hasTrait(vehicle, 'lawman') ? siteGates(patrolSite(vehicle)) : null;
}

export function onBeat(vehicle: Vehicle, point: Vec): boolean {
  return !hasTrait(vehicle, 'lawman') || withinGateReach(siteGates(patrolSite(vehicle)), point);
}

const patrolStops = new Map<string, readonly Vec[]>();

export function patrolPoints(site: Site): readonly Vec[] {
  return roadStops(site, NPC_BEHAVIOR.patrolSpacing);
}

export function raiderPatrolPosts(world: World, camp: Site): readonly Vec[] {
  return campPosts(world, camp, roadStops(camp, HUNT.patrolPostSpacing), 'patrol');
}

export function patrolStopsOf(world: World, vehicle: Vehicle): readonly Vec[] {
  const site = patrolSite(vehicle);
  return hasTrait(vehicle, 'raider') ? raiderPatrolPosts(world, site) : patrolPoints(site);
}

function roadStops(site: Site, spacing: number): readonly Vec[] {
  const key = `${site.id}:${spacing}`;
  const cached = patrolStops.get(key);
  if (cached) return cached;
  const gates = siteGates(site);
  const points = REGION.roads.flatMap((road) => pointsAlong(road, spacing)).filter((p) => withinGateReach(gates, p) && siteUnder(icarusAtlas(), p) === null);
  patrolStops.set(key, points);
  return points;
}

export function travelSitesAway(vehicle: Vehicle) {
  return npcProfile(vehicle).travelSites.map(getKnownSite).filter((site) => !stands(vehicle, site));
}

export function canRob(w: World, robber: Vehicle, target: Vehicle): boolean {
  if (robber.id === target.id || !isRobbable(w, robber, target) || inCombatWithOther(w, target, robber.id)) return false;
  return isFairGame(w, robber, target) && canVehicleSee(w, robber, target.pos);
}

function isFairGame(w: World, robber: Vehicle, target: Vehicle): boolean {
  if (isHostile(w, robber, target) || boundTo(w, robber.id, target.id) || inTruce(w, robber, target)) return false;
  return !(isRaider(robber) && isOutlaw(target.faction)) && !bandAtLeast(bandToward(w, robber, target), 'friendly');
}

function isRobbable(w: World, robber: Vehicle, target: Vehicle): boolean {
  return hasPerceivedLoot(w, robber, target) && !isKnockedOut(target) && !isOnRope(w, target.id);
}

function canWarn(world: World, _vehicle: Vehicle, decision: DecisionId, subject: string | null): boolean {
  return decision !== 'lookedOver' || (subject === world.player.vehicleId && modeRules(world).radio);
}

function canRobSized(world: World, robber: Vehicle, target: Vehicle): boolean {
  if (!knowsCargo(world, robber, target) || !isRobbable(world, robber, target) || inCombatWithOther(world, target, robber.id)) return false;
  return huntsForLoot(world, robber, target) || canRob(world, robber, target);
}

type Availability = (world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null) => boolean;

const always = (): boolean => true;

function canSpareSubject(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): boolean {
  if (subjectOf(world, decision, subject).id !== world.player.vehicleId) throw new Error(`${decision} gives aid only to the player`);
  return canSpareFor(world, vehicle);
}

function canHireSubject(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): boolean {
  return canHire(world, vehicle, subjectOf(world, decision, subject));
}

function canTakeSubject(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): boolean {
  return canTakeEscort(world, vehicle, subjectOf(world, decision, subject));
}

function subjectOf(world: World, decision: DecisionId, subject: string | null): Vehicle {
  if (subject === null) throw new Error(`${decision} needs a subject`);
  return vehicleById(world, subject);
}

export function canStartFight(world: World, vehicle: Vehicle, target: Vehicle): boolean {
  return firepower(world, vehicle) > 0 && canVehicleSee(world, vehicle, target.pos) && !holdsOffRobbery(world, vehicle, target);
}

function canFightSubject(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): boolean {
  if (decision === 'hostileSeen' && !canDrive(world, vehicle)) return false;
  return canStartFight(world, vehicle, subjectOf(world, decision, subject));
}

function canInvestigate(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): boolean {
  return canDrive(world, vehicle) && !holdsOffRobbery(world, vehicle, subjectOf(world, decision, subject));
}

function canDrive(world: World, vehicle: Vehicle): boolean {
  return !isStranded(world, vehicle);
}

export function canFlee(world: World, vehicle: Vehicle): boolean {
  return allowedByMode(world, 'flee') && canDrive(world, vehicle);
}

function canRobSubject(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): boolean {
  if (isStranded(world, vehicle) || !traitsAllowRobbing(vehicle) || firepower(world, vehicle) <= 0) return false;
  const target = subjectOf(world, decision, subject);
  return decision === 'sizedUp' ? canRobSized(world, vehicle, target) : canRob(world, vehicle, target);
}

function traitsAllowRobbing(vehicle: Vehicle): boolean {
  const robs = npcProfile(vehicle).robs;
  return robs === 'offDuty' && !vehicle.brain!.goals.some((goal) => goal.kind === 'follow');
}

function canRamSubject(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): boolean {
  const target = subjectOf(world, decision, subject);
  const top = topGoal(vehicle);
  return top?.kind === 'fight' && top.targetId === target.id && ramImpact(world, vehicle, target) !== null;
}

function canTow(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): boolean {
  return strandedAt(world, vehicle, subjectOf(world, decision, subject)) !== null;
}

function canResume(_world: World, vehicle: Vehicle): boolean {
  return topGoal(vehicle) !== null;
}

function canTrade(world: World, vehicle: Vehicle): boolean {
  const offer = tradeOfferer(world, vehicle);
  return offer !== null && tradePlans().some((plan) => planOnBeat(vehicle, plan) && offer(plan).length > 0);
}

function canScavenge(world: World, vehicle: Vehicle): boolean {
  if (!hasCargoRoom(vehicle) || holdFull(vehicle)) return false;
  return visibleSalvage(world, vehicle).length > 0 || visibleDowned(world, vehicle).length > 0 || salvageSitesAway(vehicle).length > 0;
}

function canLootSubject(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): boolean {
  if (subject === null) throw new Error(`${decision} needs a subject`);
  if (!hasCargoRoom(vehicle) || holdFull(vehicle)) return false;
  const stock = world.salvage.find((entry) => entry.id === subject);
  if (stock) return seesStock(world, vehicle, stock);
  const truck = world.vehicles.find((v) => v.id === subject);
  return truck !== undefined && seesDowned(world, vehicle, truck);
}

function canRaid(world: World, vehicle: Vehicle): boolean {
  return huntsPrey(vehicle) && raiderGroundsAway(world, vehicle).length > 0;
}

function canProwl(world: World, vehicle: Vehicle): boolean {
  return canDrive(world, vehicle) && !holdFull(vehicle) && huntingGroundsAway(world, vehicle).length > 0;
}

function canPatrol(world: World, vehicle: Vehicle): boolean {
  return (hasTrait(vehicle, 'lawman') || hasTrait(vehicle, 'raider')) && patrolStopsOf(world, vehicle).length > 0;
}

function canTravel(_world: World, vehicle: Vehicle): boolean {
  return travelSitesAway(vehicle).length > 0;
}

function canHaul(world: World, vehicle: Vehicle): boolean {
  return hasCargoRoom(vehicle) && supplyOffers(world, vehicle).length > 0;
}

function canEscort(world: World, vehicle: Vehicle): boolean {
  return leaderToJoin(world, vehicle) !== null;
}

function canPostEscort(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): boolean {
  return subject !== null && escortsOf(world, vehicle.id).length === 0 && !isDefeated(vehicle);
}

function postFactor(world: World, _vehicle: Vehicle, _decision: DecisionId, subject: string | null): number {
  const [from, to] = (subject ?? '').split('>');
  return ESCORT_JOB.postWeight[routeThreat(world, from, to)];
}

type OptionName = DecisionOptions[DecisionId];

const AVAILABLE: Record<OptionName, Availability> = {
  keep: always,
  pay: (world, vehicle) => canPayBounty(world, vehicle),
  fight: (world, vehicle, decision, subject) => !keepsToItself(world, vehicle) && canFightSubject(world, vehicle, decision, subject),
  fightBack: canFightSubject,
  flee: canDrive,
  investigate: (world, vehicle, decision, subject) => !keepsToItself(world, vehicle) && canInvestigate(world, vehicle, decision, subject),
  rob: canRobSubject,
  ram: canRamSubject,
  tow: canTow,
  resume: canResume,
  new: always,
  trade: canTrade,
  scavenge: canScavenge,
  work: (world, vehicle) => workableSpots(world, vehicle).length > 0,
  moveOn: always,
  raid: canRaid,
  prowl: canProwl,
  loot: (world, vehicle, decision, subject) => !keepsToItself(world, vehicle) && canLootSubject(world, vehicle, decision, subject),
  wait: always,
  linger: (world, vehicle) => lingerReasonNow(world, vehicle) !== null,
  patrol: canPatrol,
  travel: canTravel,
  explore: canDrive,
  haul: canHaul,
  escort: canEscort,
  muster: (world, vehicle) => canMuster(world, vehicle),
  join: (world, vehicle, decision, subject) => canJoin(world, vehicle, subjectOf(world, decision, subject)),
  go: always,
  post: canPostEscort,
  paid: dealAvailable('paid'),
  ownParts: dealAvailable('ownParts'),
  free: dealAvailable('free'),
  forgive: always,
  retaliate: always,
  truce: always,
  beg: always,
  accept: always,
  refuse: always,
  spare: always,
  offer: always,
  finish: always,
  rush: canDrive,
  halt: always,
  veer: canDrive,
  comply: always,
  demand: always,
  attack: always,
  help: (world, vehicle, decision, subject) => canAnswerCall(world, vehicle, subjectOf(world, decision, subject)),
  hire: canHireSubject,
  take: canTakeSubject,
  decline: always,
  give: canSpareSubject,
  aid: canSpareSubject,
  warn: canWarn,
  keepAway: canDrive,
  leave: always,
  tale: (world, vehicle) => encounterAvailable(world, vehicle, 'tale'),
  tip: (world, vehicle) => encounterAvailable(world, vehicle, 'tip'),
  challenge: (world, vehicle) => encounterAvailable(world, vehicle, 'challenge'),
  courier: (world, vehicle) => encounterAvailable(world, vehicle, 'courier'),
};

type SituationFactor = (world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null, danger: number | null) => number;

const neutral = (): number => 1;

function weakFlee(world: World, vehicle: Vehicle): number {
  return isWeak(world, vehicle) ? NPC_BEHAVIOR.weakFlee : 1;
}

function getsAway(world: World, vehicle: Vehicle, foe: Vehicle): boolean {
  if (!canDrive(world, vehicle)) return false;
  const odds = fightOddsAgainst(world, vehicle, foe);
  return odds.getaway > 0 && odds.getaway >= odds.win;
}

function pleads(world: World, vehicle: Vehicle, foe: Vehicle): boolean {
  return isWeak(world, vehicle) || (badlyHurt(world, vehicle) && !getsAway(world, vehicle, foe));
}

function losingFlee(world: World, vehicle: Vehicle, foe: Vehicle): number {
  return badlyHurt(world, vehicle) && getsAway(world, vehicle, foe) ? NPC_BEHAVIOR.weakFlee : 1;
}

function threatFlee(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null, danger: number | null): number {
  if (danger === null || isManageable(vehicle, danger)) return 1;
  return getsAway(world, vehicle, subjectOf(world, decision, subject)) ? NPC_BEHAVIOR.threatFlee : NPC_BEHAVIOR.trappedFlee;
}

function hunterFlee(world: World, vehicle: Vehicle, manageable: boolean): number {
  return huntsPrey(vehicle) && manageable && !badlyHurt(world, vehicle) ? NPC_BEHAVIOR.hunterFlee : 1;
}

function manageableFoe(vehicle: Vehicle, danger: number | null): boolean {
  return danger !== null && isManageable(vehicle, danger);
}

function fleeSeenFactor(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null, danger: number | null): number {
  return threatFlee(world, vehicle, decision, subject, danger) * weakFlee(world, vehicle) * hunterFlee(world, vehicle, manageableFoe(vehicle, danger));
}

function fleeParleyFactor(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null, danger: number | null): number {
  const foe = subjectOf(world, decision, subject);
  return threatFlee(world, vehicle, decision, subject, danger) * losingFlee(world, vehicle, foe) * hunterFlee(world, vehicle, manageableFoe(vehicle, danger));
}

function fleeHeardFactor(world: World, vehicle: Vehicle): number {
  return weakFlee(world, vehicle) * hunterFlee(world, vehicle, true);
}

function fleeAttackedFactor(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null, danger: number | null): number {
  const cabMax = maxHp(corePart(vehicle, 'cab'));
  const hit = NPC_BEHAVIOR.missFlee + vehicle.brain!.hurt / cabMax / NPC_BEHAVIOR.hurtFullFlee;
  return hit * losingFlee(world, vehicle, subjectOf(world, decision, subject)) * threatFlee(world, vehicle, decision, subject, danger);
}

const FLEE_FACTORS: Partial<Record<DecisionId, SituationFactor>> = { hostileSeen: fleeSeenFactor, contactHeard: fleeHeardFactor, attacked: fleeAttackedFactor, threatened: fleeSeenFactor, bountyDemanded: fleeSeenFactor, parley: fleeParleyFactor, crewCalled: fleeSeenFactor, vigilCalled: fleeSeenFactor };

function fleeFactor(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null, danger: number | null): number {
  const factor = FLEE_FACTORS[decision];
  if (!factor) throw new Error(`No flee option at ${decision}`);
  return factor(world, vehicle, decision, subject, danger);
}

type AppealCurve = { poor: number; rich: number; poorMul: number };

export function lootAppeal(value: number, curve: AppealCurve): number {
  if (value <= curve.poor) return curve.poorMul;
  if (value >= curve.rich) return 1;
  return curve.poorMul ** (1 - (value - curve.poor) / (curve.rich - curve.poor));
}

function appealOf(world: World, vehicle: Vehicle, target: Vehicle, curve: AppealCurve): number {
  return stateOf(world, 'revenge', vehicle.id, target.id) ? 1 : lootAppeal(perceivedLoad(world, vehicle, target), curve);
}

function robFactor(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null, danger: number | null): number {
  const target = subjectOf(world, decision, subject);
  if (decision === 'sizedUp' && huntsForLoot(world, vehicle, target)) return raidFactor(world, vehicle, target, danger);
  const seen = danger === null ? null : danger * (1 + skillEffect(world, target, 'social', 'robberyDanger'));
  const stronger = seen !== null && seen >= npcProfile(vehicle).boldness;
  const appeal = appealOf(world, vehicle, target, NPC_BEHAVIOR.lootAppeal.rob);
  return (stronger ? NPC_BEHAVIOR.robStronger : 1) * appeal * guardFactor(vehicle, target, NPC_BEHAVIOR.robNearGuards);
}

function raidFactor(world: World, vehicle: Vehicle, target: Vehicle, danger: number | null): number {
  const eager = danger !== null && isManageable(vehicle, danger);
  const appeal = appealOf(world, vehicle, target, huntCurve(vehicle));
  return (eager ? NPC_BEHAVIOR.manageableFight : 1) * appeal * guardFactor(vehicle, target, NPC_BEHAVIOR.fightNearGuards);
}

function guardFactor(vehicle: Vehicle, subject: Vehicle, nearGuards: number): number {
  if (hasTrait(vehicle, 'lawman')) return 1;
  return nearLawGate(vehicle.pos) || nearLawGate(subject.pos) ? nearGuards : 1;
}

export function huntCurve(vehicle: Vehicle): AppealCurve {
  return huntsOffRoad(vehicle.brain ?? undefined) ? NPC_BEHAVIOR.lootAppeal.hunt : NPC_BEHAVIOR.lootAppeal.raid;
}

export function passReason(world: World, hunter: Vehicle, other: Vehicle, danger: number): PassReason {
  if (!huntsPrey(hunter)) throw new Error(`${hunter.id} is not a raider, so it has no pass reason`);
  if (!hasPerceivedLoot(world, hunter, other) && !inFeud(world, hunter, other)) return 'nothing';
  if (inCombatWithOther(world, hunter, other.id)) return 'busy';
  if (!isManageable(hunter, danger)) return 'outgunned';
  return appealOf(world, hunter, other, huntCurve(hunter)) < 1 ? 'poorLoad' : 'chance';
}

function fightFactor(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null, danger: number | null): number {
  const target = subjectOf(world, decision, subject);
  const eager = !isBusy(vehicle) && danger !== null && isManageable(vehicle, danger);
  const lootOnly = decision === 'hostileSeen' && huntsForLoot(world, vehicle, target);
  const appeal = lootOnly ? appealOf(world, vehicle, target, huntCurve(vehicle)) : 1;
  return (eager ? NPC_BEHAVIOR.manageableFight : 1) * appeal * crewHold(world, vehicle, decision, target) * guardFactor(vehicle, target, NPC_BEHAVIOR.fightNearGuards);
}

function crewHold(world: World, vehicle: Vehicle, decision: DecisionId, target: Vehicle): number {
  return decision === 'hostileSeen' && heldBackByCrew(world, vehicle, target) ? CREW.initiative : 1;
}

function fightBackFactor(world: World, vehicle: Vehicle, _decision: DecisionId, _subject: string | null, danger: number | null): number {
  return danger !== null && isManageable(vehicle, danger) ? NPC_BEHAVIOR.manageableFight : 1;
}

function keepFactor(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): number {
  if (decision !== 'hostileSeen' && decision !== 'contactHeard') return 1;
  const other = subjectOf(world, decision, subject);
  const restrained = isBusy(vehicle) && !isWeak(world, vehicle) && !threatens(world, vehicle, other);
  return restrained ? NPC_BEHAVIOR.keepWork : 1;
}

function ramWeight(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): number {
  return ramFactor(world, vehicle, subjectOf(world, decision, subject));
}

function retaliateFactor(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): number {
  return isAlly(world, vehicle, subjectOf(world, decision, subject)) ? NPC_BEHAVIOR.mateRetaliate : 1;
}

function truceFactor(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null, danger: number | null): number {
  if (danger !== null && !isManageable(vehicle, danger)) return NPC_BEHAVIOR.threatTruce;
  return pleads(world, vehicle, subjectOf(world, decision, subject)) ? 1 : NPC_BEHAVIOR.winningTruce;
}

function begFactor(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): number {
  return pleads(world, vehicle, subjectOf(world, decision, subject)) ? NPC_BEHAVIOR.weakBeg : 1;
}

export function wantsPeace(world: World, vehicle: Vehicle, danger: number | null): boolean {
  return (danger !== null && !isManageable(vehicle, danger)) || isWeak(world, vehicle);
}

function acceptFactor(world: World, vehicle: Vehicle, _decision: DecisionId, _subject: string | null, danger: number | null): number {
  return wantsPeace(world, vehicle, danger) ? NPC_BEHAVIOR.threatAccept : 1;
}

function refuseFactor(world: World, vehicle: Vehicle, _decision: DecisionId, subject: string | null, danger: number | null): number {
  return robs(world, vehicle, subject) && !wantsPeace(world, vehicle, danger) ? NPC_BEHAVIOR.robberRefuse : 1;
}

function robs(world: World, vehicle: Vehicle, subject: string | null): boolean {
  if (subject === null) return false;
  const target = vehicleById(world, subject);
  return robbing(world, vehicle.id, target.id) || (isRaider(vehicle) && !isOutlaw(target.faction) && hasPerceivedLoot(world, vehicle, target));
}

export function wantsLoot(world: World, vehicle: Vehicle, target: Vehicle): boolean {
  return !isStranded(world, vehicle) && traitsAllowRobbing(vehicle) && robs(world, vehicle, target.id);
}

export function holdsUp(world: World, robber: Vehicle, prey: Vehicle, danger: number | null): boolean {
  return wantsLoot(world, robber, prey) && knowsCargo(world, robber, prey) && hasRansom(ransomOf(world, robber, prey)) && !wantsPeace(world, robber, danger);
}

export function robbedFor(world: World, vehicle: Vehicle, target: Vehicle): boolean {
  return robbing(world, vehicle.id, target.id) || huntsForLoot(world, vehicle, target);
}

export function holdsOffRobbery(world: World, vehicle: Vehicle, target: Vehicle): boolean {
  return isStranded(world, vehicle) && robbedFor(world, vehicle, target) && !fightsAgainst(world, target, vehicle);
}

function leaveFactor(_world: World, vehicle: Vehicle, _decision: DecisionId, _subject: string | null, danger: number | null): number {
  return danger !== null && !isManageable(vehicle, danger) ? NPC_BEHAVIOR.threatLeave : 1;
}

function complyFactor(world: World, vehicle: Vehicle, _decision: DecisionId, _subject: string | null, danger: number | null): number {
  const threat = danger !== null && !isManageable(vehicle, danger) ? NPC_BEHAVIOR.threatComply : 1;
  return guardedNow(world, vehicle) ? threat * NPC_BEHAVIOR.guardedComply : threat;
}

function guardedNow(world: World, vehicle: Vehicle): boolean {
  return followersOf(world, vehicle.id).some((other) => !isDefeated(other) && canVehicleSee(world, vehicle, other.pos));
}

function towFactor(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): number {
  const client = subjectOf(world, decision, subject);
  const at = strandedAt(world, vehicle, client);
  if (!at) throw new Error(`${vehicle.id} weighs a tow with no stranded ${client.id} perceived`);
  const player = client.id === world.player.vehicleId;
  const sites = player ? REGION.towns : [towSite(world, vehicle, client)];
  const { factor, crawl, far } = NPC_BEHAVIOR.towNearTown;
  const gate = Math.min(...sites.flatMap((site) => siteGates(site).map((g) => dist(at, g))));
  return factor + (1 - factor) * clamp((gate - crawl) / (far - crawl), 0, 1);
}

function investigateFactor(world: World, vehicle: Vehicle): number {
  return getCombatCondition(world, vehicle) <= NPC_BEHAVIOR.recoverCondition ? NPC_BEHAVIOR.crippledInvestigate : 1;
}

function lootedResumeFactor(_world: World, vehicle: Vehicle): number {
  const base = vehicle.brain!.goals[0].kind;
  const hunting = base === 'raid' || base === 'patrol';
  return hasTrait(vehicle, 'raider') && hunting && hasSaleCargo(vehicle) ? NPC_BEHAVIOR.lootedResume : 1;
}

function scavengeFactor(world: World, vehicle: Vehicle): number {
  return visibleSalvage(world, vehicle).length > 0 ? NPC_BEHAVIOR.visibleSalvage : 1;
}

const SITUATION: Record<OptionName, SituationFactor> = {
  keep: keepFactor,
  pay: neutral,
  fight: fightFactor,
  fightBack: fightBackFactor,
  flee: fleeFactor,
  investigate: investigateFactor,
  rob: robFactor,
  ram: ramWeight,
  tow: towFactor,
  demand: neutral,
  attack: neutral,
  resume: lootedResumeFactor,
  new: neutral,
  trade: neutral,
  scavenge: scavengeFactor,
  work: neutral,
  moveOn: neutral,
  raid: neutral,
  prowl: neutral,
  loot: neutral,
  wait: neutral,
  linger: (world, vehicle) => (lingersForMoment(world, vehicle, lingerReasonNow(world, vehicle)) ? LINGER.holderWeight : 1),
  patrol: neutral,
  travel: neutral,
  explore: neutral,
  haul: neutral,
  escort: neutral,
  muster: neutral,
  join: (world, vehicle, decision, subject) => joinFactor(world, vehicle, subjectOf(world, decision, subject)),
  go: neutral,
  post: postFactor,
  paid: neutral,
  ownParts: neutral,
  free: neutral,
  forgive: neutral,
  retaliate: retaliateFactor,
  truce: truceFactor,
  beg: begFactor,
  accept: acceptFactor,
  refuse: refuseFactor,
  spare: neutral,
  offer: neutral,
  finish: neutral,
  rush: neutral,
  halt: neutral,
  veer: neutral,
  comply: complyFactor,
  help: helpFactor,
  hire: neutral,
  take: neutral,
  decline: (world, vehicle) => declineFactor(world, vehicle),
  give: neutral,
  aid: neutral,
  warn: neutral,
  keepAway: neutral,
  leave: leaveFactor,
  tale: neutral,
  tip: neutral,
  challenge: neutral,
  courier: neutral,
};

function changeTables(world: World, vehicle: Vehicle, subject: string | null): TraitWeights[] {
  const tables = npcTraits(vehicle).map((id) => TRAITS[id].weights);
  if (subject === null) return tables;
  for (const s of statesHeld(world, vehicle.id)) {
    if (s.other !== subject) continue;
    const table = STATE_WEIGHTS[s.kind];
    if (!table) throw new Error(`Unknown state kind ${s.kind}`);
    tables.push(table);
  }
  return tables;
}

export function optionWeights<D extends DecisionId>(world: World, vehicle: Vehicle, decision: D, subject: string | null, danger: number | null): Partial<Record<DecisionOptions[D], number>> {
  const base = DECISIONS[decision] as Record<OptionName, number>;
  const tables = changeTables(world, vehicle, subject);
  const out: Partial<Record<OptionName, number>> = {};
  for (const option of Object.keys(base) as OptionName[]) {
    if (!optionOpen(world, vehicle, decision, subject, option)) continue;
    const { add, mul } = sumChanges(tables, decision, option);
    const factor = SITUATION[option](world, vehicle, decision, subject, danger);
    if (!(factor > 0)) throw new Error(`${vehicle.id} has situation factor ${factor} for ${option} at ${decision}`);
    out[option] = (base[option] + add) * mul * factor;
  }
  return out as Partial<Record<DecisionOptions[D], number>>;
}

export function ramsReadily(world: World, vehicle: Vehicle, subject: string): boolean {
  const tables = changeTables(world, vehicle, subject);
  const weight = (option: 'ram' | 'keep') => {
    const { add, mul } = sumChanges(tables, 'ramChance', option);
    return (DECISIONS.ramChance[option] + add) * mul;
  };
  return weight('ram') >= weight('keep');
}

function sumChanges(tables: TraitWeights[], decision: DecisionId, option: OptionName): Required<WeightChange> {
  let add = 0;
  let mul = 1;
  for (const table of tables) {
    const change = (table[decision] as Partial<Record<OptionName, WeightChange>> | undefined)?.[option];
    if (!change) continue;
    add += change.add ?? 0;
    mul *= positiveMul(change, decision, option);
  }
  return { add, mul };
}

function positiveMul(change: WeightChange, decision: DecisionId, option: OptionName): number {
  if (change.mul === undefined) return 1;
  if (!(change.mul > 0)) throw new Error(`Multiplier ${change.mul} for ${option} at ${decision} must be above 0`);
  return change.mul;
}

export function hasChoice(weights: Partial<Record<OptionName, number>>): boolean {
  return !('keep' in weights) || Object.keys(weights).some((option) => option !== 'keep');
}

const DECISION_KINDS: Record<DecisionId, 'venture' | 'response'> = {
  hostileSeen: 'response',
  contactHeard: 'response',
  attacked: 'response',
  preySeen: 'venture',
  sizedUp: 'venture',
  lookedOver: 'response',
  strandedSeen: 'venture',
  salvageSeen: 'venture',
  patchDeal: 'response',
  ramChance: 'response',
  fightWhim: 'response',
  crashed: 'response',
  parley: 'response',
  truceOffered: 'response',
  mercyBegged: 'response',
  threatened: 'response',
  bountyDemanded: 'response',
  warnedOff: 'response',
  lootContested: 'response',
  warnRefused: 'response',
  mugging: 'response',
  strandedFoe: 'response',
  surrenderOffered: 'response',
  resume: 'response',
  idle: 'venture',
  spotWork: 'venture',
  escortSeen: 'venture',
  hireOffered: 'response',
  aidAsked: 'response',
  escortWanted: 'venture',
  needySeen: 'venture',
  strangerSeen: 'venture',
  crewAsked: 'response',
  crewCalled: 'response',
  vigilCalled: 'response',
  helpCalled: 'venture',
};

export function keepsWord(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): boolean {
  if (DECISION_KINDS[decision] !== 'venture') return false;
  if (holdsClaim(world, vehicle.id)) return true;
  if (!givesWord(world, vehicle.id)) return false;
  return subject === null || !boundTo(world, vehicle.id, subject);
}

export function offersChoice(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): boolean {
  if (keepsWord(world, vehicle, decision, subject)) return false;
  const options = Object.keys(DECISIONS[decision]) as OptionName[];
  if (!options.includes('keep')) return true;
  return options.some((option) => option !== 'keep' && optionOpen(world, vehicle, decision, subject, option));
}

export function anyOptionOpen(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null): boolean {
  return (Object.keys(DECISIONS[decision]) as OptionName[]).some((option) => optionOpen(world, vehicle, decision, subject, option));
}

function optionOpen(world: World, vehicle: Vehicle, decision: DecisionId, subject: string | null, option: OptionName): boolean {
  return allowedByMode(world, option) && AVAILABLE[option](world, vehicle, decision, subject);
}

function allowedByMode(world: World, option: OptionName): boolean {
  const rules = modeRules(world);
  return (rules.yielding || !YIELD_OPTIONS.includes(option)) && (rules.rescue || !RESCUE_OPTIONS.includes(option));
}

export function optionChances<O extends string>(weights: Partial<Record<O, number>>): Partial<Record<O, number>> {
  const entries = Object.entries(weights) as [O, number][];
  const rest = 1 - entries.length * MIN_CHANCE;
  if (entries.length === 0 || rest < 0) throw new Error(`Cannot give ${entries.length} options their chances`);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const out: Partial<Record<O, number>> = {};
  for (const [option, weight] of entries) out[option] = MIN_CHANCE + rest * (total > 0 ? weight / total : 1 / entries.length);
  return out;
}

export function decide<D extends DecisionId>(world: World, vehicle: Vehicle, decision: D, subject: string | null, danger: number | null, without: readonly DecisionOptions[D][] = []): DecisionOptions[D] {
  const weights = optionWeights(world, vehicle, decision, subject, danger);
  for (const option of without) delete weights[option];
  checkWeights(vehicle, decision, weights);
  if (!hasChoice(weights)) return 'keep' as DecisionOptions[D];
  const chances = Object.entries(optionChances(weights)) as [DecisionOptions[D], number][];
  return sampleWeighted(world, chances.map(([value, weight]) => ({ value, weight })));
}

function checkWeights(vehicle: Vehicle, decision: DecisionId, weights: Partial<Record<OptionName, number>>): void {
  if (Object.keys(weights).length === 0) throw new Error(`${vehicle.id} has no open option at ${decision}`);
  for (const [option, weight] of Object.entries(weights) as [OptionName, number][]) {
    if (!Number.isFinite(weight) || weight < 0) throw new Error(`${vehicle.id} has weight ${weight} for ${option} at ${decision}`);
  }
}

export function yields(world: World): boolean {
  return modeRules(world).yielding;
}

export function givesUpUnarmed(world: World, vehicle: Vehicle): boolean {
  return yields(world) && firepower(world, vehicle) <= 0;
}

export function giveUpStrandedRobberies(world: World, vehicle: Vehicle): void {
  if (!yields(world) || !isStranded(world, vehicle)) return;
  for (const s of statesHeld(world, vehicle.id).filter(isRobberyFeud)) {
    const other = world.vehicles.find((v) => v.id === s.other);
    if (!other || !holdsOffRobbery(world, vehicle, other)) continue;
    endState(world, s, 'broken');
    addState(world, 'backedOff', vehicle.id, s.other, { kind: 'none' });
  }
}
