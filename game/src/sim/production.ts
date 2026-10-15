import { TIME } from '../data/time';
import { ESSENTIAL_GOODS, PRODUCTION, RELIEF, SITE_EVENTS, siteEconomy, type Recipe, type SiteEventDef } from '../data/market';
import { shopDef } from '../data/market';
import { chance } from './rng';
import { fullStock, goodStock, moveStock, shopAt, shopState, stockTarget, type ShopState } from './market';
import type { World } from './types';

export type RecipeRun = 'running' | 'worn' | 'stopped' | 'fallback';

export function isProductionBoundary(turn: number): boolean {
  return turn % PRODUCTION.cycleTurns === 0;
}

function dayOf(turn: number): number {
  return Math.floor(turn / TIME.turnsPerDay);
}

function cycleOf(turn: number): number {
  return Math.floor(turn / PRODUCTION.cycleTurns);
}

export function advanceProduction(world: World): void {
  if (!isProductionBoundary(world.turn)) return;
  const newDay = dayOf(world.turn) !== dayOf(world.turn - PRODUCTION.cycleTurns);
  for (const [shopId, state] of Object.entries(world.shops)) {
    advanceSiteEvent(world, shopId, state, newDay);
    for (const recipe of siteEconomy(shopId).recipes) runRecipe(world, shopId, state, recipe);
    useDemand(world, shopId, state);
    advanceRelief(world, shopId, state);
  }
}

function recipeCadence(shopId: string, state: ShopState, recipe: Recipe): number {
  const base = recipeWorn(shopId, state, recipe) ? recipe.wornEvery : recipe.everyCycles;
  const event = state.event?.recipe === recipe.id ? eventDef(shopId, state.event.kind, recipe.id) : null;
  return Math.max(1, Math.round(base * (event?.cadenceScale ?? 1)));
}

function recipeWorn(shopId: string, state: ShopState, recipe: Recipe): boolean {
  return recipe.upkeep.some((good) => goodStock(state, good) === 0 && tradesGood(shopId, good));
}

function tradesGood(shopId: string, good: string): boolean {
  if (!shopDef(shopId).goods.includes(good)) throw new Error(`${shopId} runs a recipe on ${good}, which it does not trade`);
  return true;
}

function runRecipe(world: World, shopId: string, state: ShopState, recipe: Recipe): void {
  const cadence = recipeCadence(shopId, state, recipe);
  const cycle = cycleOf(world.turn);
  if (cycle % cadence !== 0) return;
  const batch = batchOf(state, recipe);
  if (!batch || allFull(shopId, state, batch.outputs)) return;
  runBatch(shopId, state, batch.inputs, batch.outputs);
  useUpkeep(shopId, state, recipe, cycle / cadence);
}

type Batch = { inputs: Record<string, number>; outputs: Record<string, number> };

function batchOf(state: ShopState, recipe: Recipe): Batch | null {
  if (hasInputs(state, recipe)) return { inputs: recipe.inputs, outputs: recipe.outputs };
  return recipe.fallback ? { inputs: {}, outputs: recipe.fallback } : null;
}

function runBatch(shopId: string, state: ShopState, inputs: Record<string, number>, outputs: Record<string, number>): void {
  for (const [good, n] of Object.entries(inputs)) moveStock(state, shopId, good, -n, 'recipe');
  for (const [good, n] of Object.entries(outputs)) moveStock(state, shopId, good, Math.min(n, roomBelowFull(shopId, state, good)), 'recipe');
}

function allFull(shopId: string, state: ShopState, outputs: Record<string, number>): boolean {
  return Object.keys(outputs).every((good) => roomBelowFull(shopId, state, good) === 0);
}

function roomBelowFull(shopId: string, state: ShopState, good: string): number {
  return Math.max(0, fullStock(shopId, good) - goodStock(state, good));
}

function hasInputs(state: ShopState, recipe: Recipe): boolean {
  return Object.entries(recipe.inputs).every(([good, n]) => goodStock(state, good) >= n);
}

function useUpkeep(shopId: string, state: ShopState, recipe: Recipe, batch: number): void {
  if (batch % recipe.upkeepBatches !== 0) return;
  for (const good of recipe.upkeep) if (goodStock(state, good) > 0) moveStock(state, shopId, good, -1, 'upkeep');
}

function useDemand(world: World, shopId: string, state: ShopState): void {
  const cycle = cycleOf(world.turn);
  for (const [good, every] of Object.entries(siteEconomy(shopId).demand)) {
    if (cycle % every === 0 && goodStock(state, good) > 0) moveStock(state, shopId, good, -1, 'demand');
  }
}

export function recipeRunning(world: World, shopId: string, recipeId: string): RecipeRun {
  const state = shopState(world, shopId);
  const recipe = siteEconomy(shopId).recipes.find((r) => r.id === recipeId);
  if (!recipe) throw new Error(`${shopId} has no recipe ${recipeId}`);
  if (!hasInputs(state, recipe)) return recipe.fallback ? 'fallback' : 'stopped';
  return recipeWorn(shopId, state, recipe) ? 'worn' : 'running';
}

function eventDef(shopId: string, kind: SiteEventDef['kind'], recipe: string): SiteEventDef {
  const def = SITE_EVENTS.find((e) => e.site === shopId && e.kind === kind && e.recipe === recipe);
  if (!def) throw new Error(`${shopId} has no ${kind} event for ${recipe}`);
  return def;
}

function advanceSiteEvent(world: World, shopId: string, state: ShopState, newDay: boolean): void {
  endSiteEvent(world, state);
  if (state.event?.kind === 'breakdown') repairWithTools(world, shopId, state);
  else if (newDay && !state.event) rollSiteEvent(world, shopId, state);
}

function endSiteEvent(world: World, state: ShopState): void {
  if (state.event && world.turn >= state.event.until) state.event = null;
}

function rollSiteEvent(world: World, shopId: string, state: ShopState): void {
  const def = SITE_EVENTS.filter((e) => e.site === shopId).find((e) => chance(world.marketRng, e.dailyChance));
  if (def) startSiteEvent(world, shopId, state, def);
}

function startSiteEvent(world: World, shopId: string, state: ShopState, def: SiteEventDef): void {
  state.event = { kind: def.kind, recipe: def.recipe, until: world.turn + Math.round(def.days * TIME.turnsPerDay) };
  if (def.kind === 'breakdown') repairWithTools(world, shopId, state);
  if (shopAt(world) === shopId) world.events.push({ t: 'siteEvent', shop: shopId, kind: def.kind, recipe: def.recipe });
}

function repairWithTools(world: World, shopId: string, state: ShopState): void {
  const event = state.event;
  if (!event || !shopDef(shopId).goods.includes('tools') || goodStock(state, 'tools') === 0) return;
  const def = eventDef(shopId, 'breakdown', event.recipe);
  if (event.until - world.turn <= def.repairTurns) return;
  moveStock(state, shopId, 'tools', -1, 'repair');
  event.until = world.turn + def.repairTurns;
}

export function usesGood(shopId: string, good: string): boolean {
  return shopDef(shopId).needs.includes(good);
}

export function reliefCeiling(shopId: string, good: string): number {
  return Math.max(1, Math.ceil(stockTarget(shopId, good) * RELIEF.ceilingShare));
}

function advanceRelief(world: World, shopId: string, state: ShopState): void {
  for (const good of ESSENTIAL_GOODS.filter((g) => usesGood(shopId, g))) reliefFor(world, shopId, state, good);
}

function reliefFor(world: World, shopId: string, state: ShopState, good: string): void {
  const stock = goodStock(state, good);
  const since = state.shortSince[good];
  if (since === undefined) {
    if (stock === 0) state.shortSince[good] = world.turn;
  } else if (stock >= reliefCeiling(shopId, good)) {
    delete state.shortSince[good];
  } else if (reliefDue(world, since)) {
    moveStock(state, shopId, good, 1, 'relief');
  }
}

function reliefDue(world: World, since: number): boolean {
  return world.turn - since >= RELIEF.delayTurns && cycleOf(world.turn) % RELIEF.everyCycles === 0;
}

export function essentialShort(world: World, shopId: string, good: string): boolean {
  return shopState(world, shopId).shortSince[good] !== undefined;
}

export function worksDown(world: World, shopId: string): boolean {
  if (!SITE_EVENTS.some((e) => e.site === shopId && e.kind === 'breakdown')) throw new Error(`The works at ${shopId} never break down`);
  return shopState(world, shopId).event?.kind === 'breakdown';
}

export function onRelief(world: World, shopId: string, good: string): boolean {
  const since = shopState(world, shopId).shortSince[good];
  return since !== undefined && world.turn - since >= RELIEF.delayTurns;
}
