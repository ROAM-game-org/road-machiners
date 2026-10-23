import { CONTRACTS, shopDef } from '../../data/market';
import { playerVehicle } from '../damage';
import { affordableBuyCount, buyGood, getTradePrice, getUpkeepReserve } from '../economy';
import { freeCells, goodsCount } from '../grid';
import { acceptContract, deliverContract, estimateTurns, shopAt, shopState, siteOf, stockForSale, type Contract } from '../market';
import type { Site } from '../sites';
import type { World } from '../types';
import { driveToSite, type Orders } from './orders';
import { fuelReaches, SHOP_SITES } from './reach';

type Procure = Extract<Contract, { kind: 'procure' }>;
type Source = { site: Site; price: number };

export function procurerGoal(o: Orders): boolean {
  const held = heldOrder(o.world);
  if (held) return followOrder(o, held);
  return takeOrder(o);
}

function heldOrder(world: World): Procure | null {
  return world.player.contracts.find((c): c is Procure => c.kind === 'procure') ?? null;
}

function crates(world: World, good: string): number {
  return goodsCount(playerVehicle(world))[good] ?? 0;
}

function followOrder(o: Orders, c: Procure): boolean {
  if (crates(o.world, c.good) >= c.units) return deliver(o, c);
  const source = cheapestSource(o.world, c);
  if (!source) return false;
  if (shopAt(o.world) !== source.site.id) driveToSite(o, source.site);
  else buyCrates(o, c);
  return true;
}

function deliver(o: Orders, c: Procure): true {
  if (shopAt(o.world) === c.shop) o.run((w) => deliverContract(w, c.id), 'contracts');
  else driveToSite(o, siteOf(c.shop));
  return true;
}

function buyCrates(o: Orders, c: Procure): void {
  const want = Math.min(c.units - crates(o.world, c.good), freeCells(o.me));
  const n = affordableBuyCount(o.world, o.me, shopAt(o.world)!, c.good, want, spendable(o.world));
  if (n > 0) o.run((w) => buyGood(w, c.good, n), 'goodsBought');
}

function spendable(world: World): number {
  return world.player.money - getUpkeepReserve(playerVehicle(world));
}

function cheapestSource(world: World, c: Procure): Source | null {
  const me = playerVehicle(world);
  const known = SHOP_SITES.filter((s) => s.id !== c.shop && world.player.discovered.includes(s.id) && shopDef(s.id).goods.includes(c.good));
  const stocked = known.filter((s) => stockForSale(world, s.id, c.good) > 0 && fuelReaches(world, s));
  const sources = stocked.map((site) => ({ site, price: getTradePrice(world, me, site.id, c.good, 'buy') }));
  return sources.reduce<Source | null>((best, s) => (!best || s.price < best.price ? s : best), null);
}

function takeOrder(o: Orders): boolean {
  const shop = shopAt(o.world);
  if (!shop || o.world.player.contracts.length >= CONTRACTS.maxActive) return false;
  const offers = shopState(o.world, shop).contracts.filter((c): c is Procure => c.kind === 'procure' && c.deadline > o.world.turn && c.units <= freeCells(o.me));
  const rated = offers.flatMap((c) => rateOrder(o.world, c));
  const best = rated.reduce<{ c: Procure; perTurn: number } | null>((top, r) => (!top || r.perTurn > top.perTurn ? r : top), null);
  if (best) o.run((w) => acceptContract(w, best.c.id));
  return best !== null;
}

function rateOrder(world: World, c: Procure): { c: Procure; perTurn: number }[] {
  const source = cheapestSource(world, c);
  if (!source || source.price * c.units > spendable(world)) return [];
  const here = siteOf(c.shop).pos;
  const trip = estimateTurns(here, source.site.pos) * 2;
  const net = c.reward - source.price * c.units;
  return net > 0 && trip < c.window ? [{ c, perTurn: net / trip }] : [];
}
