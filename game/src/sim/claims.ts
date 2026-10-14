import { CONTRACTS, EFFORT, SHOPS } from '../data/market';
import { REGION } from '../data/region';
import { WRECK_LOOKS } from '../data/territory';
import { playerVehicle } from './damage';
import { liveClaims, MAX_RADIUS, oldSpotOf, reachable, type ClaimContract } from './salvage';
import { navLayer, type NavLayer } from './nav/layer';
import { ROAD_INDEX } from './road-index';
import { spotLookOf, territoryOfStock } from './territory';
import type { PartInstance, SalvageStock, World } from './types';
import { isJunk, partValue } from './wear';
import { dist } from './vec';

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

export function claimReward(part: PartInstance, turns: number): number {
  requireTurns(turns);
  const claim = CONTRACTS.claim;
  return Math.round(partValue(part) + (turns * claim.rewardFactor + claim.searchTurns) * EFFORT.wage[1]);
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
