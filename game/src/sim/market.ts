
import { ECONOMY, GOODS } from '../data/goods';
import { PARTS, type PartKind } from '../data/parts';
import { REGION } from '../data/region';
import { RULES } from '../data/rules';
import { CONDITION } from '../data/wear';
import { CONTRACTS, DISTANCE_PREMIUM, EFFORT, PRESSURE_MAX, SHOPS, shopDef, type PartStockTable, type ShopDef, type Threat, type Tier } from '../data/market';
import { dailyFlow, graphEdges, PRODUCTION, tradedGoods, type SiteEventKind } from '../data/market';
import { chassisDef } from '../data/chassis';
import { makePart, newId } from './factory';
import { sampleWeighted } from './npc-loadout';
import { playerVehicle } from './damage';
import { freeCells, goodsCount } from './grid';
import { addGoods, removeGoods, spareParts } from './inventory';
import { practice } from './progress';
import { chance, randInt, type Rng } from './rng';
import { canUseSite, type Site } from './sites';
import { modeRules } from './settings';
import { isDefeated } from './defeat';
import { playerCommand } from './world';
import { escortShare, pruneEscortOffers, settleEscortJob, takeEscortJob } from './escort-job';
import type { GameEvent, PartInstance, Vehicle, World } from './types';
import { isJunk, partValue } from './wear';
import { rescueClients, rescueOfferValid, rollRescue, type RescueNeed } from './rescue';
import { dist, type Vec } from './vec';

export type SiteEvent = { kind: SiteEventKind; recipe: string; until: number };

export type ShopState = {
  contracts: Contract[];
  goods: Record<string, number>;
  stock: PartInstance[];
  restockAt: number;
  event: SiteEvent | null;
  shortSince: Record<string, number>;
  opened: Partial<Record<'fuel' | 'supplies', number>>;
};

export type StockCause = 'trade' | 'recipe' | 'demand' | 'upkeep' | 'repair' | 'service' | 'contract' | 'relief';

type StockWatcher = (shopId: string, good: string, delta: number, cause: StockCause) => void;

let stockWatcher: StockWatcher | null = null;

export function watchStock(watcher: StockWatcher | null): void {
  stockWatcher = watcher;
}

export function goodValue(good: string): number {
  const def = GOODS[good];
  if (!def) throw new Error(`Unknown good ${good}`);
  return def.value;
}

export function rollPartStock(world: World, rng: Rng, table: PartStockTable, count: number, seller: string): PartInstance[] {
  const stock: PartInstance[] = [];
  for (let i = 0; i < count; i++) {
    const defId = sampleWeighted(rng, table.parts);
    const wear = sampleWeighted(rng, table.wear);
    if (!Number.isInteger(wear) || wear < 0 || wear > CONDITION.maxWear) {
      throw new Error(`${seller} rolled a bad wear step ${wear} for ${defId}`);
    }
    stock.push(makePart(world, defId, wear));
  }
  return stock;
}

export function rollPartStockPerKind(world: World, rng: Rng, table: PartStockTable, perKind: Partial<Record<PartKind, number>>, seller: string): PartInstance[] {
  const kinds = [...new Set(table.parts.map((p) => PARTS[p.value].kind))];
  return kinds.flatMap((kind) => rollDistinctStock(world, rng, { ...table, parts: table.parts.filter((p) => PARTS[p.value].kind === kind) }, countOfKind(perKind, kind, seller), seller));
}

function rollDistinctStock(world: World, rng: Rng, table: PartStockTable, count: number, seller: string): PartInstance[] {
  if (count > table.parts.length) throw new Error(`${seller} asks for ${count} different parts of a kind that has only ${table.parts.length}`);
  const left = [...table.parts];
  const stock: PartInstance[] = [];
  while (stock.length < count) {
    const defId = sampleWeighted(rng, left);
    left.splice(left.findIndex((p) => p.value === defId), 1);
    stock.push(...rollPartStock(world, rng, { ...table, parts: [{ value: defId, weight: 1 }] }, 1, seller));
  }
  return stock;
}

function countOfKind(perKind: Partial<Record<PartKind, number>>, kind: PartKind, seller: string): number {
  const count = perKind[kind];
  if (count === undefined) throw new Error(`${seller} has no stock count for ${kind} parts`);
  return count;
}

export function initShop(world: World, shopId: string): ShopState {
  const def = shopDef(shopId);
  const goods = Object.fromEntries(def.goods.map((good) => [good, stockTarget(shopId, good)]));
  const count = randInt(world.marketRng, def.stockSize[0], def.stockSize[1]);
  return { contracts: [], goods, stock: rollPartStock(world, world.marketRng, def.partStock, count, def.id), restockAt: world.turn + def.restockTurns, event: null, shortSince: {}, opened: {} };
}

export function goodStock(state: ShopState, good: string): number {
  const stock = state.goods[good];
  if (stock === undefined) throw new Error(`The shop keeps no stock of ${good}`);
  return stock;
}

export function moveStock(state: ShopState, shopId: string, good: string, delta: number, cause: StockCause): void {
  if (!Number.isInteger(delta)) throw new Error(`${shopId} moves a stock of ${good} by ${delta}, not a whole crate`);
  const next = goodStock(state, good) + delta;
  if (next < 0) throw new Error(`${shopId} would hold ${next} ${good} after a ${cause}`);
  state.goods[good] = next;
  stockWatcher?.(shopId, good, delta, cause);
}

const targets = new Map<string, number>();

export function stockTarget(shopId: string, good: string): number {
  const key = `${shopId}:${good}`;
  const known = targets.get(key);
  if (known !== undefined) return known;
  if (!tradedGoods(shopId).includes(good)) throw new Error(`${shopId} keeps no stock of ${good}`);
  const target = Math.max(PRODUCTION.minTarget[shopDef(shopId).kind], Math.ceil(dailyFlow(shopId, good) * PRODUCTION.bufferDays));
  targets.set(key, target);
  return target;
}

export function fullStock(shopId: string, good: string): number {
  return Math.ceil(stockTarget(shopId, good) * PRODUCTION.fullShare);
}

export function pressureOf(shopId: string, good: string, stock: number): number {
  const target = stockTarget(shopId, good);
  const pressure = (PRODUCTION.elasticity * (target - stock)) / target;
  return Math.max(-PRESSURE_MAX, Math.min(PRESSURE_MAX, pressure));
}

export function advanceShop(world: World, shopId: string, state: ShopState): void {
  const def = shopDef(shopId);
  if (world.turn >= state.restockAt) {
    const count = randInt(world.marketRng, def.stockSize[0], def.stockSize[1]);
    state.stock = rollPartStock(world, world.marketRng, def.partStock, count, def.id);
    state.restockAt = world.turn + def.restockTurns;
  }
}

function nearestMakerDistance(shopId: string, good: string): number {
  const makers = Object.values(SHOPS).filter((s) => s.id !== shopId && s.makes.includes(good)).map((s) => s.id);
  if (makers.length === 0) throw new Error(`No shop makes ${good}`);
  return Math.min(...makers.map((id) => dist(shopPos(shopId), siteOf(id).pos)));
}

function priceFactorFor(def: ShopDef, good: string): number {
  if (def.makes.includes(good)) return def.priceFactor.make;
  return def.priceFactor.make + DISTANCE_PREMIUM.perTile * nearestMakerDistance(def.id, good);
}

export function goodBasePrice(shopId: string, good: string): number {
  const def = shopDef(shopId);
  if (!def.goods.includes(good)) throw new Error(`${shopId} does not trade ${good}`);
  return goodValue(good) * priceFactorFor(def, good);
}

export function standingPrice(shopId: string, good: string, pressure: number): number {
  return goodBasePrice(shopId, good) * (1 + pressure);
}

export function priceAtPressure(shopId: string, good: string, pressure: number, direction: 'buy' | 'sell', spread: number): number {
  if (!(spread >= 0)) throw new Error(`Bad spread ${spread}`);
  const pressured = standingPrice(shopId, good, pressure);
  const buy = Math.max(1, Math.ceil(pressured * (1 + spread)));
  const sell = Math.min(buy - 1, Math.floor(pressured * (1 - spread)));
  return direction === 'buy' ? buy : Math.max(0, sell);
}

export function goodPrice(shopId: string, state: ShopState, good: string, direction: 'buy' | 'sell', spread: number): number {
  return priceAtPressure(shopId, good, pressureOf(shopId, good, goodStock(state, good)), direction, spread);
}

export function lotPrice(shopId: string, state: ShopState, good: string, direction: 'buy' | 'sell', spread: number, count: number): number {
  const stock = lotStock(shopId, state, good, direction, count);
  const step = direction === 'buy' ? -1 : 1;
  let total = 0;
  for (let i = 0; i < count; i++) total += priceAtPressure(shopId, good, pressureOf(shopId, good, stock + step * i), direction, spread);
  return total;
}

function lotStock(shopId: string, state: ShopState, good: string, direction: 'buy' | 'sell', count: number): number {
  if (!Number.isInteger(count) || count <= 0) throw new Error(`Bad lot count ${count}`);
  const stock = goodStock(state, good);
  if (direction === 'buy' && count > stock) throw new Error(`${shopId} holds ${stock} ${good}, not ${count}`);
  return stock;
}

export function recordTrade(shopId: string, state: ShopState, good: string, units: number, direction: 'buy' | 'sell'): void {
  if (!shopDef(shopId).goods.includes(good)) throw new Error(`${shopId} does not trade ${good}`);
  if (!Number.isInteger(units) || units < 0) throw new Error(`Bad trade unit count ${units}`);
  moveStock(state, shopId, good, direction === 'buy' ? -units : units, 'trade');
}

export function takeStockPart(state: ShopState, partId: string): PartInstance {
  const index = state.stock.findIndex((part) => part.id === partId);
  if (index < 0) throw new Error(`No part ${partId} in stock`);
  const [part] = state.stock.splice(index, 1);
  return part;
}

export function addStockPart(state: ShopState, part: PartInstance): void {
  state.stock.push(part);
}

export type Contract =
  | { id: string; shop: string; kind: 'haul'; good: string; units: number; to: string; reward: number; deadline: number; window: number; rush: boolean; tier: Tier }
  | { id: string; shop: string; kind: 'fetch'; defId: string; reward: number; deadline: number; window: number; tier: Tier }
  | { id: string; shop: string; kind: 'escort'; client: string; to: string; reward: number; deadline: number; window: number; tier: Tier; threat: Threat; span: number; together: number; seen: { x: number; y: number; turn: number } | null; apart: number; stuck: number; holdUntil: number | null }
  | { id: string; shop: string; kind: 'bounty'; template: string; reward: number; deadline: number; window: number; tier: Tier; fulfilled: boolean }
  | { id: string; shop: string; kind: 'rescue'; client: string; driver: string; need: RescueNeed; area: Vec; reward: number; deadline: number; window: number; tier: Tier; fulfilled: boolean };

export function estimateTurns(from: Vec, to: Vec): number {
  return (dist(from, to) * EFFORT.routeFactor) / EFFORT.refSpeed + EFFORT.handlingTurns;
}

export function contractReward(turns: number, cargoValue: number, rush: boolean): number {
  requireNonNegative('turns', turns);
  requireNonNegative('cargo value', cargoValue);
  const commission = cargoValue * CONTRACTS.haul.valueShare;
  const standard = turns * EFFORT.wage[1] * CONTRACTS.haul.rewardFactor + commission;
  return Math.round(rush ? standard * CONTRACTS.haul.rush.premium : standard);
}

export function haulWindow(turns: number, rush: boolean): number {
  requireNonNegative('turns', turns);
  const haul = CONTRACTS.haul;
  return Math.round(rush ? turns * haul.rush.durationFactor : turns * haul.durationFactor + haul.slackTurns);
}

function requireNonNegative(what: string, n: number): void {
  if (!Number.isFinite(n) || n < 0) throw new Error(`A haul needs a finite ${what} of at least 0, got ${n}`);
}

export function vehicleValue(v: Vehicle): number {
  const parts = v.items.flatMap((it) => (it.kind === 'part' ? [it.part] : []));
  return chassisDef(v.chassisId).value + parts.reduce((a, p) => a + partValue(p), 0);
}

export function cargoValue(v: Vehicle): number {
  const goods = Object.entries(goodsCount(v)).reduce((a, [good, n]) => a + n * goodValue(good), 0);
  return goods + spareParts(v).reduce((a, p) => a + partValue(p), 0);
}

export function bountyReward(templateId: string): number {
  const turns = CONTRACTS.bounty.rewardTurns[templateId];
  if (turns === undefined) throw new Error(`No bounty reward for template ${templateId}`);
  return Math.round(turns * EFFORT.wage[1]);
}

export function partPristineBuyPrice(defId: string): number {
  return Math.round(PARTS[defId].value * (1 + ECONOMY.spread));
}

export function fetchReward(defId: string, tier: Tier): number {
  return partPristineBuyPrice(defId) + Math.round(CONTRACTS.fetch.searchFeeTurns * EFFORT.wage[tier]);
}

function highestPartTier(v: Vehicle): Tier {
  const tiers = v.items.flatMap((it) => (it.kind === 'part' && PARTS[it.part.defId].kind !== 'core' ? [PARTS[it.part.defId].tier] : []));
  return tiers.length ? (Math.max(...tiers) as Tier) : 1;
}

export type HaulLeg = { good: string; to: { id: string; pos: Vec }; units: number };

type RollInput = {
  shop: { id: string; pos: Vec };
  legs: HaulLeg[];
  partDefIds: string[];
  raiders: Vehicle[];
  clients: Vehicle[];
};

function pick<T>(world: World, list: T[]): T {
  return list[randInt(world.marketRng, 0, list.length - 1)];
}

type BoardKind = Exclude<Contract['kind'], 'escort'>;

function possibleKinds(input: RollInput): BoardKind[] {
  const kinds: BoardKind[] = [];
  if (input.legs.length > 0) kinds.push('haul');
  if (input.partDefIds.length > 0) kinds.push('fetch');
  if (input.raiders.length > 0) kinds.push('bounty');
  if (input.clients.length > 0) kinds.push('rescue');
  return kinds;
}

function rollHaul(world: World, input: RollInput, id: string): Contract {
  const leg = pick(world, input.legs);
  const tier = GOODS[leg.good].tier;
  const units = randInt(world.marketRng, CONTRACTS.haul.units[0], Math.min(CONTRACTS.haul.units[1], leg.units));
  const turns = estimateTurns(input.shop.pos, leg.to.pos);
  const rush = chance(world.marketRng, CONTRACTS.haul.rush.chance);
  const reward = contractReward(turns, units * goodValue(leg.good), rush);
  const window = haulWindow(turns, rush);
  return { id, shop: input.shop.id, kind: 'haul', good: leg.good, units, to: leg.to.id, reward, deadline: world.turn + window, window, rush, tier };
}

function rollFetch(world: World, input: RollInput, id: string): Contract {
  const defId = pick(world, input.partDefIds);
  const tier = PARTS[defId].tier;
  const turns = randInt(world.marketRng, CONTRACTS.fetch.durationTurns[0], CONTRACTS.fetch.durationTurns[1]);
  const reward = fetchReward(defId, tier);
  return { id, shop: input.shop.id, kind: 'fetch', defId, reward, deadline: world.turn + turns, window: turns, tier };
}

function rollBounty(world: World, input: RollInput, id: string): Contract {
  const target = pick(world, input.raiders);
  if (!target.brain) throw new Error(`Raider ${target.id} has no brain`);
  const tier = highestPartTier(target);
  const turns = randInt(world.marketRng, CONTRACTS.bounty.durationTurns[0], CONTRACTS.bounty.durationTurns[1]);
  const reward = bountyReward(target.brain.templateId);
  return { id, shop: input.shop.id, kind: 'bounty', template: target.brain.templateId, reward, deadline: world.turn + turns, window: turns, tier, fulfilled: false };
}

function rollRescueOffer(world: World, input: RollInput, id: string): Contract {
  return rollRescue(world, input.shop, input.clients, id);
}

const ROLLS = { haul: rollHaul, fetch: rollFetch, bounty: rollBounty, rescue: rollRescueOffer };

export function rollContract(
  world: World,
  shop: { id: string; pos: Vec },
  legs: HaulLeg[],
  partDefIds: string[],
  raiders: Vehicle[],
  clients: Vehicle[] = [],
): Contract | null {
  const input = { shop, legs, partDefIds, raiders, clients };
  const kinds = possibleKinds(input);
  if (kinds.length === 0) return null;
  const kind = pick(world, kinds);
  return ROLLS[kind](world, input, newId(world, 'ct'));
}

export function haulLegs(world: World, shopId: string): HaulLeg[] {
  const origin = shopState(world, shopId);
  return graphEdges().filter((e) => e.from === shopId).flatMap((e) => {
    const units = goodStock(origin, e.good);
    const wanted = goodStock(shopState(world, e.to), e.good) <= stockTarget(e.to, e.good);
    return wanted && units >= CONTRACTS.haul.units[0] ? [{ good: e.good, to: { id: e.to, pos: shopPos(e.to) }, units }] : [];
  });
}

export function isExpired(world: World, c: Contract): boolean {
  return world.turn > c.deadline;
}

export function playerDefeats(world: World): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of world.events) {
    const template = playerDefeatOf(world, e);
    if (template) out.set(template, (out.get(template) ?? 0) + 1);
  }
  return out;
}

function playerDefeatOf(world: World, e: GameEvent): string | null {
  if (!isPlayerBlow(world, e)) return null;
  const v = beatenTruck(world, e.vehicle);
  if (e.t === 'destroyed' && isDefeated(v)) return null;
  return v.brain?.templateId ?? null;
}

function isPlayerBlow(world: World, e: GameEvent): e is Extract<GameEvent, { t: 'destroyed' | 'npcKnockout' }> {
  return (e.t === 'destroyed' || e.t === 'npcKnockout') && e.by === world.player.vehicleId;
}

function beatenTruck(world: World, id: string): Vehicle {
  const v = world.removed.find((x) => x.id === id) ?? world.vehicles.find((x) => x.id === id);
  if (!v) throw new Error(`No truck ${id} for a defeat this turn`);
  return v;
}

export function fulfilBounty(world: World, template: string): void {
  const c = world.player.contracts.find((x): x is Extract<Contract, { kind: 'bounty' }> => x.kind === 'bounty' && x.template === template && !x.fulfilled);
  if (!c) return;
  c.fulfilled = true;
  world.events.push({ t: 'contract', contract: { ...c }, outcome: 'fulfilled' });
}

export function creditBounty(world: World, npc: Vehicle): void {
  if (!npc.brain) throw new Error(`${npc.id} has no driver to name in a bounty`);
  fulfilBounty(world, npc.brain.templateId);
}

export function bountyLapsed(world: World, c: Contract): boolean {
  if (c.kind !== 'bounty') throw new Error(`${c.kind} contract has no bounty target`);
  return !world.vehicles.some((v) => v.brain?.templateId === c.template);
}

export function haulPenalty(c: Extract<Contract, { kind: 'haul' }>, goodValue: number): number {
  return Math.round(c.units * goodValue * CONTRACTS.haul.penaltyShare);
}

function shopPos(shopId: string): Vec {
  return siteOf(shopId).pos;
}

export function shopState(world: World, shopId: string): ShopState {
  const state = world.shops[shopId];
  if (!state) throw new Error(`Unknown shop ${shopId}`);
  return state;
}

export function standingPressures(world: World, shopId: string): Record<string, number> {
  const state = shopState(world, shopId);
  return Object.fromEntries(shopDef(shopId).goods.map((good) => [good, pressureOf(shopId, good, goodStock(state, good))]));
}

function fillBoard(world: World, shopId: string, state: ShopState): void {
  const def = shopDef(shopId);
  const stocked = new Set(state.stock.map((p) => p.defId));
  const partDefIds = Object.keys(PARTS).filter((id) => PARTS[id].kind !== 'core' && !stocked.has(id));
  const clients = modeRules(world).rescue ? rescueClients(world, { id: shopId, pos: shopPos(shopId) }) : [];
  while (state.contracts.length < def.contractSlots) {
    const postedTemplates = new Set(state.contracts.filter((c) => c.kind === 'bounty').map((c) => c.template));
    const raiders = world.vehicles.filter((v) => v.faction === 'raiders' && v.brain && !postedTemplates.has(v.brain.templateId));
    const legs = haulLegs(world, shopId).filter((leg) => !state.contracts.some((c) => c.kind === 'haul' && c.good === leg.good && c.to === leg.to.id));
    const contract = rollContract(world, { id: shopId, pos: shopPos(shopId) }, legs, partDefIds, raiders, clients);
    if (!contract) return;
    if (contract.kind === 'rescue') clients.splice(clients.findIndex((v) => v.id === contract.client), 1);
    state.contracts.push(contract);
  }
}

const MARKET_SALT = 0x6d61726b;

export function marketStream(seed: number): Rng {
  return { rngState: seed ^ MARKET_SALT };
}

export function initializeShops(world: World): void {
  world.shops = {};
  for (const shopId of Object.keys(SHOPS)) world.shops[shopId] = initShop(world, shopId);
  for (const [shopId, state] of Object.entries(world.shops)) fillBoard(world, shopId, state);
}

export function advanceShops(world: World): void {
  pruneEscortOffers(world);
  for (const [shopId, state] of Object.entries(world.shops)) {
    const restockAt = state.restockAt;
    advanceShop(world, shopId, state);
    state.contracts = state.contracts.filter((c) => !isExpired(world, c) && (c.kind !== 'rescue' || rescueOfferValid(world, c)));
    if (state.restockAt === restockAt) continue;
    state.contracts = state.contracts.filter((c) => offerStillValid(world, c));
    fillBoard(world, shopId, state);
  }
}

function offerStillValid(world: World, c: Contract): boolean {
  if (c.kind === 'rescue') return rescueOfferValid(world, c);
  return c.kind !== 'bounty' || !bountyLapsed(world, c);
}

export function shopAt(world: World): string | null {
  return playerVehicle(world).speed > RULES.parkedSpeed ? null : shopNear(world);
}

export function shopNear(world: World): string | null {
  const pos = playerVehicle(world).pos;
  return Object.keys(world.shops).find((id) => canUseSite(pos, siteOf(id))) ?? null;
}

export function siteOf(siteId: string): Site {
  const site = [...REGION.towns, ...REGION.locations].find((s) => s.id === siteId);
  if (!site) throw new Error(`No site ${siteId} in the region`);
  return site;
}

export function requireShop(world: World): string {
  const shopId = shopAt(world);
  if (!shopId) throw new Error('Not parked at a shop');
  return shopId;
}

function requireParkedAt(world: World, shopId: string): void {
  if (shopAt(world) !== shopId) throw new Error(`Not parked at ${shopId}`);
}

export function acceptContract(world: World, contractId: string): World {
  return playerCommand(world, (w) => takeContract(w, contractId));
}

export function takeContract(w: World, contractId: string): void {
  const shopId = shopAt(w);
  if (!shopId) throw new Error('Not parked at a shop');
  const board = shopState(w, shopId).contracts;
  const contract = board.find((c) => c.id === contractId);
  if (!contract) throw new Error(`No contract ${contractId} at ${shopId}`);
  if (isExpired(w, contract)) throw new Error(`Offer ${contractId} has expired`);
  if (w.player.contracts.length >= CONTRACTS.maxActive) throw new Error(`You already hold ${CONTRACTS.maxActive} contracts`);
  if (contract.kind === 'haul') loadHaul(w, contract);
  if (contract.kind === 'escort') takeEscortJob(w, contract);
  else contract.deadline = w.turn + contract.window;
  board.splice(board.indexOf(contract), 1);
  w.player.contracts.push(contract);
  w.events.push({ t: 'contract', contract: { ...contract }, outcome: 'accepted' });
}

export function haulBlocked(world: World, c: Contract): boolean {
  return c.kind === 'haul' && (world.player.money < 0 || freeCells(playerVehicle(world)) < c.units || haulShort(world, c));
}

export function haulShort(world: World, c: Extract<Contract, { kind: 'haul' }>): boolean {
  return goodStock(shopState(world, c.shop), c.good) < c.units;
}

function loadHaul(world: World, c: Extract<Contract, { kind: 'haul' }>): void {
  if (world.player.money < 0) throw new Error('Cannot take on a haul while in debt');
  const v = playerVehicle(world);
  if (freeCells(v) < c.units) throw new Error(`Needs ${c.units} free cells for the cargo`);
  moveStock(shopState(world, c.shop), c.shop, c.good, -c.units, 'contract');
  const held = goodsCount(v)[c.good] ?? 0;
  if (addGoods(world, v, c.good, c.units) !== c.units) throw new Error('Cargo capacity invariant failed');
  const paid = world.player.costBasis[c.good] ?? 0;
  world.player.costBasis[c.good] = (paid * held + goodValue(c.good) * c.units) / (held + c.units);
}

export function deliverContract(world: World, contractId: string): World {
  return playerCommand(world, (w) => {
    const contract = w.player.contracts.find((c) => c.id === contractId);
    if (!contract) throw new Error(`No active contract ${contractId}`);
    if (contract.kind === 'escort') throw new Error('An escort ends on the road, not at a counter');
    if (contract.kind === 'haul') handInHaul(w, contract);
    else if (contract.kind === 'fetch') handInFetch(w, contract);
    else handInMet(w, contract);
    finishContract(w, contract, 'done');
  });
}

function handInMet(world: World, c: Extract<Contract, { kind: 'bounty' | 'rescue' }>): void {
  requireParkedAt(world, c.shop);
  if (!c.fulfilled) throw new Error(`The ${c.kind} is not met yet`);
}

function handInHaul(world: World, c: Extract<Contract, { kind: 'haul' }>): void {
  requireParkedAt(world, c.to);
  const v = playerVehicle(world);
  if ((goodsCount(v)[c.good] ?? 0) < c.units) throw new Error(`Needs ${c.units} ${c.good}`);
  removeGoods(v, c.good, c.units);
  if (shopDef(c.to).goods.includes(c.good)) moveStock(shopState(world, c.to), c.to, c.good, c.units, 'contract');
}

export function fitsFetch(c: Extract<Contract, { kind: 'fetch' }>, p: PartInstance): boolean {
  return p.defId === c.defId && p.hp > 0 && !isJunk(p) && p.wear <= CONTRACTS.fetch.maxWear;
}

function handInFetch(world: World, c: Extract<Contract, { kind: 'fetch' }>): void {
  requireParkedAt(world, c.shop);
  const v = playerVehicle(world);
  const spare = spareParts(v).find((p) => fitsFetch(c, p));
  if (spare) {
    v.items = v.items.filter((it) => it.kind !== 'part' || it.part.id !== spare.id);
    return;
  }
  const stored = world.player.storage.findIndex((p) => fitsFetch(c, p));
  if (stored < 0) throw new Error(`Needs a spare ${c.defId}, working and rebuilt at most ${CONTRACTS.fetch.maxWear} time${CONTRACTS.fetch.maxWear === 1 ? '' : 's'}`);
  world.player.storage.splice(stored, 1);
}

export function contractXp(c: Contract): number {
  const effort = c.kind === 'fetch' ? c.reward - partPristineBuyPrice(c.defId) : c.reward;
  return Math.round(effort * CONTRACTS[c.kind].xpPerEffort);
}

export function finishContract(world: World, c: Contract, outcome: 'done' | 'failed' | 'lapsed' | 'released'): void {
  if (outcome !== 'done' && isMet(c)) throw new Error(`A fulfilled ${c.kind} cannot be ${outcome}`);
  world.player.contracts = world.player.contracts.filter((x) => x.id !== c.id);
  world.events.push({ t: 'contract', contract: { ...c }, outcome });
  if (outcome === 'done') payContract(world, c, c.reward);
  if (outcome === 'released') payContract(world, c, c.kind === 'escort' ? Math.round(c.reward * escortShare(c)) : 0);
  if (outcome === 'failed' && c.kind === 'haul') chargeHaulPenalty(world, c);
}

function payContract(world: World, c: Contract, amount: number): void {
  if (amount <= 0) return;
  world.player.money += amount;
  world.events.push({ t: 'money', amount, reason: { kind: 'contract' } });
  practice(world, 'contract', contractXp({ ...c, reward: amount }), null, c.shop);
}

function chargeHaulPenalty(world: World, c: Extract<Contract, { kind: 'haul' }>): void {
  const penalty = haulPenalty(c, goodValue(c.good));
  world.player.money -= penalty;
  world.events.push({ t: 'money', amount: -penalty, reason: { kind: 'failedHaul' } });
}

function isMet(c: Contract): boolean {
  return (c.kind === 'bounty' || c.kind === 'rescue') && c.fulfilled;
}

export function advanceContracts(world: World): void {
  for (const [template, count] of playerDefeats(world)) for (let i = 0; i < count; i++) fulfilBounty(world, template);
  for (const c of world.player.contracts.filter((x) => !isMet(x))) settleContract(world, c);
}

function settleContract(world: World, c: Contract): void {
  if (c.kind === 'escort') return settleEscortJob(world, c);
  const outcome = contractOutcome(world, c);
  if (outcome) finishContract(world, c, outcome);
  else if (c.deadline - world.turn === CONTRACTS.warnTurns) world.events.push({ t: 'contract', contract: { ...c }, outcome: 'expiring' });
}

function contractOutcome(world: World, c: Contract): 'failed' | 'lapsed' | null {
  if (c.kind === 'rescue') return null;
  if (c.kind === 'bounty' && bountyLapsed(world, c)) return 'lapsed';
  return isExpired(world, c) ? 'failed' : null;
}
