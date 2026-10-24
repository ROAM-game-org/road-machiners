import { CLAIM_LOOKS, CONTRACTS, SHOPS, type ClaimLook } from '../data/market';
import { REGION } from '../data/region';
import { WRECK_LOOKS } from '../data/territory';
import { playerTrucks, playerVehicle } from './damage';
import { isDefeated, isKnockedOut } from './defeat';
import { pushGoal } from './npc-activities';
import { canStowPart, liveClaims, MAX_RADIUS, oldSpotOf, reachable, type ClaimContract } from './salvage';
import { navLayer, type NavLayer } from './nav/layer';
import { ROAD_INDEX } from './road-index';
import { spotLookOf, territoryAt, territoryOfStock } from './territory';
import type { PartInstance, SalvageStock, StateKindId, Vehicle, World } from './types';
import { isJunk, partValue } from './wear';
import { gridSquareOf, sameGridSquare, type GridSquare } from './map-grid';
import { dist, type Vec } from './vec';

export type ClaimTarget = { stock: SalvageStock; part: PartInstance };

function isWreckSpot(stock: SalvageStock): boolean {
  const look = spotLookOf(stock);
  if (look !== null && territoryOfStock(stock) !== null) return WRECK_LOOKS.includes(look);
  return oldSpotOf(stock)?.type === 'hulks';
}

function townPlaces(): { pos: { x: number; y: number }; radius: number }[] {
  const shopSites = REGION.locations.filter((site) => site.id in SHOPS);
  return [...REGION.towns, ...shopSites];
}

function isRemote(stock: SalvageStock): boolean {
  const clear = townPlaces().every((place) => dist(place.pos, stock.pos) - place.radius >= CONTRACTS.claim.minTownGap);
  return clear && ROAD_INDEX.nearestWithin(stock.pos.x, stock.pos.y, CONTRACTS.claim.minRoadGap) === Infinity;
}

function isReachable(world: World, layer: NavLayer, stock: SalvageStock): boolean {
  const propId = oldSpotOf(stock)?.propId ?? stock.id;
  const prop = world.obstacles.find((o) => o.id === propId);
  return prop !== undefined && reachable(layer, prop, REGION.navigation.reachClimb);
}

export function claimSpots(world: World): SalvageStock[] {
  const candidates = world.salvage.filter((stock) => isWreckSpot(stock) && isRemote(stock));
  if (candidates.length === 0) return [];
  const layer = navLayer(world.terrain, world.obstacles, MAX_RADIUS);
  return candidates.filter((stock) => isReachable(world, layer, stock));
}

export function claimTargets(world: World): ClaimTarget[] {
  const named = new Set(liveClaims(world).map((c) => c.stockId));
  return claimSpots(world)
    .filter((stock) => !named.has(stock.id))
    .flatMap((stock) => [...stock.parts, ...stock.hidden.parts].filter((part) => !isJunk(part)).map((part) => ({ stock, part })));
}

function requireTurns(turns: number): void {
  if (!Number.isFinite(turns) || turns < 0) throw new Error(`A claim needs a finite trip of at least 0 turns, got ${turns}`);
}

export function claimReward(part: PartInstance, travelPay: number): number {
  if (!Number.isFinite(travelPay) || travelPay < 0) throw new Error(`A claim needs a finite travel pay of at least 0, got ${travelPay}`);
  return Math.round(partValue(part) + travelPay * CONTRACTS.claim.travelShare);
}

export function claimRivalAt(postTurn: number, turns: number): number {
  requireTurns(turns);
  return postTurn + Math.round(turns * CONTRACTS.claim.rivalLeadFactor) + CONTRACTS.claim.searchTurns;
}

export function claimWindow(turns: number): number {
  requireTurns(turns);
  const claim = CONTRACTS.claim;
  return Math.round(2 * turns * claim.durationFactor + claim.searchTurns + claim.slackTurns);
}

export type PartWhere = 'stock' | 'player' | 'rival' | 'gone';

function inStock(world: World, c: ClaimContract): boolean {
  const stock = world.salvage.find((s) => s.id === c.stockId);
  return !!stock && [...stock.parts, ...stock.hidden.parts].some((p) => p.id === c.partId);
}

export function carriesPart(v: Vehicle, partId: string): boolean {
  return v.items.some((it) => it.kind === 'part' && it.part.id === partId);
}

function heldByPlayer(world: World, partId: string): boolean {
  return world.player.storage.some((p) => p.id === partId) || carriesPart(playerVehicle(world), partId);
}

function heldByRival(world: World, c: ClaimContract): boolean {
  const rival = world.vehicles.find((v) => v.id === c.rival);
  return rival !== undefined && carriesPart(rival, c.partId);
}

export function claimPartHeld(world: World, c: ClaimContract): PartWhere {
  if (inStock(world, c)) return 'stock';
  if (heldByPlayer(world, c.partId)) return 'player';
  return heldByRival(world, c) ? 'rival' : 'gone';
}

export function findClaim(world: World, id: string): ClaimContract | null {
  return liveClaims(world).find((c) => c.id === id) ?? null;
}

const BUSY_STATES: readonly StateKindId[] = ['tow', 'towPromise', 'answering', 'patch', 'trade', 'escort', 'aid', 'combat', 'plea', 'lootWarning'];

function busyInState(world: World, v: Vehicle): boolean {
  return world.states.some((s) => BUSY_STATES.includes(s.kind) && (s.holder === v.id || s.other === v.id));
}

function onClaimRun(v: Vehicle): boolean {
  return !!v.brain?.goals.some((g) => g.kind === 'claim');
}

function hasRivalTrait(world: World, v: Vehicle): boolean {
  return !!v.brain && !playerTrucks(world).includes(v) && v.brain.traits.some((t) => CONTRACTS.claim.rivalTraits.includes(t));
}

function isIdle(world: World, v: Vehicle): boolean {
  return !isKnockedOut(v) && !isDefeated(v) && !v.job && !onClaimRun(v) && !busyInState(world, v);
}

export function isFreeRival(world: World, v: Vehicle, part: PartInstance): boolean {
  return hasRivalTrait(world, v) && isIdle(world, v) && canStowPart(v, part);
}

function claimPart(world: World, c: ClaimContract): PartInstance {
  const stock = world.salvage.find((s) => s.id === c.stockId);
  const part = stock && [...stock.parts, ...stock.hidden.parts].find((p) => p.id === c.partId);
  if (!part) throw new Error(`Claim ${c.id} part ${c.partId} is not in its wreck`);
  return part;
}

export function rivalDue(world: World, c: ClaimContract): boolean {
  if (c.rival !== null || world.turn < c.rivalAt) return false;
  return (world.turn - c.rivalAt) % CONTRACTS.claim.rivalRetryTurns === 0 && claimPartHeld(world, c) === 'stock';
}

export function sendRival(world: World, c: ClaimContract): Vehicle | null {
  if (c.rival !== null) throw new Error(`Claim ${c.id} already has a rival ${c.rival}`);
  const part = claimPart(world, c);
  const shop = shopSite(c.shop).pos;
  const free = world.vehicles.filter((v) => isFreeRival(world, v, part));
  const rival = free.sort((a, b) => dist(a.pos, shop) - dist(b.pos, shop) || a.id.localeCompare(b.id))[0];
  if (!rival) return null;
  const left = claimCandidates(world, c);
  const first = world.salvage.find((s) => s.id === left[0])!;
  pushGoal(world, rival, { kind: 'claim', claim: c.id, left, targetId: first.id, destination: { ...first.pos }, phase: 'travel', reason: 'claimRun' });
  c.rival = rival.id;
  world.events.push({ t: 'claimRival', contract: c.id, vehicle: rival.id });
  return rival;
}

export function rivalRunning(world: World, c: ClaimContract): Vehicle | null {
  const rival = c.rival === null ? undefined : world.vehicles.find((v) => v.id === c.rival);
  return rival?.brain?.goals.some((g) => g.kind === 'claim' && g.claim === c.id) ? rival : null;
}

export function fitsClaim(c: ClaimContract, p: PartInstance): boolean {
  return p.id === c.partId;
}

export function claimLook(stock: { id: string }): ClaimLook {
  const kind = oldSpotOf(stock)?.type ?? spotLookOf(stock);
  const look = kind === null ? undefined : CLAIM_LOOKS[kind];
  if (!look) throw new Error(`Stock ${stock.id} is no claim wreck`);
  return look;
}

export type ClaimClue = { look: ClaimLook; from: Vec; angle: number; distance: number; point: Vec; territory: string | null; square: GridSquare };

const COMPASS_POINTS = 8;

function snapAngle(rad: number): number {
  const step = (2 * Math.PI) / COMPASS_POINTS;
  return Math.round(rad / step) * step;
}

function roundTo(n: number, step: number): number {
  return Math.max(step, Math.round(n / step) * step);
}

function shopSite(shopId: string): { pos: Vec } {
  const site = [...REGION.towns, ...REGION.locations].find((s) => s.id === shopId);
  if (!site) throw new Error(`No shop site ${shopId}`);
  return site;
}

export function claimClue(c: ClaimContract): ClaimClue {
  const from = shopSite(c.shop).pos;
  const angle = snapAngle(Math.atan2(c.at.y - from.y, c.at.x - from.x));
  const distance = roundTo(dist(from, c.at), CONTRACTS.claim.clueStepTiles);
  const point = { x: from.x + Math.cos(angle) * distance, y: from.y + Math.sin(angle) * distance };
  return { look: claimLook({ id: c.stockId }), from: { ...from }, angle, distance, point, territory: territoryAt(c.at)?.id ?? null, square: gridSquareOf(c.at) };
}

export function clueRadius(distance: number): number {
  return CONTRACTS.claim.clueRadiusShare * distance + CONTRACTS.claim.clueStepTiles;
}

export function claimCandidates(world: World, c: ClaimContract): string[] {
  const clue = claimClue(c);
  const radius = clueRadius(clue.distance);
  const near = claimSpots(world).filter((stock) => claimLook(stock) === clue.look && dist(stock.pos, clue.point) <= radius && sameGridSquare(gridSquareOf(stock.pos), clue.square));
  const sorted = near.sort((a, b) => dist(a.pos, clue.point) - dist(b.pos, clue.point) || a.id.localeCompare(b.id)).map((stock) => stock.id);
  if (!sorted.includes(c.stockId)) throw new Error(`Claim ${c.id} candidates miss its wreck ${c.stockId}`);
  return sorted;
}

export function leadOf(stockPos: Vec, from: Vec): { angle: number; distance: number } {
  return { angle: snapAngle(Math.atan2(stockPos.y - from.y, stockPos.x - from.x)), distance: roundTo(dist(from, stockPos), CONTRACTS.claim.leadStepTiles) };
}
