import { ECONOMY, GOODS } from '../../data/goods';
import { SHOPS } from '../../data/market';
import { NPCS } from '../../data/npcs';
import { partDef, type PartKind } from '../../data/parts';
import { freeCells, mountedItems, mountedParts, shieldParts, type Spot } from '../grid';
import { getLayoutError, installSpot } from '../inventory';
import { firepower, getUpkeepReserve } from '../npc-decisions';
import { gearScorer } from '../npc-gear-score';
import { getResources } from '../resources';
import type { GridItem, PartInstance, Vehicle, World } from '../types';
import { isJunk, maxHp, partValue } from '../wear';

export type GearJob = 'fighter' | 'hauler';

export type PartItem = Extract<GridItem, { kind: 'part' }>;

export type Offer = { part: PartInstance; price: number };

export type Plan<O extends Offer = Offer> = { offer: O; replaces: PartItem | null; cost: number; spot: Spot; jobGain: number; worthGain: number };

const NEVER: readonly PartKind[] = ['core', 'scanner'];

export function goodsRoom(v: Vehicle): number {
  return freeCells({ ...v, items: v.items.filter((it) => it.kind === 'part') });
}

function toughnessOf(v: Vehicle): number {
  return [...mountedParts(v, 'core'), ...shieldParts(v)].reduce((sum, part) => sum + part.hp, 0);
}

function fighterStrength(world: World, v: Vehicle): number {
  return firepower(world, v) * toughnessOf(v);
}

export function jobScore(world: World, v: Vehicle, job: GearJob): number {
  return job === 'fighter' ? fighterStrength(world, v) : toughnessOf(v);
}

export function jobScorer(world: World, job: GearJob): (v: Vehicle) => number {
  return (v) => jobScore(world, v, job);
}

export function npcScorer(world: World, v: Vehicle, templateId: string): (v: Vehicle) => number {
  const template = NPCS[templateId];
  if (!template) throw new Error(`No NPC template ${templateId} to judge gear by`);
  const powered = { ...v, items: v.items.filter((it) => it.kind === 'part' && ['core', 'engine'].includes(partDef(it.part.defId).kind)) };
  const score = gearScorer(world, template.loadout.priorities, powered, true);
  return (truck) => score({ ...truck, items: truck.items.filter((it) => it.kind === 'part') });
}

const GARAGE_GOODS = Object.values(SHOPS).filter((shop) => shop.kind === 'garage').map((shop) => shop.goods).reduce((shared, goods) => shared.filter((good) => goods.includes(good)));

function tradeCapital(v: Vehicle): number {
  const values = GARAGE_GOODS.map((good) => GOODS[good].value);
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  return goodsRoom(v) * average * (1 + ECONOMY.spread);
}

export function gearBudget(world: World, v: Vehicle, keepsTradeCapital: boolean): number {
  const spendable = getResources(world, v).money - getUpkeepReserve(v);
  return keepsTradeCapital ? spendable - tradeCapital(v) : spendable;
}

export function quality(part: PartInstance): number {
  return partValue(part) * (part.hp / maxHp(part));
}

export function probe(part: PartInstance): PartItem {
  return { id: 'gear-probe', x: 0, y: 0, rot: 0, kind: 'part', part };
}

function weakestOfKind(v: Vehicle, kind: PartKind): PartItem | null {
  return mountedItems(v, kind).reduce<PartItem | null>((weak, it) => (!weak || quality(it.part) < quality(weak.part) ? it : weak), null);
}

function after(v: Vehicle, offer: Offer, replaces: PartItem | null, spot: Spot): Vehicle {
  const kept = v.items.filter((it) => it.id !== replaces?.id && !(it.kind === 'part' && it.part.id === offer.part.id));
  return { ...v, items: [...kept, { ...probe(offer.part), ...spot }] };
}

function placement(v: Vehicle, offer: Offer): { replaces: PartItem | null; spot: Spot } | null {
  const free = installSpot(v, probe(offer.part));
  if (free) return { replaces: null, spot: free };
  const weakest = weakestOfKind(v, partDef(offer.part.defId).kind);
  if (!weakest || quality(offer.part) <= quality(weakest.part)) return null;
  const rest = { ...v, items: v.items.filter((it) => it.id !== weakest.id) };
  const spot = installSpot(rest, probe(offer.part));
  return spot && getLayoutError(v, rest.items) === null ? { replaces: weakest, spot } : null;
}

export type Buyer = { score: (v: Vehicle) => number; skip: readonly PartKind[]; resale: (part: PartInstance) => number; lootRoom?: number };

function keepsRoom(before: Vehicle, result: Vehicle, buyer: Buyer): boolean {
  return buyer.lootRoom === undefined || freeCells(result) >= Math.min(buyer.lootRoom, freeCells(before));
}

export function gearPlans<O extends Offer>(v: Vehicle, offers: readonly O[], buyer: Buyer): Plan<O>[] {
  const now = buyer.score(v);
  return offers.filter((o) => !isJunk(o.part) && ![...NEVER, ...buyer.skip].includes(partDef(o.part.defId).kind)).flatMap((offer) => {
    const place = placement(v, offer);
    if (!place) return [];
    const result = after(v, offer, place.replaces, place.spot);
    if (!keepsRoom(v, result, buyer)) return [];
    const jobGain = buyer.score(result) - now;
    if (jobGain < 0) return [];
    const resale = place.replaces ? buyer.resale(place.replaces.part) : 0;
    const given = place.replaces ? quality(place.replaces.part) : 0;
    return [{ offer, ...place, cost: offer.price - resale, jobGain, worthGain: quality(offer.part) - given }];
  });
}

export function bestPlan<O extends Offer>(plans: readonly Plan<O>[], budget: number): Plan<O> | null {
  const gains = plans.filter((p) => p.cost <= budget && p.jobGain > 0);
  return gains.reduce<Plan<O> | null>((best, p) => (!best || p.jobGain > best.jobGain || (p.jobGain === best.jobGain && p.worthGain > best.worthGain) ? p : best), null);
}
