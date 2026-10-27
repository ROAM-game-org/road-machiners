import { ESCORT_JOB, SHOPS, type Threat } from '../data/market';
import { NPC_BEHAVIOR } from '../data/npcs';
import { REGION } from '../data/region';
import { inCombat, isHostile } from './combat';
import { playerVehicle } from './damage';
import { isDefeated } from './defeat';
import { newId } from './factory';
import { fightOdds } from './fight-odds';
import { contractReward, estimateTurns, finishContract, shopState, siteOf, type Contract } from './market';
import { decide, firepower, getKnownSite, keepsWord, raiderGrounds, raiderPatrolPosts } from './npc-decisions';
import { inDanger, pushGoal, topGoal } from './npc-activities';
import { lieUpSpot } from './npc-service';
import { reachedSite } from './sites';
import { endState, stateOf } from './states';
import { isStranded } from './stats';
import { recall } from './memory';
import { shipmentOf } from './road-news';
import { escortsOf, hireEscort, isOnRope } from './tow';
import type { Terrain } from './terrain';
import type { EscortEnd, NpcActivity, Vehicle, World } from './types';
import { clamp, dist, segmentDist, type Vec } from './vec';
import { canVehicleSee } from './vision';
import { fairM } from './money';

export type EscortContract = Extract<Contract, { kind: 'escort' }>;
export type EscortStatus = 'together' | 'waiting' | 'holding' | 'apart' | 'stuck';
export type EscortBlock = 'weak' | 'escorting' | 'full';

const NO_DEADLINE = Number.MAX_SAFE_INTEGER;

const threats = new WeakMap<Terrain, Map<string, Threat>>();

function postsNear(world: World, from: Vec, to: Vec): number {
  const camps = REGION.locations.filter((site) => site.kind === 'camp');
  const posts = camps.flatMap((camp) => [...raiderGrounds(world, camp), ...raiderPatrolPosts(world, camp)]);
  return posts.filter((post) => segmentDist(post, from, to) <= ESCORT_JOB.threatReach).length;
}

export function routeThreat(world: World, from: string, to: string): Threat {
  let cache = threats.get(world.terrain);
  if (!cache) {
    cache = new Map();
    threats.set(world.terrain, cache);
  }
  const key = `${from}>${to}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const count = postsNear(world, siteOf(from).pos, siteOf(to).pos);
  const threat: Threat = count === 0 ? 1 : count <= 2 ? 2 : 3;
  cache.set(key, threat);
  return threat;
}

export function escortReward(from: string, to: string, threat: Threat): number {
  const turns = estimateTurns(siteOf(from).pos, siteOf(to).pos);
  return fairM(contractReward(turns, 0, false) * ESCORT_JOB.threatPremium[threat]);
}

export function heldEscort(world: World): EscortContract | null {
  return world.player.contracts.find((c): c is EscortContract => c.kind === 'escort') ?? null;
}

function clientOf(world: World, c: EscortContract): Vehicle | undefined {
  return world.vehicles.find((v) => v.id === c.client);
}

export function escortFit(world: World, c: EscortContract): { fit: boolean; win: number; need: number } {
  const need = ESCORT_JOB.minWin[c.threat];
  const client = clientOf(world, c);
  if (!client) return { fit: false, win: 0, need };
  const player = playerVehicle(world);
  const win = fightOdds(world, [player], [client]).win;
  return { fit: firepower(world, player) > 0 && win >= need, win, need };
}

export function escortBlocked(world: World, c: EscortContract): EscortBlock | null {
  if (heldEscort(world)) return 'escorting';
  return escortFit(world, c).fit ? null : 'weak';
}

function postsTrip(trip: NpcActivity, from: string, vehicle: Vehicle): trip is NpcActivity & { targetId: string } {
  const to = trip.targetId;
  return !trip.posted && to !== null && to !== from && from in SHOPS && vehicle.brain!.traits.includes('trader');
}

function freeToWait(world: World, vehicle: Vehicle): boolean {
  if (inDanger(vehicle) || inCombat(world, vehicle)) return false;
  return escortsOf(world, vehicle.id).length === 0 && !keepsWord(world, vehicle, 'escortWanted', null);
}

export function onEscortWanted(world: World, vehicle: Vehicle, trip: NpcActivity, from: string): void {
  if (!postsTrip(trip, from, vehicle) || !freeToWait(world, vehicle)) return;
  const to = trip.targetId;
  trip.posted = true;
  if (decide(world, vehicle, 'escortWanted', `${from}>${to}`, null) !== 'post') return;
  const spot = lieUpSpot(world, vehicle, getKnownSite(from));
  postEscortOffer(world, vehicle, from, to);
  pushGoal(world, vehicle, { kind: 'wait', targetId: null, destination: spot, phase: 'travel', reason: 'awaitEscort', until: world.turn + ESCORT_JOB.postTurns });
}

export function postEscortOffer(world: World, trader: Vehicle, shopId: string, to: string): void {
  const threat = routeThreat(world, shopId, to);
  const span = dist(trader.pos, getKnownSite(to).pos);
  const offer: EscortContract = {
    id: newId(world, 'ct'),
    shop: shopId,
    kind: 'escort',
    client: trader.id,
    to,
    reward: escortReward(shopId, to, threat),
    deadline: world.turn + ESCORT_JOB.postTurns,
    window: ESCORT_JOB.postTurns,
    tier: threat,
    threat,
    span,
    together: span,
    seen: null,
    apart: 0,
    stuck: 0,
    holdUntil: null,
  };
  shopState(world, shopId).contracts.push(offer);
}

export function awaitsEscort(trader: Vehicle): boolean {
  const top = topGoal(trader);
  return top?.kind === 'wait' && top.reason === 'awaitEscort';
}

export function escortOfferOpen(world: World, c: EscortContract): boolean {
  const trader = clientOf(world, c);
  if (!trader || isDefeated(trader) || inCombat(world, trader)) return false;
  return awaitsEscort(trader) && escortsOf(world, trader.id).length === 0;
}

export function pruneEscortOffers(world: World): void {
  for (const state of Object.values(world.shops)) {
    if (state.contracts.some((c) => c.kind === 'escort')) state.contracts = state.contracts.filter((c) => c.kind !== 'escort' || escortOfferOpen(world, c));
  }
}

export function takeEscortJob(world: World, c: EscortContract): void {
  const trader = clientOf(world, c);
  if (!trader || !escortOfferOpen(world, c)) throw new Error(`The trader of offer ${c.id} is no longer waiting`);
  const blocked = escortBlocked(world, c);
  if (blocked) throw new Error(`Cannot take escort ${c.id}: ${blocked}`);
  const span = dist(trader.pos, getKnownSite(c.to).pos);
  c.span = span;
  c.together = span;
  c.deadline = NO_DEADLINE;
  hireEscort(world, playerVehicle(world), trader, c.to, 0);
}

function playerHelpless(world: World): boolean {
  const player = playerVehicle(world);
  return isStranded(world, player) || isOnRope(world, player.id);
}

function holdActive(world: World, c: EscortContract): boolean {
  return c.holdUntil !== null && world.turn < c.holdUntil;
}

export function holdEscort(world: World, c: EscortContract): void {
  c.holdUntil = world.turn + ESCORT_JOB.holdTurns;
}

export function releaseHold(c: EscortContract): void {
  c.holdUntil = null;
}

export function escortHolds(world: World, leader: Vehicle): boolean {
  const c = heldEscort(world);
  return c !== null && c.client === leader.id && holdActive(world, c);
}

function remaining(leader: Vehicle, siteId: string): number {
  return dist(leader.pos, getKnownSite(siteId).pos);
}

export function traderWaits(world: World, leader: Vehicle, escort: Vehicle): boolean {
  const c = heldEscort(world);
  if (!c || c.client !== leader.id) return false;
  if (holdActive(world, c)) return true;
  if (playerHelpless(world)) return true;
  return remaining(escort, c.to) - remaining(leader, c.to) > NPC_BEHAVIOR.escortWaitGap;
}

export function escortStatus(world: World, c: EscortContract): EscortStatus {
  const trader = clientOf(world, c);
  if (!trader) return 'together';
  if (playerHelpless(world)) return 'stuck';
  if (holdActive(world, c)) return 'holding';
  if (dist(playerVehicle(world).pos, trader.pos) > ESCORT_JOB.apartGap) return 'apart';
  return traderWaits(world, trader, playerVehicle(world)) ? 'waiting' : 'together';
}

export function turnsLeft(world: World, c: EscortContract): number | null {
  const status = escortStatus(world, c);
  if (status === 'apart') return ESCORT_JOB.graceTurns - c.apart;
  if (status === 'stuck') return ESCORT_JOB.stuckTurns - c.stuck;
  if (status === 'holding') return c.holdUntil! - world.turn;
  return null;
}

export function escortShare(c: EscortContract): number {
  if (c.span <= 0) return 1;
  return clamp(1 - c.together / c.span, 0, 1);
}

function conclude(world: World, c: EscortContract, outcome: 'done' | 'released' | 'failed', end: EscortEnd): void {
  const state = stateOf(world, 'escort', world.player.vehicleId, c.client);
  if (state) endState(world, state, end === 'arrived' ? 'fulfilled' : 'broken');
  world.events.push({ t: 'escortEnded', contract: c.id, client: c.client, end });
  finishContract(world, c, outcome);
}

function endedBy(world: World, c: EscortContract, player: Vehicle, client: Vehicle | undefined): { outcome: 'released' | 'failed'; end: EscortEnd } | null {
  if (isDefeated(player)) return { outcome: 'released', end: 'knockedOut' };
  if (!client || isDefeated(client)) return { outcome: 'released', end: 'lost' };
  if (isHostile(world, player, client) || isHostile(world, client, player)) return { outcome: 'failed', end: 'hostile' };
  if (robbedClient(world, player, client)) return { outcome: 'failed', end: 'hostile' };
  return null;
}

function robbedClient(world: World, player: Vehicle, client: Vehicle): boolean {
  const escort = stateOf(world, 'escort', player.id, client.id);
  if (!escort) return false;
  return recall(client, 'wronged').some((m) => m.fact.by === player.id && m.fact.deed === 'robbed' && m.turn >= escort.born);
}

function haulOver(client: Vehicle, c: EscortContract): boolean {
  return shipmentOf(client)?.to !== c.to && !client.items.some((it) => it.kind === 'good');
}

function trackTogether(world: World, c: EscortContract, player: Vehicle, client: Vehicle): void {
  if (canVehicleSee(world, player, client.pos)) c.seen = { x: client.pos.x, y: client.pos.y, turn: world.turn };
  if (dist(player.pos, client.pos) <= ESCORT_JOB.apartGap) {
    c.together = remaining(client, c.to);
    c.apart = 0;
  }
  if (c.holdUntil !== null && !holdActive(world, c)) c.holdUntil = null;
}

function tickApart(world: World, c: EscortContract, player: Vehicle, client: Vehicle): boolean {
  if (dist(player.pos, client.pos) <= ESCORT_JOB.apartGap) return false;
  if (playerHelpless(world) || holdActive(world, c) || inCombat(world, player) || inCombat(world, client)) return false;
  c.apart++;
  if (c.apart === 1) world.events.push({ t: 'contract', contract: { ...c }, outcome: 'apart' });
  return c.apart >= ESCORT_JOB.graceTurns;
}

function tickStuck(world: World, c: EscortContract): boolean {
  if (!playerHelpless(world)) {
    c.stuck = 0;
    return false;
  }
  c.stuck++;
  return c.stuck >= ESCORT_JOB.stuckTurns;
}

function arrive(world: World, c: EscortContract, player: Vehicle, client: Vehicle): void {
  const together = dist(player.pos, client.pos) <= ESCORT_JOB.apartGap;
  if (together) c.together = 0;
  conclude(world, c, together ? 'done' : 'released', together ? 'arrived' : 'apartAtArrival');
}

export function onHaulDelivered(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  const c = heldEscort(world);
  if (!c || c.client !== vehicle.id || c.to !== activity.shipment?.to) return;
  arrive(world, c, playerVehicle(world), vehicle);
}

export function settleEscortJob(world: World, c: EscortContract): void {
  const player = playerVehicle(world);
  const client = clientOf(world, c);
  const over = endedBy(world, c, player, client);
  if (over) return conclude(world, c, over.outcome, over.end);
  if (!client) throw new Error(`Escort ${c.id} lost its client without a reason`);
  if (reachedSite(client.pos, getKnownSite(c.to))) return arrive(world, c, player, client);
  if (!stateOf(world, 'escort', player.id, client.id)) throw new Error(`Escort ${c.id} lost its state with nothing to explain it`);
  if (haulOver(client, c)) return conclude(world, c, 'released', 'cargoLost');
  trackTogether(world, c, player, client);
  if (tickStuck(world, c)) return conclude(world, c, 'released', 'stuck');
  if (tickApart(world, c, player, client)) conclude(world, c, 'failed', 'strayed');
}
