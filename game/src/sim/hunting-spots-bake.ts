import { chassisDef } from '../data/chassis';
import { HUNT } from '../data/npc-behavior';
import { DECISIONS, NPCS, type NpcTemplate, type TraitId } from '../data/npcs';
import { TRAITS } from '../data/npc-traits';
import { SHOPS } from '../data/market';
import { REGION } from '../data/region';
import { OLD_PLACES } from '../data/salvage';
import { TERRAIN } from '../data/terrain';
import { getKnownSite } from './npc-decisions';
import { route } from './path';
import { oldSpotsNear, oldStockId } from './salvage';
import { stockSearchTurns } from './search';
import { isTerritory, nearestPad, siteGap, type Site } from './sites';
import { territoryEntries, territoryOfStock, territorySpots } from './territory';
import type { SalvageStock, World } from './types';
import { dist, type Vec } from './vec';
import { isHideSpot, seesGround } from './watch-posts';

export type HuntingSpotsBake = { spots: Vec[]; samples: Vec[] };

export type Trip = { from: Vec; to: Vec; share: number; target: SalvageStock | null };
export type Family = { label: string; drivers: number; trips: Trip[] };
export type Leg = { trip: Trip; path: Vec[]; length: number; stops: SalvageStock[] };

const SEARCH_CUT = 1;

export function makeHuntingSpots(world: World, traffic: Float64Array): HuntingSpotsBake {
  const samples = trafficSamples(world.size, traffic);
  return { spots: pickSpots(world, traffic, samples), samples };
}

export function preyTraffic(world: World, log: (line: string) => void): Float64Array {
  const families = preyFamilies(world);
  return trafficOf(world.size, families, families.map((family) => traceTrips(world, family.trips)), log);
}

export function traceTrips(world: World, trips: Trip[]): Leg[] {
  const radius = preyRadius();
  const fixed = fixedStocks(world);
  return trips.map((trip) => traceLeg(world, trip, radius, fixed));
}

export function trafficOf(size: number, families: Family[], legsOf: Leg[][], log: (line: string) => void): Float64Array {
  const speed = preyCruise();
  const traffic = new Float64Array(size * size);
  families.forEach((family, i) => {
    const legs = legsOf[i];
    const meanTurns = legs.reduce((sum, leg) => sum + leg.trip.share * legTurns(leg, speed), 0);
    for (const leg of legs) addLeg(traffic, size, leg, (family.drivers * leg.trip.share) / meanTurns, speed);
    log(`${family.label}: ${family.drivers} drivers, ${legs.length} trips, mean round trip ${Math.round(meanTurns)} turns`);
  });
  log(`Each trip of a kind is equally likely. Prey cruise ${speed.toFixed(2)} tiles a turn, route radius ${preyRadius()}.`);
  return traffic;
}

function preyTemplates(): NpcTemplate[] {
  return Object.values(NPCS).filter((t) => t.traits.some((trait) => PREY_TRAITS.includes(trait)));
}

const PREY_TRAITS: readonly TraitId[] = ['trader', 'supplier', 'courier', 'scavenger', 'roamer', 'vulture'];

function driversOf(trait: TraitId): number {
  return Object.values(NPCS).filter((t) => t.traits[0] === trait).reduce((sum, t) => sum + t.cap, 0);
}

function preyCruise(): number {
  let weight = 0;
  let sum = 0;
  for (const t of preyTemplates())
    for (const c of t.loadout.chassis) {
      weight += c.weight * t.cap;
      sum += c.weight * t.cap * chassisDef(c.value).maxSpeed;
    }
  return sum / weight;
}

function preyRadius(): number {
  const weights = new Map<string, number>();
  for (const t of preyTemplates()) for (const c of t.loadout.chassis) weights.set(c.value, (weights.get(c.value) ?? 0) + c.weight * t.cap);
  const [common] = [...weights].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return chassisDef(common).radius;
}

export function preyFamilies(world: World): Family[] {
  const shops = Object.keys(SHOPS).map(getKnownSite);
  return [
    { label: 'traders', drivers: driversOf('trader') + driversOf('supplier'), trips: pairTrips(shops) },
    { label: 'couriers', drivers: driversOf('courier'), trips: pairTrips(TRAITS.courier.travelSites.map(getKnownSite)) },
    { label: 'scavengers', drivers: driversOf('scavenger'), trips: scavengeTrips(world, TRAITS.scavenger.markets.map(getKnownSite), TRAITS.scavenger.salvageSites) },
  ];
}

function endOf(site: Site, toward: Vec): Vec {
  if (!isTerritory(site)) return nearestPad(site, toward);
  return territoryEntries(site).reduce((a, b) => (dist(toward, a) <= dist(toward, b) ? a : b));
}

function pairTrips(sites: Site[]): Trip[] {
  const pairs = sites.flatMap((a, i) => sites.slice(i + 1).map((b) => [a, b] as const));
  return pairs.map(([a, b]) => ({ from: endOf(a, b.pos), to: endOf(b, a.pos), share: 1 / pairs.length, target: null }));
}

function scavengeTrips(world: World, starts: Site[], salvageSites: string[]): Trip[] {
  return starts.flatMap((shop) => {
    const share = 1 / starts.length;
    const from = nearestPad(shop, shop.pos);
    const near = oldSpotsNear(world, shop.pos, OLD_PLACES.npcRange);
    const oldShare = near.length > 0 ? OLD_PLACES.npcShare : 0;
    const old = near.map((pick) => ({ from, to: { ...pick.pos }, share: (share * oldShare) / near.length, target: stockById(world, oldStockId(pick)) }));
    const spots = salvageSites.flatMap((id) => {
      const stocks = territorySpots(world, id);
      return stocks.map((stock) => ({ from, to: { ...stock.pos }, share: (share * (1 - oldShare)) / salvageSites.length / stocks.length, target: stock }));
    });
    return [...old, ...spots];
  });
}

function stockById(world: World, id: string): SalvageStock {
  const stock = world.salvage.find((s) => s.id === id);
  if (!stock) throw new Error(`No salvage stock ${id}`);
  return stock;
}

function fixedStocks(world: World): SalvageStock[] {
  return world.salvage.filter((s) => s.id.startsWith('old-') || territoryOfStock(s) !== null);
}

function traceLeg(world: World, trip: Trip, radius: number, fixed: SalvageStock[]): Leg {
  const path = [trip.from, ...route(world, trip.from, trip.to, radius, [])];
  let length = 0;
  for (let i = 1; i < path.length; i++) length += dist(path[i - 1], path[i]);
  const stops = trip.target ? fixed.filter((s) => s !== trip.target && seenFrom(path, s.pos)) : [];
  return { trip, path, length, stops };
}

function seenFrom(path: Vec[], p: Vec): boolean {
  const reach = TERRAIN.vision.radius;
  for (let i = 1; i < path.length; i++) if (segmentGap(path[i - 1], path[i], p) <= reach) return true;
  return false;
}

function segmentGap(a: Vec, b: Vec, p: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return dist(p, { x: a.x + dx * t, y: a.y + dy * t });
}

const STOP_SHARE = (() => {
  const loot = DECISIONS.salvageSeen.loot + (TRAITS.scavenger.weights.salvageSeen?.loot?.add ?? 0);
  return loot / (loot + DECISIONS.salvageSeen.keep);
})();

function parkTurns(leg: Leg): { stock: SalvageStock; turns: number }[] {
  const end = leg.trip.target ? [{ stock: leg.trip.target, turns: stockSearchTurns(leg.trip.target, SEARCH_CUT) }] : [];
  return [...end, ...leg.stops.map((stock) => ({ stock, turns: STOP_SHARE * stockSearchTurns(stock, SEARCH_CUT) }))];
}

function legTurns(leg: Leg, speed: number): number {
  return (2 * leg.length) / speed + parkTurns(leg).reduce((sum, p) => sum + p.turns, 0);
}

function addLeg(traffic: Float64Array, size: number, leg: Leg, rate: number, speed: number): void {
  for (let i = 1; i < leg.path.length; i++) {
    const a = leg.path[i - 1];
    const b = leg.path[i];
    const steps = Math.max(1, Math.ceil(dist(a, b)));
    const perStep = (2 * dist(a, b)) / steps / speed;
    for (let k = 0; k < steps; k++) addAt(traffic, size, { x: a.x + ((b.x - a.x) * (k + 0.5)) / steps, y: a.y + ((b.y - a.y) * (k + 0.5)) / steps }, rate * perStep);
  }
  for (const park of parkTurns(leg)) addAt(traffic, size, park.stock.pos, rate * park.turns);
}

function addAt(traffic: Float64Array, size: number, p: Vec, amount: number): void {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  traffic[y * size + x] += amount;
}

function keepsSiteGap(p: Vec): boolean {
  return [...REGION.towns, ...REGION.locations].every((s) => isTerritory(s) || siteGap(s, p) >= HUNT.siteDistance);
}

type Scored = { p: Vec; score: number };

function pickSpots(world: World, traffic: Float64Array, samples: readonly Vec[]): Vec[] {
  const usable = scoreCandidates(world.size, traffic).filter(({ p }) => keepsSiteGap(p) && isHideSpot(world, p) && seesTraffic(world, p, samples));
  const spacing = 2 * TERRAIN.vision.radius;
  const spots: Vec[] = [];
  for (const candidate of usable) if (isPeak(candidate, usable, spacing) && spots.every((s) => dist(s, candidate.p) >= spacing)) spots.push(candidate.p);
  return spots;
}

function seesTraffic(world: World, p: Vec, samples: readonly Vec[]): boolean {
  return samples.some((s) => dist(s, p) <= TERRAIN.vision.radius && seesGround(world, p, s));
}

function isPeak(candidate: Scored, all: Scored[], spacing: number): boolean {
  return !all.some((o) => o.score > candidate.score && dist(o.p, candidate.p) < spacing);
}

function scoreCandidates(size: number, traffic: Float64Array): Scored[] {
  const disc = sightDisc();
  const step = HUNT.roadSample;
  const scored: Scored[] = [];
  for (let y = step / 2; y < size; y += step)
    for (let x = step / 2; x < size; x += step) {
      const score = preyInSight(traffic, size, disc, Math.floor(x), Math.floor(y));
      if (score > 0) scored.push({ p: { x, y }, score });
    }
  return scored.sort((a, b) => b.score - a.score || a.p.y - b.p.y || a.p.x - b.p.x);
}

function sightDisc(): [number, number][] {
  const reach = TERRAIN.vision.radius;
  const disc: [number, number][] = [];
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) if (dx * dx + dy * dy <= reach * reach) disc.push([dx, dy]);
  return disc;
}

function preyInSight(traffic: Float64Array, size: number, disc: [number, number][], cx: number, cy: number): number {
  let score = 0;
  for (const [dx, dy] of disc) {
    const x = cx + dx;
    const y = cy + dy;
    if (x >= 0 && y >= 0 && x < size && y < size) score += traffic[y * size + x];
  }
  return score;
}

function trafficSamples(size: number, traffic: Float64Array): Vec[] {
  const cell = HUNT.roadSample;
  const samples: Vec[] = [];
  for (let cy = 0; cy < size; cy += cell)
    for (let cx = 0; cx < size; cx += cell) {
      let weight = 0;
      let sx = 0;
      let sy = 0;
      for (let y = cy; y < Math.min(size, cy + cell); y++)
        for (let x = cx; x < Math.min(size, cx + cell); x++) {
          const w = traffic[y * size + x];
          weight += w;
          sx += w * (x + 0.5);
          sy += w * (y + 0.5);
        }
      if (weight > 0) samples.push({ x: round(sx / weight), y: round(sy / weight) });
    }
  return samples;
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
