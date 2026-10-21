
import { NPC_BEHAVIOR, NPC_UPKEEP, SPAWN, type DecisionOptions, type Weighted } from '../data/npcs';
import { SHOPS } from '../data/market';
import { REGION } from '../data/region';
import { RULES } from '../data/rules';
import { inCombat, inCombatWith, isHostile, turnPartHits } from './combat';
import { abandonLostSizing, lookOverPrey, onHoldUp, onPreySeen, onSizingUp, reactToLookOvers, sizesUpFirst, sizeUpGoal, sizeUpInvalid, steerSizeUp } from './look-over';
import { reportIncident } from './relations';
import { cargoSaleValue } from './economy';
import { corePart } from './grid';
import { cancelJob } from './jobs';
import { businessBelongs, resolveSell, resolveTrade } from './npc-business';
import { isFree } from './spawn';
import { bodyStop } from './meeting-stop';
import { huntsOffRoad } from './hunt-style';
import {
  tradeOffers, supplyOffers, decide, keepsWord, offersChoice, perceiveDanger, getKnownSite, patrolStopsOf, patrolSite, travelSitesAway,
  huntingGroundsAway, raiderGroundsAway, isHostileContact, isWeak, huntsPrey, npcProfile, salvageSitesAway, npcSenses, usefulContacts, visibleDowned, visibleHostiles, visibleSalvage, type NpcProfile, type TradePlan,
  passReason, canStartFight, lootTaken, stockLootInvalid, truckLootInvalid, worksOnLoot, holdsOffRobbery, giveUpStrandedRobberies, forgetFullHold, noteCannotHold, noteStripped, hasSaleCargo, lootPassedUp, robbedFor, bodyCondition, givesUpUnarmed, yields,
} from './npc-decisions';
import { chooseNpcRepair, continueNpcRepair, repairsHere, resolveNpcRepair } from './npc-repair';
import { getResources } from './resources';
import { standingPressures } from './market';
import { claimInvalid, resolveClaim } from './claim-run';
import { remember, rememberSightings } from './memory';
import { chance, hashRandom, randInt, randRange } from './rng';
import { sampleWeighted } from './npc-loadout';
import { canLootTruck, canReachSalvage, canTakeAny, CANNOT_HOLD, CLAIMED, claimOnly, hasSalvage, isStockGoal, lootTruckTurn, searchTarget, STRIPPED, oldSpotOf, oldSpotsNear, oldStockId } from './salvage';
import { beginSearch } from './search';
import { onNeedySeen } from './aid';
import { onStrangerSeen } from './encounters';
import { vehicleById } from './damage';
import { demandsFirst, judgeStrandedFoe, plead, warnedOff } from './parley';
import { heldByLooter } from './loot-warning';
import { addState, declareFeud, endState, stateOf, statesHeld } from './states';
import { isStranded, suppliesCap, vehicleStats } from './stats';
import type { Contact, GoalReason, Job, NpcActivity, NpcBrain, NpcState, RefitJob, SalvageStock, Track, Vehicle, World } from './types';
import { canUseSite, GOAL_REACH, isTerritory, nearestPad, parkedOn, type Site } from './sites';
import { spotGoal, territoryOfStock, tripGoal } from './territory';
import { OLD_PLACES, type OldPlaceType } from '../data/salvage';
import { clamp, dist, leadsAwayBy, pointsAway, type Vec } from './vec';
import { canVehicleSee } from './vision';
import { isWatching, startWatch, watchOver } from './watch-posts';
import { chooseOn, comesInSight, sensedAt, senseTracks, trackOf } from './tracks';
import { dropTow, escortsOf, follows, isOnRope, mercsInSight, npcHomeSite, offerEscort, runTow, steerFollow, steerToStranded, strandedAt, towGoal, towHeldBy, towStop } from './tow';
import { joinLeader, safeBesidePartner } from './pairs';
import { musterGoal, onCrewCall, steerMuster } from './crews';
import { isDefeated, isKnockedOut } from './defeat';
import { payDuty, stampLeg } from './duty';
import { beginRearm, isLowOnFuel, liesUp, rearmInvalid, resolveRearm, resolveResupply, serveStranded, serviceGoal } from './npc-service';
import { isSunwardMember, nightSafe, planSunward, shunsAtNight, sunwardNext, sunwardRetreat } from './sunward';
import { meetingLapsed } from './sunward-crater';

export const INTERRUPTIONS: readonly NpcActivity['kind'][] = ['fight', 'flee', 'investigate', 'sizeUp', 'resupply', 'tow', 'loot', 'repair', 'patch', 'meet', 'retreat', 'rearm', 'follow'];

function goalsOf(v: Vehicle): NpcActivity[] {
  if (!v.brain) throw new Error(`${v.id} has no NPC brain`);
  if (!v.brain.goals) throw new Error(`${v.id} has no goals`);
  return v.brain.goals;
}

export function topGoal(v: Vehicle): NpcActivity | null {
  const goals = goalsOf(v);
  return goals[goals.length - 1] ?? null;
}

function jobBelongs(job: Job, v: Vehicle): boolean {
  if (job.kind === 'repair') return goalsOf(v).some((g) => g.kind === 'repair');
  if (job.kind === 'refit') return refitBelongs(job, topGoal(v));
  if (job.kind === 'business') return businessBelongs(job, topGoal(v));
  return searchBelongs(job, topGoal(v));
}

function searchBelongs(job: Job, goal: NpcActivity | null): boolean {
  return job.kind === 'search' && isStockGoal(goal) && goal.targetId === job.stockId;
}

function refitBelongs(job: RefitJob, goal: NpcActivity | null): boolean {
  return goal?.kind === 'loot' && job.pickup?.from === 'truck' && goal.targetId === job.pickup.vehicleId;
}

function goalKind(goal: NpcActivity | null): NpcActivity['kind'] | null {
  return goal?.kind ?? null;
}

export function logChange(w: World, v: Vehicle, previous: NpcActivity | null, reason: GoalReason): void {
  const top = topGoal(v);
  w.events.push({ t: 'activity', vehicle: v.id, previous: goalKind(previous), activity: goalKind(top), reason });
  if (top !== previous && v.job && !jobBelongs(v.job, v)) cancelJob(w, v);
}

export function pushGoal(w: World, v: Vehicle, goal: NpcActivity): void {
  const previous = topGoal(v);
  stampLeg(w, v, goal);
  v.brain!.goals = [...goalsOf(v).filter((g) => g.kind !== goal.kind), goal];
  logChange(w, v, previous, goal.reason);
}

export function popGoal(w: World, v: Vehicle, reason: GoalReason): NpcActivity {
  const goals = goalsOf(v);
  const popped = goals.pop();
  if (!popped) throw new Error(`${v.id} has no goal to pop`);
  reconsider(v, popped);
  logChange(w, v, popped, reason);
  return popped;
}

export function dropGoal(w: World, v: Vehicle, goal: NpcActivity, reason: GoalReason): void {
  const previous = topGoal(v);
  v.brain!.goals = goalsOf(v).filter((g) => g !== goal);
  reconsider(v, goal);
  logChange(w, v, previous, reason);
}

function reconsider(v: Vehicle, goal: NpcActivity): void {
  if ((goal.kind === 'fight' || goal.kind === 'flee') && goal.targetId) delete v.brain!.noticed[`hostileSeen:${goal.targetId}`];
}

export function replaceBase(w: World, v: Vehicle, goal: NpcActivity): void {
  const goals = goalsOf(v);
  if (goals.length === 0) throw new Error(`${v.id} has no long-term goal to replace`);
  const previous = topGoal(v);
  stampLeg(w, v, goal);
  v.brain!.goals = [goal, ...goals.slice(1).filter((g) => g.kind !== goal.kind)];
  logChange(w, v, previous, goal.reason);
}

export function placeBase(w: World, v: Vehicle, goal: NpcActivity): void {
  const previous = topGoal(v);
  const kept = goalsOf(v).filter((g, i) => g.kind !== goal.kind && (i > 0 || INTERRUPTIONS.includes(g.kind)));
  stampLeg(w, v, goal);
  v.brain!.goals = [goal, ...kept];
  logChange(w, v, previous, goal.reason);
}

export function createActivity(kind: NpcActivity['kind'], targetId: string | null, destination: Vec | null, reason: GoalReason): NpcActivity {
  return { kind, targetId, destination, reason, phase: destination ? 'travel' : 'act' };
}

export function chooseNearestSite(vehicle: Vehicle, ids: string[]) {
  return ids.map(getKnownSite).sort((a, b) => dist(vehicle.pos, a.pos) - dist(vehicle.pos, b.pos))[0];
}

export function createSiteActivity(kind: NpcActivity['kind'], id: string, reason: GoalReason): NpcActivity {
  return createActivity(kind, id, { ...getKnownSite(id).pos }, reason);
}

function fleeDestination(world: World, vehicle: Vehicle, profile: NpcProfile, threatPos: Vec): Vec {
  const partner = safeBesidePartner(world, vehicle, threatPos);
  if (partner) return partner;
  const safe = [...profile.towns, ...profile.bases].map(getKnownSite).filter((site) => pointsAway(vehicle.pos, site.pos, threatPos));
  safe.sort((a, b) => dist(vehicle.pos, a.pos) - dist(vehicle.pos, b.pos));
  const away = { x: vehicle.pos.x + (vehicle.pos.x - threatPos.x), y: vehicle.pos.y + (vehicle.pos.y - threatPos.y) };
  const destination = safe[0] ? siteSpot(world, vehicle, safe[0], vehicleStats(world, vehicle).radius + RULES.arriveRadius) : away;
  return { x: clamp(destination.x, 1, world.size - 1), y: clamp(destination.y, 1, world.size - 1) };
}

export function saleGoal(world: World, vehicle: Vehicle, profile: NpcProfile): NpcActivity {
  const buyers = profile.markets.map(getKnownSite);
  buyers.sort((a, b) => cargoSaleValue(world, vehicle, b.id) - cargoSaleValue(world, vehicle, a.id) || dist(vehicle.pos, a.pos) - dist(vehicle.pos, b.pos));
  if (!buyers[0]) throw new Error(`${vehicle.id} knows no buyer`);
  return createSiteActivity('sell', buyers[0].id, 'sellCargo');
}

function tradeGoal(world: World, vehicle: Vehicle): NpcActivity {
  return tradeRun(world, vehicle, tradeOffers(world, vehicle), 'buyCargo');
}

function tradeRun(world: World, vehicle: Vehicle, offers: Weighted<TradePlan>[], reason: GoalReason): NpcActivity {
  if (offers.length === 0) throw new Error(`${vehicle.id} chose to trade with no affordable profitable trade`);
  const plan = sampleWeighted(world, offers);
  return { ...createSiteActivity('trade', plan.source, reason), purchase: { good: plan.good, sellShop: plan.sellShop } };
}

function scavengeGoal(world: World, vehicle: Vehicle): NpcActivity {
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
  return isTerritory(site) ? spotGoal(world, site.id) : createSiteActivity('scavenge', site.id, 'searchSite');
}

const OLD_SPOT_GOALS: Record<OldPlaceType, GoalReason> = {
  homestead: 'searchOldRuin',
  hamlet: 'searchOldRuin',
  lookout: 'searchOldRuin',
  hulks: 'searchOldHulks',
  boats: 'searchOldBoats',
};

function oldSpotGoal(world: World, vehicle: Vehicle): NpcActivity | null {
  const near = oldSpotsNear(world, vehicle.pos, OLD_PLACES.npcRange);
  if (near.length === 0 || !chance(world, OLD_PLACES.npcShare)) return null;
  const pick = near[randInt(world, 0, near.length - 1)];
  return createActivity('scavenge', oldStockId(pick), { ...pick.pos }, OLD_SPOT_GOALS[pick.type]);
}

type IdleGoal = (world: World, vehicle: Vehicle) => NpcActivity;

function huntingGoal(kind: 'raid' | 'prowl', reason: GoalReason, grounds: (world: World, vehicle: Vehicle) => Vec[]): IdleGoal {
  return (world, vehicle) => {
    const places = grounds(world, vehicle);
    if (places.length === 0) throw new Error(`${vehicle.id} chose to ${kind} with no hunting ground away`);
    return createActivity(kind, null, { ...places[randInt(world, 0, places.length - 1)] }, reason);
  };
}

function patrolGoal(world: World, vehicle: Vehicle): NpcActivity {
  const site = patrolSite(vehicle);
  const points = patrolStopsOf(world, vehicle);
  if (points.length === 0) throw new Error(`${vehicle.id} chose to patrol ${site.id} with no road near it`);
  return createActivity('patrol', site.id, { ...points[randInt(world, 0, points.length - 1)] }, 'kind' in site && site.kind === 'camp' ? 'patrolCamp' : 'patrolTown');
}

function travelGoal(world: World, vehicle: Vehicle): NpcActivity {
  const sites = travelSitesAway(vehicle);
  if (sites.length === 0) throw new Error(`${vehicle.id} chose a trip with no known site away`);
  const site = sites[randInt(world, 0, sites.length - 1)];
  return isTerritory(site) ? tripGoal(vehicle, site) : createSiteActivity('travel', site.id, 'tripToSite');
}

export function exploreGoal(world: World, vehicle: Vehicle): NpcActivity {
  const radius = vehicleStats(world, vehicle).radius;
  for (let i = 0; i < SPAWN.tries; i++) {
    const point = { x: randRange(world, radius, world.size - radius), y: randRange(world, radius, world.size - radius) };
    if (isFree(world, point, radius, vehicle.id)) return createActivity('explore', null, point, 'explore');
  }
  return createActivity('wait', null, null, 'noExplorePoint');
}

function haulGoal(world: World, vehicle: Vehicle): NpcActivity {
  return tradeRun(world, vehicle, supplyOffers(world, vehicle), 'loadCargo');
}

export const IDLE_GOALS: Record<Exclude<DecisionOptions['idle'], 'wait'>, IdleGoal> = {
  trade: tradeGoal,
  scavenge: scavengeGoal,
  raid: huntingGoal('raid', 'raid', raiderGroundsAway),
  muster: musterGoal,
  prowl: huntingGoal('prowl', 'prowl', (_world, vehicle) => huntingGroundsAway(vehicle)),
  patrol: patrolGoal,
  travel: travelGoal,
  explore: exploreGoal,
  haul: haulGoal,
  escort: joinLeader,
};

export function idleGoal(world: World, vehicle: Vehicle): NpcActivity {
  if (keepsWord(world, vehicle, 'idle', null)) return createActivity('wait', null, null, 'keepWord');
  const option = decide(world, vehicle, 'idle', null, null);
  if (option === 'wait') return createActivity('wait', null, null, 'nothingToDo');
  return IDLE_GOALS[option](world, vehicle);
}

function noteLootEnd(world: World, vehicle: Vehicle, reason: GoalReason, targetId: string | null): void {
  if (reason === CANNOT_HOLD) noteCannotHold(world, vehicle, targetId);
  if (reason === STRIPPED || reason === CLAIMED) noteStripped(world, vehicle, targetId);
}

export function finishGoal(world: World, vehicle: Vehicle, reason: GoalReason): void {
  const done = popGoal(world, vehicle, reason);
  noteLootEnd(world, vehicle, reason, done.targetId);
  const goals = vehicle.brain!.goals;
  if (!INTERRUPTIONS.includes(done.kind) || goals.length !== 1 || INTERRUPTIONS.includes(goals[0].kind)) return;
  resumeOrDrop(world, vehicle);
}

function resumeOrDrop(world: World, vehicle: Vehicle): void {
  if (decide(world, vehicle, 'resume', null, null) === 'new') return void popGoal(world, vehicle, 'choseNew');
  if (isWatching(vehicle)) popGoal(world, vehicle, 'leftPost');
}

type GoalCheck = (world: World, vehicle: Vehicle, goal: NpcActivity, contacts: Contact[]) => GoalReason | null;

const GAVE_UP_ROBBERY = 'strandedRobbery';

function fightInvalid(world: World, vehicle: Vehicle, goal: NpcActivity, contacts: Contact[]): GoalReason | null {
  const target = world.vehicles.find((v) => v.id === goal.targetId);
  if (!target || !isHostile(world, vehicle, target)) return 'lostTarget';
  if (holdsOffRobbery(world, vehicle, target)) return GAVE_UP_ROBBERY;
  if (givesUpUnarmed(world, vehicle)) return 'noGun';
  return fightTargetLost(world, vehicle, target, contacts) ? 'lostTarget' : null;
}

export function fightTargetLost(world: World, vehicle: Vehicle, target: Vehicle, contacts: Contact[]): boolean {
  if (sensedAt(world, vehicle, target.id, contacts)) return false;
  const track = trackOf(vehicle, target.id);
  if (!track) throw new Error(`${vehicle.id} fights ${target.id} with no track of it`);
  return world.turn - track.turn > NPC_BEHAVIOR.fightSearchTurns;
}

function steerFight(_world: World, vehicle: Vehicle, goal: NpcActivity): void {
  const track = trackOf(vehicle, goal.targetId!);
  if (!track) throw new Error(`${vehicle.id} fights ${goal.targetId} with no track of it`);
  goal.destination = { ...track.at };
}

export function fightGoal(world: World, vehicle: Vehicle, target: Vehicle, reason: GoalReason): NpcActivity {
  chooseOn(world, vehicle, target.id, target.pos, 'fight', true);
  const worn = { turn: world.turn, condition: bodyCondition(target) };
  const goal: NpcActivity = { ...createActivity('fight', target.id, { ...target.pos }, reason), worn };
  if (target.id === world.player.vehicleId || robbedFor(world, vehicle, target)) goal.demands = demandsFirst(world, vehicle, target.id);
  return goal;
}

function giveUpStalledFight(world: World, vehicle: Vehicle): void {
  const goal = topGoal(vehicle);
  const target = goal?.kind === 'fight' ? world.vehicles.find((v) => v.id === goal.targetId) : undefined;
  if (!target || !stalls(world, goal!, target)) return;
  for (const s of statesHeld(world, vehicle.id).filter((x) => x.kind === 'feud' && x.other === target.id)) endState(world, s, 'broken');
  addState(world, 'backedOff', vehicle.id, target.id, { kind: 'none' });
  chooseOn(world, vehicle, target.id, target.pos, 'keep', true);
  finishGoal(world, vehicle, 'cannotWearDown');
}

function stalls(world: World, goal: NpcActivity, target: Vehicle): boolean {
  if (!goal.worn) throw new Error(`A fight on ${goal.targetId} has no record of wearing it down`);
  const condition = bodyCondition(target);
  if (goal.worn.condition - condition >= NPC_BEHAVIOR.fightWearShare) goal.worn = { turn: world.turn, condition };
  return yields(world) && world.turn - goal.worn.turn > NPC_BEHAVIOR.fightStallTurns;
}

function fleeInvalid(world: World, vehicle: Vehicle, goal: NpcActivity, contacts: Contact[]): GoalReason | null {
  if (visibleHostiles(world, vehicle).length > 0 || contacts.some((c) => c.vehicleId === goal.targetId)) return null;
  if (goal.perceived === undefined) throw new Error(`${vehicle.id} flees from ${goal.targetId} with no turn it last perceived it`);
  return world.turn - goal.perceived > NPC_BEHAVIOR.fleeCalmTurns ? 'noHostile' : null;
}

function investigateInvalid(world: World, vehicle: Vehicle, goal: NpcActivity): GoalReason | null {
  const target = world.vehicles.find((v) => v.id === goal.targetId);
  if (!target || !isHostile(world, vehicle, target)) return 'contactGone';
  return holdsOffRobbery(world, vehicle, target) ? GAVE_UP_ROBBERY : null;
}

function scavengeInvalid(world: World, vehicle: Vehicle, goal: NpcActivity): GoalReason | null {
  return lootPassedUp(vehicle, goal.targetId) ?? scavengeTargetInvalid(world, vehicle, goal);
}

function scavengeTargetInvalid(world: World, vehicle: Vehicle, goal: NpcActivity): GoalReason | null {
  if (goal.targetId === null || [...REGION.towns, ...REGION.locations].some((site) => site.id === goal.targetId)) return null;
  const known = world.salvage.some((stock) => stock.id === goal.targetId && (territoryOfStock(stock) || oldSpotOf(stock)));
  if (known) return lootTaken(world, vehicle, goal.targetId);
  const seen = world.salvage.some((stock) => stock.id === goal.targetId && canVehicleSee(world, vehicle, stock.pos));
  return lootTaken(world, vehicle, goal.targetId) ?? (seen ? null : 'lostSalvage');
}

function lootInvalid(world: World, vehicle: Vehicle, goal: NpcActivity): GoalReason | null {
  const truck = world.vehicles.find((v) => v.id === goal.targetId);
  return lootPassedUp(vehicle, goal.targetId) ?? lootTaken(world, vehicle, goal.targetId) ?? (truck ? truckLootInvalid(vehicle, truck) : stockLootInvalid(world, vehicle, goal));
}

function towInvalid(world: World, vehicle: Vehicle, goal: NpcActivity): GoalReason | null {
  if (towHeldBy(world, vehicle.id)) return null;
  const client = world.vehicles.find((v) => v.id === goal.targetId);
  if (!client || stateOf(world, 'turnedDown', vehicle.id, client.id)) return 'towOff';
  if (!stateOf(world, 'answering', vehicle.id, client.id)) return 'towUnanswered';
  return strandedAt(world, vehicle, client) ? null : 'towOff';
}

function patchInvalid(world: World, vehicle: Vehicle, goal: NpcActivity): GoalReason | null {
  const other = goal.targetId;
  const held = world.states.some((s) => s.kind === 'patch' && ((s.holder === vehicle.id && s.other === other) || (s.holder === other && s.other === vehicle.id)));
  return held ? null : 'patchOff';
}

export function patchGoal(world: World, npc: Vehicle, other: Vehicle, patcher: boolean): void {
  const goal = patcher
    ? createActivity('patch', other.id, { ...other.pos }, 'patchTruck')
    : createActivity('patch', other.id, null, 'waitPatch');
  pushGoal(world, npc, goal);
}

export function meetGoal(world: World, npc: Vehicle, other: Vehicle, reason: GoalReason): void {
  pushGoal(world, npc, createActivity('meet', other.id, isStranded(world, npc) ? null : { ...other.pos }, reason));
}

const GOAL_CHECKS: Partial<Record<NpcActivity['kind'], GoalCheck>> = {
  fight: fightInvalid,
  rearm: rearmInvalid,
  wait: (world, vehicle) => (escortsOf(world, vehicle.id).length > 0 ? 'escortHired' : null),
  flee: fleeInvalid,
  investigate: investigateInvalid,
  sizeUp: sizeUpInvalid,
  scavenge: scavengeInvalid,
  loot: lootInvalid,
  tow: towInvalid,
  patch: patchInvalid,
  meet: (world, vehicle, goal) => (goal.reason === 'meetStranger' ? meetingLapsed(world, vehicle, goal) : dealMeetInvalid(world, vehicle, goal)),
  follow: (world, vehicle, goal) => (follows(world, vehicle, goal.targetId!) ? null : 'leftLeader'),
  claim: claimInvalid,
};

function dealMeetInvalid(world: World, vehicle: Vehicle, goal: NpcActivity): GoalReason | null {
  return world.states.some((s) => (s.kind === 'trade' || s.kind === 'handover' || s.kind === 'aid') && s.holder === vehicle.id && s.other === goal.targetId) ? null : 'meetingOff';
}

const EXPOSED: readonly NpcActivity['kind'][] = ['repair', 'patch', 'meet', 'tow', 'loot'];
const BROKEN_OFF: readonly NpcState['kind'][] = ['patch', 'trade', 'handover', 'aid'];
const DEAL_GOALS: readonly NpcActivity['kind'][] = ['meet', 'patch'];

function breakOffDeals(world: World, vehicle: Vehicle): void {
  if (!inCombat(world, vehicle)) return;
  const tow = towHeldBy(world, vehicle.id);
  if (tow) dropTow(world, tow, 'danger');
  for (const s of world.states.filter((x) => BROKEN_OFF.includes(x.kind) && (x.holder === vehicle.id || x.other === vehicle.id))) endState(world, s, 'broken');
}

export function goalHolds(world: World, vehicle: Vehicle, goal: NpcActivity): boolean {
  return invalidReason(world, vehicle, goal, usefulContacts(world, vehicle)) === null;
}

function invalidReason(world: World, vehicle: Vehicle, goal: NpcActivity, contacts: Contact[]): GoalReason | null {
  return stopReason(world, vehicle, goal) ?? watchOver(world, goal) ?? GOAL_CHECKS[goal.kind]?.(world, vehicle, goal, contacts) ?? null;
}

function stopReason(world: World, vehicle: Vehicle, goal: NpcActivity): GoalReason | null {
  if (shunsAtNight(world, vehicle, goal)) return 'leaveCrater';
  return EXPOSED.includes(goal.kind) && inCombat(world, vehicle) ? 'inCombat' : null;
}

function forget(world: World, vehicle: Vehicle, contacts: Contact[]): void {
  const brain = vehicle.brain!;
  for (const [key, last] of Object.entries(brain.noticed)) {
    const [decision, id] = key.split(':');
    if (perceives(world, vehicle, decision, id, contacts)) brain.noticed[key] = world.turn;
    else if (!heldByGoal(brain, decision, id) && world.turn - last > NPC_BEHAVIOR.noticeMemory) unnotice(brain, key, id);
  }
}

function heldByGoal(brain: NpcBrain, decision: string, id: string): boolean {
  return decision !== 'ramChance' && brain.goals.some((g) => g.targetId === id);
}

function unnotice(brain: NpcBrain, key: string, id: string): void {
  delete brain.noticed[key];
  if (key.startsWith('ramChance:') && brain.ramChoice === id) delete brain.ramChoice;
}

function perceives(world: World, vehicle: Vehicle, decision: string, id: string, contacts: Contact[]): boolean {
  if (!Object.hasOwn(PERCEIVES, decision)) throw new Error(`Unknown noticed decision ${decision}`);
  return PERCEIVES[decision as NoticedKind](world, vehicle, id, contacts);
}

export type NoticedDecision = 'preySeen' | 'strandedSeen' | 'salvageSeen' | 'ramChance' | 'escortSeen' | 'strandedFoe' | 'surrenderOffered' | 'needySeen' | 'lootContested' | 'strangerSeen' | 'crewCalled' | 'lookedOver';
type NoticedKind = NoticedDecision | 'lookWarning';

type Perception = (world: World, vehicle: Vehicle, id: string, contacts: Contact[]) => boolean;

function seesVehicle(world: World, vehicle: Vehicle, id: string): boolean {
  const other = world.vehicles.find((v) => v.id === id);
  return other !== undefined && canVehicleSee(world, vehicle, other.pos);
}

function seesStock(world: World, vehicle: Vehicle, id: string): boolean {
  const stock = world.salvage.find((s) => s.id === id) ?? world.vehicles.find((v) => v.id === id && isKnockedOut(v));
  return stock !== undefined && canVehicleSee(world, vehicle, stock.pos);
}

function hasRamChance(world: World, vehicle: Vehicle, id: string): boolean {
  return world.vehicles.some((v) => v.id === id) && offersChoice(world, vehicle, 'ramChance', id);
}

const PERCEIVES: Record<NoticedKind, Perception> = {
  preySeen: seesVehicle,
  strandedSeen: seesVehicle,
  salvageSeen: seesStock,
  ramChance: hasRamChance,
  escortSeen: seesVehicle,
  strandedFoe: seesVehicle,
  surrenderOffered: seesVehicle,
  needySeen: seesVehicle,
  lootContested: seesVehicle,
  strangerSeen: seesVehicle,
  crewCalled: seesVehicle,
  lookedOver: seesVehicle,
  lookWarning: seesVehicle,
};

export function react<D extends NoticedDecision>(world: World, vehicle: Vehicle, decision: D, id: string): DecisionOptions[D] | null {
  const key = `${decision}:${id}`;
  if (key in vehicle.brain!.noticed) return null;
  if (!offersChoice(world, vehicle, decision, id)) return 'keep' as DecisionOptions[D];
  vehicle.brain!.noticed[key] = world.turn;
  const seen = decision === 'preySeen';
  return decide(world, vehicle, decision, id, seen ? perceiveDanger(world, vehicle, vehicleById(world, id)) : null);
}

export function fightCornered(world: World, vehicle: Vehicle, foe: Vehicle, reason: GoalReason = 'cornered'): void {
  interrupt(world, vehicle, fightGoal(world, vehicle, foe, reason));
}

export function turnCornered(world: World, vehicle: Vehicle): boolean {
  if (topGoal(vehicle)?.kind === 'fight') return false;
  const foe = visibleHostiles(world, vehicle).find((other) => (inCombatWith(world, vehicle, other) || vehicle.brain!.goals.some((goal) => goal.kind === 'fight' && goal.targetId === other.id)) && canStartFight(world, vehicle, other));
  if (foe) fightCornered(world, vehicle, foe, turnReason(vehicle, foe));
  return !!foe;
}

const turnReason = (vehicle: Vehicle, foe: Vehicle): GoalReason => (topGoal(vehicle)?.kind === 'flee' ? 'cornered' : (vehicle.brain!.goals.find((goal) => goal.kind === 'fight' && goal.targetId === foe.id)?.reason ?? 'fightBack'));

type HostileDecision = 'hostileSeen' | 'contactHeard';

function rollOnHostile<D extends HostileDecision>(world: World, vehicle: Vehicle, decision: D, id: string, at: Vec): DecisionOptions[D] {
  if (!offersChoice(world, vehicle, decision, id)) return 'keep' as DecisionOptions[D];
  const seen = decision === 'hostileSeen';
  const prey = vehicleById(world, id);
  const danger = seen ? perceiveDanger(world, vehicle, prey) : null;
  const option = decide(world, vehicle, decision, id, danger);
  chooseOn(world, vehicle, id, at, option, seen);
  if (danger !== null && option === 'keep' && huntsPrey(vehicle) && huntsOffRoad(vehicle.brain ?? undefined)) {
    world.events.push({ t: 'preyPassed', vehicle: vehicle.id, prey: id, reason: passReason(world, vehicle, prey, danger) });
  }
  return option;
}

function reactSeen(world: World, vehicle: Vehicle, enemy: Vehicle, profile: NpcProfile): DecisionOptions['hostileSeen'] | null {
  const track = trackOf(vehicle, enemy.id);
  if (track?.choice === 'flee') return runsAgain(world, vehicle, track, enemy, profile);
  if (track?.chosenInSight) return null;
  return rollOnHostile(world, vehicle, 'hostileSeen', enemy.id, enemy.pos);
}

function runsAgain(world: World, vehicle: Vehicle, track: Track, enemy: Vehicle, profile: NpcProfile): 'flee' | null {
  if (!yields(world) || !comesInSight(world, track) || topGoal(vehicle)?.kind === 'flee') return null;
  const run = fleeGoal(world, vehicle, profile, enemy.id, enemy.pos, 'avoidRanFrom');
  return withinReach(vehicle, run) ? null : 'flee';
}

function reactHeard(world: World, vehicle: Vehicle, contact: Contact): DecisionOptions['contactHeard'] | null {
  if (trackOf(vehicle, contact.vehicleId)?.choice) return null;
  return rollOnHostile(world, vehicle, 'contactHeard', contact.vehicleId, contact.center);
}

function seenFleeReason(world: World, vehicle: Vehicle, enemy: Vehicle): GoalReason {
  if (trackOf(vehicle, enemy.id)?.choice === 'flee') return 'avoidRanFrom';
  return isWeak(world, vehicle) ? 'damagedThreatened' : 'avoidCostlyFight';
}

export function interrupt(world: World, vehicle: Vehicle, goal: NpcActivity): void {
  const tow = towHeldBy(world, vehicle.id);
  if (tow) {
    dropTow(world, tow, 'danger');
    if (popGoal(world, vehicle, 'droppedTow').kind !== 'tow') throw new Error(`${vehicle.id} held a tow without a tow goal on top`);
  }
  if (goal.kind === 'flee') dropChases(world, vehicle, goal.targetId, 'ranFromIt');
  if (goal.kind === 'fight' || goal.kind === 'sizeUp') dropChases(world, vehicle, goal.targetId, 'spottedHeard');
  pushGoal(world, vehicle, goal);
}

function dropChases(world: World, vehicle: Vehicle, targetId: string | null, reason: GoalReason): void {
  for (const goal of goalsOf(vehicle).filter((g) => g.kind === 'investigate' && g.targetId === targetId)) dropGoal(world, vehicle, goal, reason);
}

export function fleeFrom(world: World, vehicle: Vehicle, profile: NpcProfile, threatId: string, threatPos: Vec, reason: GoalReason): NpcActivity {
  chooseOn(world, vehicle, threatId, threatPos, 'flee', true);
  return fleeGoal(world, vehicle, profile, threatId, threatPos, reason);
}

function fleeGoal(world: World, vehicle: Vehicle, profile: NpcProfile, threatId: string, threatPos: Vec, reason: GoalReason): NpcActivity {
  return { ...createActivity('flee', threatId, fleeDestination(world, vehicle, profile, threatPos), reason), perceived: world.turn };
}

function onHostilesSeen(world: World, vehicle: Vehicle, profile: NpcProfile): void {
  for (const enemy of visibleHostiles(world, vehicle)) {
    const reason = seenFleeReason(world, vehicle, enemy);
    const option = reactSeen(world, vehicle, enemy, profile);
    if (option === null || option === 'keep') continue;
    if (option === 'fight') interrupt(world, vehicle, sizesUpFirst(world, vehicle, enemy) ? sizeUpGoal(enemy) : fightGoal(world, vehicle, enemy, 'fightHostile'));
    else interrupt(world, vehicle, fleeFrom(world, vehicle, profile, enemy.id, enemy.pos, reason));
    return;
  }
}

function onContactsHeard(world: World, vehicle: Vehicle, profile: NpcProfile, contacts: Contact[]): void {
  if (towHeldBy(world, vehicle.id)) return;
  for (const contact of hostileContacts(world, vehicle, contacts)) {
    const option = reactHeard(world, vehicle, contact);
    if (option === null || option === 'keep') continue;
    if (option === 'investigate') interrupt(world, vehicle, heardActivity(vehicle, contact));
    else interrupt(world, vehicle, fleeFrom(world, vehicle, profile, contact.vehicleId, contact.center, 'heardHostile'));
    return;
  }
}

function heardActivity(vehicle: Vehicle, contact: Contact): NpcActivity {
  const activity = createActivity('investigate', contact.vehicleId, { ...contact.center }, isWatching(vehicle) ? 'springOnPrey' : 'heardHostile');
  return { ...activity, heard: { ...contact.center } };
}

function onContactSpotted(world: World, vehicle: Vehicle): void {
  const goal = topGoal(vehicle);
  if (goal?.kind !== 'investigate') return;
  if (!canVehicleSee(world, vehicle, vehicleById(world, goal.targetId!).pos)) return;
  finishGoal(world, vehicle, 'spottedHeard');
}

function hostileContacts(world: World, vehicle: Vehicle, contacts: Contact[]): Contact[] {
  return inDanger(vehicle) ? [] : contacts.filter((contact) => isHostileContact(world, vehicle, contact));
}

function pruneAttackers(world: World, vehicle: Vehicle): void {
  const attackers = vehicle.brain!.attackers;
  if (!attackers) throw new Error(`${vehicle.id} has no attackers`);
  for (const id of Object.keys(attackers)) {
    const other = world.vehicles.find((v) => v.id === id);
    if (!other || !isHostile(world, vehicle, other) || !canVehicleSee(world, vehicle, other.pos)) delete attackers[id];
  }
}

function newAttackers(world: World, vehicle: Vehicle): Vehicle[] {
  const ids = Object.entries(vehicle.brain!.attackers).flatMap(([id, answered]) => (answered ? [] : [id]));
  return ids.map((id) => vehicleById(world, id)).sort((a, b) => dist(vehicle.pos, a.pos) - dist(vehicle.pos, b.pos));
}

function isFighting(vehicle: Vehicle, id: string): boolean {
  const top = topGoal(vehicle);
  return top?.kind === 'fight' && top.targetId === id;
}

function onAttacked(world: World, vehicle: Vehicle, profile: NpcProfile): void {
  const brain = vehicle.brain!;
  for (const shooter of newAttackers(world, vehicle)) {
    brain.attackers[shooter.id] = true;
    if (isFighting(vehicle, shooter.id)) continue;
    const option = decide(world, vehicle, 'attacked', shooter.id, perceiveDanger(world, vehicle, shooter));
    if (keepsOn(vehicle, option)) {
      letBe(world, vehicle, shooter);
      continue;
    }
    if (option === 'fightBack') interrupt(world, vehicle, fightGoal(world, vehicle, shooter, 'fightBack'));
    else interrupt(world, vehicle, fleeFrom(world, vehicle, profile, shooter.id, shooter.pos, 'escapeAttacker'));
    return;
  }
}

function keepsOn(vehicle: Vehicle, option: DecisionOptions['attacked']): boolean {
  return option === 'keep' || (option === 'fightBack' && topGoal(vehicle)?.kind === 'fight');
}

function letBe(world: World, vehicle: Vehicle, shooter: Vehicle): void {
  if (trackOf(vehicle, shooter.id)?.choice !== 'flee') chooseOn(world, vehicle, shooter.id, shooter.pos, 'keep', true);
}

function onGrievances(world: World, vehicle: Vehicle): void {
  for (const s of statesHeld(world, vehicle.id).filter((x) => x.kind === 'grievance')) {
    const other = world.vehicles.find((v) => v.id === s.other);
    if (!other) continue;
    if (isHostile(world, vehicle, other)) {
      endState(world, s, 'broken');
      continue;
    }
    if (!canVehicleSee(world, vehicle, other.pos)) continue;
    endState(world, s, 'fulfilled');
    if (decide(world, vehicle, 'crashed', other.id, null) !== 'retaliate') continue;
    reportIncident(world, { aggressor: other, victim: vehicle, deed: 'attacked', victimFights: true });
  }
}

function onParley(world: World, vehicle: Vehicle): void {
  const foe = hurtingFoe(world, vehicle);
  if (!foe) return;
  const option = decide(world, vehicle, 'parley', foe.id, perceiveDanger(world, vehicle, foe));
  if (option === 'flee') interrupt(world, vehicle, fleeFrom(world, vehicle, npcProfile(vehicle), foe.id, foe.pos, 'breakOffFight'));
  else if (option !== 'keep') plead(world, vehicle, foe, option === 'truce' ? 'truce' : 'mercy');
}

function hurtingFoe(world: World, vehicle: Vehicle): Vehicle | null {
  if (vehicle.brain!.hurt <= 0) return null;
  const foe = world.vehicles.find((v) => v.id === vehicle.lastHitBy);
  return foe && isHostile(world, vehicle, foe) && canVehicleSee(world, vehicle, foe.pos) ? foe : null;
}

export function defyThreat(world: World, vehicle: Vehicle, threatener: Vehicle, answer: Exclude<DecisionOptions['threatened'], 'comply'>, reason: GoalReason = answer === 'fightBack' ? 'refuseThreat' : 'escapeThreat'): void {
  if (reason === 'calledOut') declareFeud(world, vehicle, threatener.id);
  else reportIncident(world, { aggressor: threatener, victim: vehicle, deed: 'robbed', victimFights: true });
  if (answer === 'fightBack') interrupt(world, vehicle, fightGoal(world, vehicle, threatener, reason));
  else interrupt(world, vehicle, fleeFrom(world, vehicle, npcProfile(vehicle), threatener.id, threatener.pos, reason));
}

function onStrandedSeen(world: World, vehicle: Vehicle): void {
  if (inDanger(vehicle) || inCombat(world, vehicle)) return;
  const clients = world.vehicles
    .filter((client) => client.id !== world.player.vehicleId || !inCombat(world, client))
    .map((client) => ({ client, at: strandedAt(world, vehicle, client) }))
    .filter((c): c is { client: Vehicle; at: Vec } => c.at !== null)
    .sort((a, b) => dist(vehicle.pos, a.at) - dist(vehicle.pos, b.at));
  const chosen = clients.find((c) => react(world, vehicle, 'strandedSeen', c.client.id) === 'tow');
  if (chosen) startTow(world, vehicle, chosen.client, chosen.at);
}

function onSalvageSeen(world: World, vehicle: Vehicle): void {
  const top = topGoal(vehicle);
  if (inCombat(world, vehicle) || !top || top.phase !== 'travel' || INTERRUPTIONS.includes(top.kind)) return;
  const stocks = visibleSalvage(world, vehicle);
  const passed = [...stocks, ...visibleDowned(world, vehicle)].filter((s) => s.id !== top.targetId).sort((a, b) => dist(vehicle.pos, a.pos) - dist(vehicle.pos, b.pos));
  const loot = passed.find((s) => react(world, vehicle, 'salvageSeen', s.id) === 'loot');
  if (loot) pushGoal(world, vehicle, createActivity('loot', loot.id, { ...loot.pos }, 'lootOnTheWay'));
}

function onEscortSeen(world: World, vehicle: Vehicle): void {
  if (inDanger(vehicle)) return;
  const merc = mercsInSight(world, vehicle).find((m) => react(world, vehicle, 'escortSeen', m.id) === 'hire');
  if (merc) offerEscort(world, vehicle, merc);
}

function onRamChance(world: World, vehicle: Vehicle): void {
  const brain = vehicle.brain!;
  const target = fightTarget(vehicle);
  if (brain.ramChoice !== target) delete brain.ramChoice;
  if (target !== null && react(world, vehicle, 'ramChance', target) === 'ram') brain.ramChoice = target;
}

function onFightWhim(world: World, vehicle: Vehicle): void {
  const brain = vehicle.brain!;
  const target = fightTarget(vehicle);
  if (target === null) return void delete brain.whim;
  if (!brain.whim || world.turn >= brain.whim.until) rollWhim(world, vehicle, target);
}

function rollWhim(world: World, vehicle: Vehicle, target: string): void {
  const brain = vehicle.brain!;
  const kind = decide(world, vehicle, 'fightWhim', target, null);
  if (kind === 'veer') brain.fightTurn = brain.fightTurn === 1 ? -1 : 1;
  const angle = kind === 'veer' ? randRange(world, -Math.PI, Math.PI) : 0;
  brain.whim = { kind, until: world.turn + NPC_BEHAVIOR.fight.whimTurns, angle };
}

export function inDanger(vehicle: Vehicle): boolean {
  const top = topGoal(vehicle)?.kind;
  return top === 'fight' || top === 'flee' || top === 'sizeUp';
}

function fightTarget(vehicle: Vehicle): string | null {
  const top = topGoal(vehicle);
  return top?.kind === 'fight' ? top.targetId : null;
}

export function startTow(world: World, vehicle: Vehicle, client: Vehicle, at: Vec): void {
  const turnedDown = stateOf(world, 'turnedDown', vehicle.id, client.id);
  if (turnedDown) endState(world, turnedDown, 'fulfilled');
  vehicle.brain!.noticed[`preySeen:${client.id}`] = world.turn;
  addState(world, 'answering', vehicle.id, client.id, { kind: 'none' });
  pushGoal(world, vehicle, createActivity('tow', client.id, { ...at }, 'helpStranded'));
}

function steer(world: World, vehicle: Vehicle, profile: NpcProfile, contacts: Contact[]): void {
  const top = topGoal(vehicle);
  if (top) STEERS[top.kind]?.(world, vehicle, top, profile, contacts);
}

type Steer = (world: World, vehicle: Vehicle, goal: NpcActivity, profile: NpcProfile, contacts: Contact[]) => void;

const STEERS: Partial<Record<NpcActivity['kind'], Steer>> = {
  fight: steerFight,
  flee: (world, vehicle, goal, profile, contacts) => steerFlee(world, vehicle, profile, contacts, goal),
  tow: (world, vehicle, goal) => { if (!towHeldBy(world, vehicle.id)) steerToStranded(world, vehicle, goal); },
  meet: (world, _vehicle, goal) => { if (goal.destination) goal.destination = { ...vehicleById(world, goal.targetId!).pos }; },
  follow: steerFollow,
  muster: steerMuster,
  investigate: steerInvestigate,
  sizeUp: steerSizeUp,
};

export function ledPoint(center: Vec, heard: Vec | undefined, radius: number, reach: number): Vec {
  if (!heard) return { ...center };
  const drift = dist(center, heard);
  if (drift <= radius) return { ...center };
  const lead = Math.min(drift - radius, reach);
  return { x: center.x + ((center.x - heard.x) / drift) * lead, y: center.y + ((center.y - heard.y) / drift) * lead };
}

function steerInvestigate(world: World, vehicle: Vehicle, goal: NpcActivity, _profile: NpcProfile, contacts: Contact[]): void {
  if (!goal.targetId) throw new Error('An investigation has no target');
  const contact = contacts.find((c) => c.vehicleId === goal.targetId);
  if (!contact) return;
  const reach = vehicleStats(world, vehicle).maxSpeed;
  if (!Number.isFinite(reach)) throw new Error(`${vehicle.id} has no finite reach`);
  goal.destination = ledPoint(contact.center, goal.heard, contact.radius, reach);
  goal.heard = { ...contact.center };
}

function steerFlee(world: World, vehicle: Vehicle, profile: NpcProfile, contacts: Contact[], goal: NpcActivity): void {
  const threat = fleeThreat(world, vehicle, contacts, goal);
  if (threat && !keepsFleePoint(vehicle, goal, threat)) goal.destination = fleeDestination(world, vehicle, profile, threat);
  if (threat || vehicle.brain!.hurt > 0) goal.perceived = world.turn;
}

function keepsFleePoint(vehicle: Vehicle, goal: NpcActivity, threat: Vec): boolean {
  return goal.destination !== null && leadsAwayBy(vehicle.pos, goal.destination, threat, NPC_BEHAVIOR.fleeKeepAngle);
}

function fleeThreat(world: World, vehicle: Vehicle, contacts: Contact[], goal: NpcActivity): Vec | undefined {
  const target = world.vehicles.find((v) => v.id === goal.targetId);
  if (target && canVehicleSee(world, vehicle, target.pos)) return target.pos;
  return visibleHostiles(world, vehicle)[0]?.pos ?? contacts.find((c) => c.vehicleId === goal.targetId)?.center;
}

export function thinkNpc(world: World, vehicle: Vehicle): NpcActivity {
  const brain = vehicle.brain;
  if (!brain) throw new Error(`${vehicle.id} has no NPC brain`);
  if (!brain.noticed) throw new Error(`${vehicle.id} has no noticed list`);
  const profile = npcProfile(vehicle);
  const { seen, contacts } = npcSenses(world, vehicle);
  forget(world, vehicle, contacts);
  senseTracks(world, vehicle, seen, contacts);
  rememberSightings(world, vehicle, seen);
  pruneAttackers(world, vehicle);
  forgetFullHold(world, vehicle);
  breakOffDeals(world, vehicle);
  giveUpStrandedRobberies(world, vehicle);
  giveUpStalledFight(world, vehicle);
  abandonLostSizing(world, vehicle, contacts);
  dropInvalidGoals(world, vehicle, contacts);
  serveStranded(world, vehicle, profile);
  if (isDefeated(vehicle)) return defeatedActivity(world, vehicle, profile, contacts);
  applyFixedRules(world, vehicle, profile);
  onGrievances(world, vehicle);
  onParley(world, vehicle);
  dropInvalidGoals(world, vehicle, contacts);
  onAttacked(world, vehicle, profile);
  onHostilesSeen(world, vehicle, profile);
  onCrewCall(world, vehicle);
  onContactSpotted(world, vehicle);
  onContactsHeard(world, vehicle, profile, contacts);
  onSizingUp(world, vehicle);
  onPreySeen(world, vehicle);
  onHoldUp(world, vehicle);
  onStrandedSeen(world, vehicle);
  onNeedySeen(world, vehicle);
  onStrangerSeen(world, vehicle);
  onSalvageSeen(world, vehicle);
  onEscortSeen(world, vehicle);
  onRamChance(world, vehicle);
  onFightWhim(world, vehicle);
  judgeStrandedFoe(world, vehicle);
  dropInvalidGoals(world, vehicle, contacts);
  steer(world, vehicle, profile, contacts);
  return currentActivity(world, vehicle, profile);
}

function defeatedActivity(world: World, vehicle: Vehicle, profile: NpcProfile, contacts: Contact[]): NpcActivity {
  const top = topGoal(vehicle);
  if (!top || !DEAL_GOALS.includes(top.kind)) return retreatHome(world, vehicle);
  steer(world, vehicle, profile, contacts);
  return currentActivity(world, vehicle, profile);
}

function retreatHome(world: World, vehicle: Vehicle): NpcActivity {
  return isSunwardMember(vehicle) ? sunwardRetreat(world, vehicle) : retreatToSite(world, vehicle);
}

function retreatToSite(world: World, vehicle: Vehicle): NpcActivity {
  const top = topGoal(vehicle)?.kind;
  if (top !== 'retreat' && top !== 'rearm') {
    const home = npcHomeSite(world, vehicle);
    if (!home) throw new Error(`${vehicle.id} knows no home to retreat to`);
    pushGoal(world, vehicle, createSiteActivity('retreat', home.id, 'retreatHome'));
  }
  if (awaitsTower(world, vehicle)) return createActivity('wait', null, null, 'waitTow');
  return topGoal(vehicle)!;
}

function dropInvalidGoals(world: World, vehicle: Vehicle, contacts: Contact[]): void {
  for (let top = topGoal(vehicle); top; top = topGoal(vehicle)) {
    const reason = invalidReason(world, vehicle, top, contacts);
    if (!reason) break;
    finishGoal(world, vehicle, reason);
  }
}

function applyFixedRules(world: World, vehicle: Vehicle, profile: NpcProfile): void {
  if (isSunwardMember(vehicle)) planSunward(world, vehicle);
  else applyRoadRules(world, vehicle, profile);
}

function applyRoadRules(world: World, vehicle: Vehicle, profile: NpcProfile): void {
  if (towHeldBy(world, vehicle.id)) {
    keepTowGoal(world, vehicle);
    return;
  }
  const top = topGoal(vehicle)?.kind;
  if (top === 'tow' || top === 'patch' || top === 'meet') return;
  pushService(world, vehicle, profile);
}

function keepTowGoal(world: World, vehicle: Vehicle): void {
  const goal = towGoal(world, vehicle);
  const top = topGoal(vehicle);
  if (top?.kind !== 'tow' || top.targetId !== goal.targetId || top.reason !== goal.reason) pushGoal(world, vehicle, goal);
}

function pushService(world: World, vehicle: Vehicle, profile: NpcProfile): void {
  const service = serviceGoal(world, vehicle, profile);
  const urgent = service !== null && needsUrgentSupplies(world, vehicle, profile);
  if (!urgent && staysOnWork(world, vehicle)) return;
  if (service && !vehicle.brain!.goals.some((g) => g.kind === service.kind)) pushGoal(world, vehicle, service);
}

function staysOnWork(world: World, vehicle: Vehicle): boolean {
  if (vehicle.job?.kind === 'refit' && jobBelongs(vehicle.job, vehicle)) return true;
  return keepRepairing(world, vehicle);
}

function needsUrgentSupplies(world: World, vehicle: Vehicle, profile: NpcProfile): boolean {
  const resources = getResources(world, vehicle);
  if (resources.supplies <= suppliesCap(vehicle) * NPC_UPKEEP.lowSupplies) return true;
  return resources.fuel > 0 && isLowOnFuel(world, vehicle, profile);
}

function keepRepairing(world: World, vehicle: Vehicle): boolean {
  if (holdRepair(world, vehicle)) return true;
  if (inCombat(world, vehicle) || inDanger(vehicle)) return false;
  const repair = chooseNpcRepair(world, vehicle, NPC_BEHAVIOR.recoverCondition);
  if (repair) pushGoal(world, vehicle, repair);
  return repair !== null;
}

function holdRepair(world: World, vehicle: Vehicle): boolean {
  const current = goalsOf(vehicle).find((g) => g.kind === 'repair');
  if (!current) return false;
  if (inCombat(world, vehicle) && vehicle.job?.kind !== 'repair') {
    dropGoal(world, vehicle, current, 'combatStopsRepair');
    return false;
  }
  continueNpcRepair(world, vehicle, current);
  return true;
}

function currentActivity(world: World, vehicle: Vehicle, profile: NpcProfile): NpcActivity {
  if (awaitsTower(world, vehicle)) return createActivity('wait', null, null, 'waitTow');
  return topGoal(vehicle) ?? nextGoal(world, vehicle, profile);
}

export function awaitsTower(world: World, vehicle: Vehicle): boolean {
  return !inDanger(vehicle) && world.states.some((s) => s.kind === 'answering' && s.other === vehicle.id);
}

function nextGoal(world: World, vehicle: Vehicle, profile: NpcProfile): NpcActivity {
  if (isSunwardMember(vehicle)) return sunwardNext(world, vehicle);
  const next = nightSafe(world, vehicle, hasSaleCargo(vehicle) ? saleGoal(world, vehicle, profile) : idleGoal(world, vehicle));
  if (next.kind !== 'wait' && topGoal(vehicle) !== next) pushGoal(world, vehicle, next);
  return next;
}

export function noteHurt(world: World): void {
  const hits = turnPartHits(world);
  for (const v of world.vehicles) {
    if (v.brain) v.brain.hurt = (hits.get(v.id) ?? []).reduce((sum, hit) => sum + hit.damage, 0);
  }
}

export function getActivityDestination(world: World, vehicle: Vehicle, activity: NpcActivity): Vec | null {
  if (!activity.destination) return null;
  if (activity.kind === 'repair' || activity.kind === 'rearm' || activity.kind === 'wait') return parksHere(vehicle, activity) ? null : activity.destination;
  if (['fight', 'flee', 'raid', 'prowl', 'investigate', 'patrol', 'explore', 'follow', 'muster', 'sizeUp'].includes(activity.kind)) return activity.destination;
  return siteStop(world, vehicle, activity, activity.destination);
}

function parksHere(vehicle: Vehicle, activity: NpcActivity): boolean {
  if (activity.kind === 'wait') return withinReach(vehicle, activity);
  return activity.kind === 'repair' ? repairsHere(vehicle, activity) : liesUp(vehicle);
}

function siteStop(world: World, vehicle: Vehicle, activity: NpcActivity, destination: Vec): Vec {
  const out = vehicleStats(world, vehicle).radius + RULES.arriveRadius;
  const site = [...REGION.towns, ...REGION.locations].find((entry) => entry.id === activity.targetId);
  if (site) return padStop(world, vehicle, activity, site, out);
  return bodyStop(world, vehicle, activity, destination, out);
}

function padStop(world: World, vehicle: Vehicle, activity: NpcActivity, site: Site, out: number): Vec {
  if (isTerritory(site)) return activity.destination!;
  if (activity.kind === 'tow') return towStop(world, vehicle, site);
  return parkedOn(vehicle, site) ? { ...vehicle.pos } : siteSpot(world, vehicle, site, out);
}

function siteSpot(world: World, vehicle: Vehicle, site: ReturnType<typeof getKnownSite>, out: number): Vec {
  const spot = hashRandom(world.seed, ...charCodes(vehicle.id), ...charCodes(site.id));
  const pad = nearestPad(site, vehicle.pos);
  const angle = Math.atan2(pad.y - site.pos.y, pad.x - site.pos.x);
  const side = (REGION.sites.pad.width / 2 - out) * (2 * spot - 1);
  return { x: pad.x - Math.sin(angle) * side, y: pad.y + Math.cos(angle) * side };
}

export function charCodes(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0));
}

type Resolver = (world: World, vehicle: Vehicle, activity: NpcActivity) => void;

function resolveTow(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  const ended = runTow(world, vehicle, activity);
  if (ended) finishGoal(world, vehicle, ended);
}

function resolveSearch(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  if (heldByLooter(world, vehicle, activity)) return;
  const truck = world.vehicles.find((v) => v.id === activity.targetId);
  if (truck) { resolveTruckLoot(world, vehicle, activity, truck); return; }
  const found = searchTarget(world, vehicle, activity.targetId);
  if ('ended' in found) { finishGoal(world, vehicle, found.ended); return; }
  const { stock } = found;
  if (worksOnLoot(vehicle, stock.id)) { activity.phase = 'act'; return; }
  if (!canReachSalvage(vehicle, stock)) return;
  activity.phase = 'act';
  searchStock(world, vehicle, stock);
}

function resolveTruckLoot(world: World, vehicle: Vehicle, activity: NpcActivity, truck: Vehicle): void {
  if (!canLootTruck(world, vehicle, truck)) return;
  activity.phase = 'act';
  const ended = lootTruckTurn(world, vehicle, truck);
  if (ended) finishGoal(world, vehicle, ended);
}

function searchStock(world: World, vehicle: Vehicle, stock: SalvageStock): void {
  if (!hasSalvage(stock)) return void finishGoal(world, vehicle, STRIPPED);
  if (claimOnly(world, vehicle, stock)) return void finishGoal(world, vehicle, CLAIMED);
  if (!canTakeAny(world, vehicle, stock)) return void finishGoal(world, vehicle, CANNOT_HOLD);
  if (vehicle.job) return;
  if (inCombat(world, vehicle)) finishGoal(world, vehicle, 'combatStopsSearch');
  else if (!warnedOff(world, vehicle, stock)) beginSearch(world, vehicle, stock.id);
}

export function withinReach(vehicle: Vehicle, activity: NpcActivity): boolean {
  return activity.destination !== null && dist(vehicle.pos, activity.destination) <= GOAL_REACH;
}

function reachedDestination(world: World, vehicle: Vehicle, activity: NpcActivity): boolean {
  return withinReach(vehicle, activity) || world.events.some((e) => e.t === 'arrived' && e.vehicle === vehicle.id);
}

function resolveRaid(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  if (activity.phase === 'travel' && reachedDestination(world, vehicle, activity)) startWatch(world, activity);
}

function resolveFlee(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  if (reachedDestination(world, vehicle, activity) && !turnCornered(world, vehicle)) finishGoal(world, vehicle, 'nowhereToRun');
}

function resolveInvestigate(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  if (reachedDestination(world, vehicle, activity)) finishGoal(world, vehicle, 'foundNothing');
}

export function reachSite(vehicle: Vehicle, activity: NpcActivity): ReturnType<typeof getKnownSite> | null {
  const site = getKnownSite(activity.targetId!);
  if (!canUseSite(vehicle.pos, site)) return null;
  activity.phase = 'act';
  return site;
}

export function noteShop(world: World, vehicle: Vehicle, siteId: string): void {
  if (siteId in SHOPS) remember(world, vehicle, { kind: 'prices', shop: siteId, pressure: standingPressures(world, siteId) });
}

function resolveTravel(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  const arrived = isTerritory(getKnownSite(activity.targetId!)) ? reachedDestination(world, vehicle, activity) : reachSite(vehicle, activity);
  if (arrived) finishLeg(world, vehicle, activity, 'arrived');
}

export function payForLeg(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  payDuty(world, vehicle, activity, escortsOf(world, vehicle.id));
}

function finishLeg(world: World, vehicle: Vehicle, activity: NpcActivity, reason: GoalReason): void {
  payForLeg(world, vehicle, activity);
  finishGoal(world, vehicle, reason);
}

function arrivalResolver(reason: GoalReason): Resolver {
  return (world, vehicle, activity) => {
    if (reachedDestination(world, vehicle, activity)) finishLeg(world, vehicle, activity, reason);
  };
}

function resolveRetreat(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  const site = reachSite(vehicle, activity);
  if (site) beginRearm(world, vehicle, site);
}

function resolveWait(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  if (activity.until === undefined) throw new Error(`${vehicle.id} waits with no until turn`);
  if (withinReach(vehicle, activity)) activity.phase = 'act';
  if (world.turn >= activity.until) finishGoal(world, vehicle, 'tripToSite');
}

function resolveRepair(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  if (resolveNpcRepair(world, vehicle, activity)) finishGoal(world, vehicle, 'finishedRepairs');
}

const RESOLVERS: Partial<Record<NpcActivity['kind'], Resolver>> = {
  tow: resolveTow,
  repair: resolveRepair,
  retreat: resolveRetreat,
  rearm: resolveRearm,
  wait: resolveWait,
  scavenge: resolveSearch,
  loot: resolveSearch,
  claim: resolveClaim,
  raid: resolveRaid,
  investigate: resolveInvestigate,
  flee: resolveFlee,
  resupply: resolveResupply,
  sell: resolveSell,
  trade: resolveTrade,
  travel: resolveTravel,
  prowl: arrivalResolver('prowledRoad'),
  patrol: arrivalResolver('patrolledRoad'),
  explore: arrivalResolver('exploredSpot'),
};

function resolveActivity(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  RESOLVERS[activity.kind]?.(world, vehicle, activity);
}

function canAct(world: World, vehicle: Vehicle): boolean {
  if (isKnockedOut(vehicle) || corePart(vehicle, 'cab').hp <= 0 || getResources(world, vehicle).health <= 0) return false;
  return vehicle.speed <= RULES.parkedSpeed && !isOnRope(world, vehicle.id);
}

export function resolveNpcActivities(world: World): void {
  reactToLookOvers(world);
  for (const vehicle of world.vehicles) {
    if (vehicle.brain) lookOverPrey(world, vehicle);
    if (!vehicle.brain || !canAct(world, vehicle)) continue;
    const top = topGoal(vehicle);
    if (top) resolveActivity(world, vehicle, top);
  }
}
