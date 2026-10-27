import { ECONOMY } from '../../data/goods';
import { graphEdges, PRODUCTION, SERVICE_GOOD, shopDef, siteRecipes, type Recipe } from '../../data/market';
import { TIME } from '../../data/time';
import { rationing } from '../economy';
import { goodPrice, goodStock, onOrder, pressureOf, shopState, siteOf, stockShort, stockTarget, type ShopState, type StockCause } from '../market';
import { goodsCount } from '../grid';
import { onRelief, recipeRunning, type RecipeRun } from '../production';
import { liveRoadNews, shipmentOf } from '../road-news';
import type { World } from '../types';
import type { SimText } from './sim-mode';

export type EconGood = { good: string; name: string; stock: number; target: number; pressure: number; buy: number; sell: number; buyText: string; sellText: string; tags: { id: EconTag; text: string }[] };
export type EconLine = { recipe: string; name: string; run: RecipeRun; runText: string; inputs: string[]; outputs: string[]; everyHours: number; event: string | null };
export type EconFlow = { good: string; name: string; cause: StockCause; causeText: string; units: number };
export type EconShop = { id: string; name: string; x: number; y: number; goods: EconGood[]; lines: EconLine[]; flows: EconFlow[]; contracts: number; parts: number };
export type EconShipment = { truck: string; truckName: string; good: string; goodName: string; units: number; from: string; to: string; fromXY: { x: number; y: number }; toXY: { x: number; y: number } };
export type EconNews = { hoursAgo: number; kindText: string; goodName: string; units: number; from: string; to: string };
export type EconEdge = { good: string; goodName: string; fromId: string; toId: string; from: string; to: string };
export type EconTag = 'short' | 'rationing' | 'slowImport' | 'onOrder';
export type Economy ={ turn: number; flowHours: number; shops: EconShop[]; shipments: EconShipment[]; news: EconNews[]; edges: EconEdge[] };

const TURNS_PER_HOUR = TIME.turnsPerDay / 24;
const SUPPLY_OF_GOOD: Record<string, 'fuel' | 'supplies'> = Object.fromEntries(Object.entries(SERVICE_GOOD).map(([kind, good]) => [good, kind as 'fuel' | 'supplies']));

type Move = { shop: string; good: string; cause: StockCause; delta: number };
type Bucket = { turn: number; moves: Move[] };

export class StockFlows {
  private buckets: Bucket[] = [];

  constructor(private readonly startTurn: number) {}

  record(turn: number, shop: string, good: string, delta: number, cause: StockCause): void {
    const last = this.buckets[this.buckets.length - 1];
    if (last && last.turn === turn) last.moves.push({ shop, good, cause, delta });
    else this.buckets.push({ turn, moves: [{ shop, good, cause, delta }] });
    while (turn - this.buckets[0].turn >= TIME.turnsPerDay) this.buckets.shift();
  }

  hours(turn: number): number {
    return Math.min(TIME.turnsPerDay, turn - this.startTurn) / TURNS_PER_HOUR;
  }

  totals(shop: string): { good: string; cause: StockCause; units: number }[] {
    const sums = new Map<string, { good: string; cause: StockCause; units: number }>();
    for (const move of this.buckets.flatMap((b) => b.moves).filter((m) => m.shop === shop)) {
      const key = `${move.good}|${move.cause}`;
      const sum = sums.get(key) ?? { good: move.good, cause: move.cause, units: 0 };
      sum.units += move.delta;
      sums.set(key, sum);
    }
    return [...sums.values()].filter((s) => s.units !== 0).sort((a, b) => Math.abs(b.units) - Math.abs(a.units));
  }
}

export function economyOf(world: World, flows: StockFlows, text: SimText): Economy {
  return {
    turn: world.turn,
    flowHours: flows.hours(world.turn),
    shops: Object.keys(world.shops).map((id) => shopOf(world, id, flows, text)),
    shipments: shipmentsOf(world, text),
    news: newsOf(world, text),
    edges: graphEdges().map((e) => ({ good: e.good, goodName: text.good(e.good), fromId: e.from, toId: e.to, from: text.site(e.from), to: text.site(e.to) })),
  };
}

function shopOf(world: World, id: string, flows: StockFlows, text: SimText): EconShop {
  const state = shopState(world, id);
  const pos = siteOf(id).pos;
  return {
    id,
    name: text.site(id),
    x: pos.x,
    y: pos.y,
    goods: Object.keys(state.goods).map((good) => goodOf(world, id, state, good, text)),
    lines: siteRecipes(id).map((recipe) => lineOf(world, id, state, recipe, text)),
    flows: flows.totals(id).map((f) => ({ good: f.good, name: text.good(f.good), cause: f.cause, causeText: text.cause(f.cause), units: f.units })),
    contracts: state.contracts.length,
    parts: state.stock.length,
  };
}

function goodOf(world: World, shopId: string, state: ShopState, good: string, text: SimText): EconGood {
  const stock = goodStock(state, good);
  const buy = goodPrice(shopId, state, good, 'buy', ECONOMY.spread);
  const sell = goodPrice(shopId, state, good, 'sell', ECONOMY.spread);
  return {
    good,
    name: text.good(good),
    stock,
    target: stockTarget(shopId, good),
    pressure: pressureOf(shopId, good, stock),
    buy,
    sell,
    buyText: text.money(buy),
    sellText: text.money(sell),
    tags: tagsOf(world, shopId, state, good).map((id) => ({ id, text: text.tag(id) })),
  };
}

function tagsOf(world: World, shopId: string, state: ShopState, good: string): EconTag[] {
  const tags: [EconTag, boolean][] = [
    ['short', stockShort(shopId, state, good)],
    ['rationing', rationsGood(world, shopId, good)],
    ['slowImport', onRelief(world, shopId, good)],
    ['onOrder', onOrder(world, shopId, good)],
  ];
  return tags.filter(([, on]) => on).map(([tag]) => tag);
}

function rationsGood(world: World, shopId: string, good: string): boolean {
  const supply = SUPPLY_OF_GOOD[good];
  return supply !== undefined && shopDef(shopId).supplies.includes(supply) && rationing(world, shopId, supply);
}

function lineOf(world: World, shopId: string, state: ShopState, recipe: Recipe, text: SimText): EconLine {
  const run = recipeRunning(world, shopId, recipe.id);
  const batch = run === 'fallback' ? { inputs: {}, outputs: recipe.fallback ?? recipe.outputs } : recipe;
  const event = state.event?.recipe === recipe.id ? state.event.kind : null;
  return {
    recipe: recipe.id,
    name: text.recipe(recipe.id),
    run,
    runText: text.run(run),
    inputs: crates(batch.inputs, text),
    outputs: crates(batch.outputs, text),
    everyHours: (recipe.everyCycles * PRODUCTION.cycleTurns) / TURNS_PER_HOUR,
    event: event === null ? null : text.siteEvent(event),
  };
}

function crates(goods: Record<string, number>, text: SimText): string[] {
  return Object.entries(goods).map(([good, n]) => `${n} ${text.good(good)}`);
}

function shipmentsOf(world: World, text: SimText): EconShipment[] {
  return world.vehicles.flatMap((v) => {
    const shipment = shipmentOf(v);
    if (!shipment) return [];
    return [{
      truck: v.id,
      truckName: text.truck(world, v),
      good: shipment.good,
      goodName: text.good(shipment.good),
      units: goodsCount(v)[shipment.good] ?? 0,
      from: text.site(shipment.from),
      to: text.site(shipment.to),
      fromXY: { ...siteOf(shipment.from).pos },
      toXY: { ...siteOf(shipment.to).pos },
    }];
  });
}

function newsOf(world: World, text: SimText): EconNews[] {
  return liveRoadNews(world).map((n) => ({
    hoursAgo: Math.round((world.turn - n.turn) / TURNS_PER_HOUR),
    kindText: text.newsKind(n.kind),
    goodName: text.good(n.good),
    units: n.units,
    from: text.site(n.from),
    to: text.site(n.to),
  }));
}
