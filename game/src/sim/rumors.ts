import { CONTRACTS } from '../data/market';
import { PERK_NUMBERS } from '../data/skills';
import { REGION } from '../data/region';
import { TRADE_TIP } from '../data/npcs';
import { atlasOf } from './atlas';
import { roundTo, snapAngle } from './claim-clue';
import { directionsFromSite, toldInFull } from './directions';
import { goodValue, standingPrice } from './market';
import { recall } from './memory';
import { hasOpenSalvage, isStoryWreck } from './salvage';
import type { DirectionStep, SalvageStock, Vehicle, World } from './types';
import { bearing, dist, type Vec } from './vec';

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
  return isUnsearched(world, stock) && hasOpenSalvage(stock);
}

function nearest(npc: Vehicle, rumors: Rumor[]): Rumor | null {
  const near = rumors.filter((r) => dist(npc.pos, r.pos) <= PERK_NUMBERS.rumorMill.radius);
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
  const lie = stocks.find((s): s is SalvageStock => s !== undefined && isUnsearched(world, s) && !hasOpenSalvage(s));
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

export type WreckWay =
  | { kind: 'way'; town: string; steps: DirectionStep[] }
  | { kind: 'bearing'; town: string; rad: number; tiles: number };

export function toldWreckWay(world: World, stock: SalvageStock): WreckWay {
  const towns = [...atlasOf(world.terrain).towns].sort((a, b) => dist(a.pos, stock.pos) - dist(b.pos, stock.pos) || (a.id < b.id ? -1 : 1));
  if (towns.length === 0) throw new Error('A told wreck needs a town to give the way from');
  for (const town of towns) {
    const steps = directionsFromSite(world, town.id, { kind: 'spot', pos: stock.pos, clue: 'wreck' });
    if (toldInFull(steps)) return { kind: 'way', town: town.id, steps };
  }
  const [near] = towns;
  return { kind: 'bearing', town: near.id, rad: snapAngle(bearing(near.pos, stock.pos)), tiles: roundTo(dist(near.pos, stock.pos), CONTRACTS.claim.clueStepTiles) };
}
