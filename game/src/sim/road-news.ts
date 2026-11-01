import { SHOPS } from '../data/market';
import { ROAD_NEWS } from '../data/market';
import { TIME } from '../data/time';
import { goodsCount } from './grid';
import type { GridItem, RoadNews, RoadNewsKind, Shipment, Vehicle, World } from './types';

export function shipmentOf(vehicle: Vehicle): Shipment | null {
  return vehicle.brain?.goals[0]?.shipment ?? null;
}

export function reportShipmentLoss(world: World, vehicle: Vehicle, kind: RoadNewsKind, units: number): void {
  const shipment = shipmentOf(vehicle);
  if (!shipment || units <= 0) return;
  reportLoss(world, { turn: world.turn, kind, good: shipment.good, units, from: shipment.from, to: shipment.to });
}

export function reportLoss(world: World, news: RoadNews): void {
  for (const site of [news.from, news.to]) if (!(site in SHOPS)) throw new Error(`Road news names an unknown site ${site}`);
  if (!Number.isInteger(news.units) || news.units <= 0) throw new Error(`Road news needs a lost crate count, got ${news.units}`);
  world.roadNews = [...liveRoadNews(world), news].slice(-ROAD_NEWS.max);
}

export function reportRobbedHaul(world: World, vehicle: Vehicle, haul: readonly GridItem[]): void {
  const shipment = shipmentOf(vehicle);
  if (!shipment) return;
  const units = haul.reduce((sum, item) => sum + (item.kind === 'good' && item.good === shipment.good ? 1 : 0), 0);
  reportShipmentLoss(world, vehicle, 'robbed', units);
}

export function reportLostTruck(world: World, vehicle: Vehicle, kind: Exclude<RoadNewsKind, 'robbed'>): void {
  const shipment = shipmentOf(vehicle);
  if (!shipment) return;
  reportShipmentLoss(world, vehicle, kind, goodsCount(vehicle)[shipment.good] ?? 0);
}

const NEWS_TURNS = Math.round(ROAD_NEWS.days * TIME.workDayTurns);

export function liveRoadNews(world: World): RoadNews[] {
  return world.roadNews.filter((n) => world.turn - n.turn < NEWS_TURNS);
}

export function legKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

let riskCache: { key: string; map: ReadonlyMap<string, number> } | null = null;

export function roadRiskMap(world: World): ReadonlyMap<string, number> {
  const key = `${world.seed}:${world.turn}:${world.roadNews.map((n) => `${n.turn}${n.from}${n.to}${n.good}`).join(',')}`;
  if (riskCache?.key === key) return riskCache.map;
  const map = new Map<string, number>();
  for (const n of liveRoadNews(world)) map.set(legKey(n.from, n.to), (map.get(legKey(n.from, n.to)) ?? 0) + 1);
  riskCache = { key, map };
  return map;
}

export function legRisk(world: World, from: string, to: string): number {
  return (roadRiskMap(world).get(legKey(from, to)) ?? 0) * ROAD_NEWS.riskShare;
}
