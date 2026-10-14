import { CLAIM_LOOKS, CONTRACTS, SHOPS, type ClaimLook } from '../data/market';
import { REGION } from '../data/region';
import { WRECK_LOOKS } from '../data/territory';
import { playerVehicle } from './damage';
import { liveClaims, MAX_RADIUS, oldSpotOf, reachable, type ClaimContract } from './salvage';
import { navLayer, type NavLayer } from './nav/layer';
import { ROAD_INDEX } from './road-index';
import { spotLookOf, territoryOfStock } from './territory';
import type { PartInstance, SalvageStock, World } from './types';
import { isJunk, partValue } from './wear';
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
  return prop !== undefined && reachable(layer, prop);
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

export type PartWhere = 'stock' | 'player' | 'gone';

export function claimPartHeld(world: World, c: ClaimContract): PartWhere {
  const stock = world.salvage.find((s) => s.id === c.stockId);
  if (stock && [...stock.parts, ...stock.hidden.parts].some((p) => p.id === c.partId)) return 'stock';
  const held = world.player.storage.some((p) => p.id === c.partId) || playerVehicle(world).items.some((it) => it.kind === 'part' && it.part.id === c.partId);
  return held ? 'player' : 'gone';
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

export type ClaimClue = { look: ClaimLook; from: Vec; angle: number; distance: number; point: Vec; territory: string | null };

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

export function claimClue(world: World, c: ClaimContract): ClaimClue {
  const from = shopSite(c.shop).pos;
  const angle = snapAngle(Math.atan2(c.at.y - from.y, c.at.x - from.x));
  const distance = roundTo(dist(from, c.at), CONTRACTS.claim.clueStepTiles);
  const point = { x: from.x + Math.cos(angle) * distance, y: from.y + Math.sin(angle) * distance };
  const stock = world.salvage.find((s) => s.id === c.stockId);
  const territory = stock ? territoryOfStock(stock)?.id ?? null : null;
  return { look: claimLookOf(world, c), from: { ...from }, angle, distance, point, territory };
}

function claimLookOf(world: World, c: ClaimContract): ClaimLook {
  return claimLook(world.salvage.find((s) => s.id === c.stockId) ?? { id: c.stockId });
}

export function clueRadius(distance: number): number {
  return CONTRACTS.claim.clueRadiusShare * distance + CONTRACTS.claim.clueStepTiles;
}

export function claimCandidates(world: World, c: ClaimContract): string[] {
  const clue = claimClue(world, c);
  const radius = clueRadius(clue.distance);
  const near = claimSpots(world).filter((stock) => claimLook(stock) === clue.look && dist(stock.pos, clue.point) <= radius);
  const sorted = near.sort((a, b) => dist(a.pos, clue.point) - dist(b.pos, clue.point) || a.id.localeCompare(b.id)).map((stock) => stock.id);
  if (!sorted.includes(c.stockId)) throw new Error(`Claim ${c.id} candidates miss its wreck ${c.stockId}`);
  return sorted;
}

export function leadOf(stockPos: Vec, from: Vec): { angle: number; distance: number } {
  return { angle: snapAngle(Math.atan2(stockPos.y - from.y, stockPos.x - from.x)), distance: roundTo(dist(from, stockPos), CONTRACTS.claim.leadStepTiles) };
}
