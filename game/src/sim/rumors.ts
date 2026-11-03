import { REGION } from '../data/region';
import { ROAD_WATCH, RUMORS, TRADE_TIP } from '../data/npcs';
import { playerVehicle } from './damage';
import { gridSquareOf } from './map-grid';
import { goodValue, standingPrice } from './market';
import { recall } from './memory';
import { isRaider } from './relations';
import { hasSalvage, isStoryWreck } from './salvage';
import type { CallVar, Memory, SalvageStock, SightingFact, Vehicle, World } from './types';
import { dist, type Vec } from './vec';

export type Rumor = { id: string; pos: Vec; site: { id: string } | null };
export type TradeTip = { shop: string; good: string; dear: boolean };

function isWreckStock(stock: SalvageStock): boolean {
  return stock.id.startsWith('wreck') || isStoryWreck(stock);
}

function isUnsearched(world: World, stock: SalvageStock): boolean {
  const { scavenged, rumored } = world.player;
  return isWreckStock(stock) && !scavenged.includes(stock.id) && !rumored.includes(stock.id);
}

function isRumorWreck(world: World, stock: SalvageStock): boolean {
  return isUnsearched(world, stock) && hasSalvage(stock);
}

function nearest(npc: Vehicle, rumors: Rumor[]): Rumor | null {
  const near = rumors.filter((r) => dist(npc.pos, r.pos) <= RUMORS.reach);
  near.sort((a, b) => dist(npc.pos, a.pos) - dist(npc.pos, b.pos) || (a.id < b.id ? -1 : 1));
  return near[0] ?? null;
}

function sitesUnknown(world: World): Rumor[] {
  return [...REGION.towns, ...REGION.locations].filter((s) => !world.player.discovered.includes(s.id)).map((s) => ({ id: s.id, pos: s.pos, site: s }));
}

function wrecksWorthTelling(world: World): Rumor[] {
  return world.salvage.filter((s) => isRumorWreck(world, s)).map((s) => ({ id: s.id, pos: s.pos, site: null }));
}

export function siteRumor(world: World, npc: Vehicle): Rumor | null {
  return nearest(npc, sitesUnknown(world));
}

export function wreckRumor(world: World, npc: Vehicle): Rumor | null {
  return nearest(npc, wrecksWorthTelling(world));
}

export function heardRumor(world: World, npc: Vehicle): Rumor | null {
  return nearest(npc, [...sitesUnknown(world), ...wrecksWorthTelling(world)]);
}

export function emptiedWreck(world: World, npc: Vehicle): Rumor | null {
  const stocks = recall(npc, 'stripped').map((m) => world.salvage.find((s) => s.id === m.fact.stock));
  const lie = stocks.find((s): s is SalvageStock => s !== undefined && isUnsearched(world, s) && !hasSalvage(s));
  return lie ? { id: lie.id, pos: lie.pos, site: null } : null;
}

function rememberedOffsets(npc: Vehicle): (TradeTip & { off: number })[] {
  return recall(npc, 'prices').flatMap(({ fact }) => Object.keys(fact.pressure).sort().map((good) => {
    const ratio = standingPrice(fact.shop, good, fact.pressure[good]) / goodValue(good);
    return { shop: fact.shop, good, dear: ratio > 1, off: Math.round(Math.abs(ratio - 1) * 1e6) / 1e6 };
  }));
}

export function tradeTip(npc: Vehicle): TradeTip | null {
  const best = rememberedOffsets(npc).filter((c) => c.off >= TRADE_TIP.share).reduce<(TradeTip & { off: number }) | null>((top, c) => (!top || c.off > top.off ? c : top), null);
  return best && { shop: best.shop, good: best.good, dear: best.dear };
}

export function toldWrecks(world: World): SalvageStock[] {
  const stocks = new Map(world.salvage.map((s) => [s.id, s]));
  const searched = new Set(world.player.scavenged);
  const newestFirst = new Set([...world.player.rumored].reverse());
  return [...newestFirst].flatMap((id) => {
    const stock = stocks.get(id);
    return stock && !searched.has(id) ? [stock] : [];
  });
}

type RaiderSighting = Memory & { fact: SightingFact };

function truckOf(world: World, id: string): Vehicle | null {
  return world.vehicles.find((v) => v.id === id) ?? world.sheltered.find((s) => s.vehicle.id === id)?.vehicle ?? null;
}

function seenRaiders(world: World, teller: Vehicle): RaiderSighting[] {
  return recall(teller, 'sighting').filter((m) => {
    const truck = m.fact.vehicle === world.player.vehicleId ? null : truckOf(world, m.fact.vehicle);
    return truck !== null && isRaider(truck);
  });
}

function nearestTo(from: Vec, sightings: RaiderSighting[]): RaiderSighting | null {
  const gap = (m: RaiderSighting) => dist(from, m.fact.at);
  return sightings.reduce<RaiderSighting | null>((best, m) => {
    if (!best || gap(m) < gap(best) || (gap(m) === gap(best) && m.fact.vehicle < best.fact.vehicle)) return m;
    return best;
  }, null);
}

export function raiderSighting(world: World, teller: Vehicle): Extract<CallVar, { kind: 'raiders' }> {
  const sightings = seenRaiders(world, teller);
  const nearest = nearestTo(playerVehicle(world).pos, sightings);
  if (!nearest) return { kind: 'raiders', seen: null, count: 0 };
  const count = sightings.filter((m) => dist(m.fact.at, nearest.fact.at) <= ROAD_WATCH.groupReach).length;
  const seen = { square: gridSquareOf(nearest.fact.at), turns: world.turn - nearest.turn, heading: nearest.fact.heading };
  return { kind: 'raiders', seen, count };
}
