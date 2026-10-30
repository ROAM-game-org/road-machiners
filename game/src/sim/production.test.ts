import { itemValue } from '../data/units';
import { describe, expect, it } from 'vitest';
import { GOODS } from '../data/goods';
import { EFFORT, SHOPS } from '../data/market';
import { ESSENTIAL_GOODS, PRODUCTION, RELIEF, SITE_ECONOMY, SITE_EVENTS, graphEdges, madeGoods, rationsValue, siteRecipes, usedGoods } from '../data/market';
import { TIME } from '../data/time';
import { goodPrice, shopState, stockTarget, fullStock, watchStock, type StockCause } from './market';
import { advanceProduction, essentialShort, recipeRunning, reliefCeiling } from './production';
import { emptyWorld } from './testkit';
import type { World } from './types';
import { ECONOMY } from '../data/goods';

const CYCLE = PRODUCTION.cycleTurns;

function runCycles(w: World, cycles: number): void {
  for (let i = 0; i < cycles; i++) {
    w.turn = (Math.floor(w.turn / CYCLE) + 1) * CYCLE;
    advanceProduction(w);
  }
}

function quietWorld(): World {
  const w = emptyWorld();
  w.turn = CYCLE * 1000 + 1;
  for (const state of Object.values(w.shops)) state.event = null;
  return w;
}

function recipe(shopId: string, id: string) {
  const found = siteRecipes(shopId).find((r) => r.id === id);
  if (!found) throw new Error(`No ${id} at ${shopId}`);
  return found;
}

function withoutEvents<T>(run: () => T): T {
  const chances = SITE_EVENTS.map((e) => e.dailyChance);
  for (const e of SITE_EVENTS) (e as { dailyChance: number }).dailyChance = 0;
  try {
    return run();
  } finally {
    SITE_EVENTS.forEach((e, i) => ((e as { dailyChance: number }).dailyChance = chances[i]));
  }
}

describe('the production graph', () => {
  it('makes every good somewhere', () => {
    const made = new Set(Object.keys(SITE_ECONOMY).flatMap(madeGoods));
    for (const good of Object.keys(GOODS)) expect(made.has(good), good).toBe(true);
  });

  it('trades every input, upkeep and demand good at its own site', () => {
    for (const [shopId, site] of Object.entries(SITE_ECONOMY)) {
      const goods = SHOPS[shopId].goods;
      for (const r of site.recipes) for (const good of [...Object.keys(r.inputs), ...Object.keys(r.outputs), ...r.upkeep]) expect(goods, `${shopId} ${good}`).toContain(good);
      for (const good of Object.keys(site.demand)) expect(goods).toContain(good);
    }
  });

  it('gives every civilian shop a recipe or a demand', () => {
    for (const shopId of Object.keys(SHOPS)) {
      const site = SITE_ECONOMY[shopId];
      expect(site, shopId).toBeDefined();
      expect(site.recipes.length + Object.keys(site.demand).length).toBeGreaterThan(0);
    }
  });

  it('holds the round trips the region runs on', () => {
    const edge = (good: string, from: string, to: string) => graphEdges().some((e) => e.good === good && e.from === from && e.to === to);
    expect(edge('water', 'dustwell', 'bowl')).toBe(true);
    expect(edge('water', 'green-pit', 'bowl')).toBe(true);
    expect(edge('grain', 'bowl', 'granary')).toBe(true);
    expect(graphEdges().filter((e) => e.good === 'rations' && e.from === 'granary').length).toBeGreaterThanOrEqual(2);
    expect(edge('scrap', 'salvage-yard', 'nose')).toBe(true);
    expect(edge('fuelDrums', 'pump-station', 'nose')).toBe(true);
    expect(edge('salt', 'nose', 'granary')).toBe(true);
    expect(graphEdges().filter((e) => e.good === 'tools' && e.from === 'nose').length).toBeGreaterThanOrEqual(3);
  });

  it('sells rations and fuel drums wherever a shop serves supplies', () => {
    for (const shop of Object.values(SHOPS)) for (const good of ['rations', 'fuelDrums']) expect(shop.goods, shop.id).toContain(good);
  });

  it('values rations at their inputs plus the turns of tier 1 work, per crate', () => {
    const r = recipe('granary', 'rations');
    const inputs = Object.entries(r.inputs).reduce((sum, [good, n]) => sum + n * GOODS[good].value, 0);
    const expected = itemValue((inputs + r.everyCycles * CYCLE * EFFORT.wage[1]) / r.outputs.rations);
    expect(GOODS.rations.value).toBe(expected);
    expect(rationsValue(Object.fromEntries(Object.values(GOODS).map((g) => [g.id, g.value])), EFFORT.wage[1])).toBe(expected);
  });

  it('marks the essential goods as used by some site each', () => {
    for (const good of ESSENTIAL_GOODS) expect(Object.keys(SHOPS).some((id) => usedGoods(id).includes(good)), good).toBe(true);
  });
});

describe('the production clock', () => {
  it('runs a batch only on a production boundary', () => withoutEvents(() => {
    const w = quietWorld();
    const before = { ...shopState(w, 'granary').goods };
    advanceProduction(w);
    expect(shopState(w, 'granary').goods).toEqual(before);
  }));

  it('takes a batch of inputs and makes its outputs, all at once', () => withoutEvents(() => {
    const w = quietWorld();
    const r = recipe('granary', 'rations');
    const state = shopState(w, 'granary');
    state.goods.rations = 0;
    const before = { ...state.goods };
    runCycles(w, r.everyCycles);
    expect(state.goods.rations).toBe(r.outputs.rations);
    for (const [good, n] of Object.entries(r.inputs)) expect(state.goods[good]).toBe(before[good] - n);
  }));

  it('skips a batch with a missing input and keeps the rest of its inputs', () => withoutEvents(() => {
    const w = quietWorld();
    const state = shopState(w, 'granary');
    state.goods.rations = 0;
    state.goods.salt = 0;
    const grain = state.goods.grain;
    runCycles(w, 12);
    expect(state.goods.rations).toBe(0);
    expect(state.goods.grain).toBe(grain);
    expect(recipeRunning(w, 'granary', 'rations')).toBe('stopped');
  }));

  it('falls back to the dry-farm trickle at Bowl without water', () => withoutEvents(() => {
    const w = quietWorld();
    const r = recipe('bowl', 'sorgut');
    const state = shopState(w, 'bowl');
    state.goods.water = 0;
    state.goods.grain = 0;
    runCycles(w, r.everyCycles * 4);
    expect(state.goods.grain).toBe(4 * r.fallback!.grain);
    expect(recipeRunning(w, 'bowl', 'sorgut')).toBe('fallback');
    state.goods.water = 10;
    state.goods.grain = 0;
    runCycles(w, r.everyCycles * 4);
    expect(state.goods.grain).toBe(4 * r.outputs.grain);
  }));

  it('runs a recipe at its worn cadence without its upkeep good', () => withoutEvents(() => {
    const w = quietWorld();
    const r = recipe('pump-station', 'pump');
    const state = shopState(w, 'pump-station');
    state.goods.fuelDrums = 0;
    state.goods.tools = 0;
    runCycles(w, r.wornEvery * 4);
    expect(state.goods.fuelDrums).toBe(4 * r.outputs.fuelDrums);
    expect(recipeRunning(w, 'pump-station', 'pump')).toBe('worn');
    state.goods.tools = 5;
    state.goods.fuelDrums = 0;
    runCycles(w, r.wornEvery * 4);
    expect(state.goods.fuelDrums).toBe((4 * r.wornEvery * r.outputs.fuelDrums) / r.everyCycles);
  }));

  it('uses up one upkeep crate per upkeepBatches batches', () => withoutEvents(() => {
    const w = quietWorld();
    const r = recipe('pump-station', 'pump');
    const state = shopState(w, 'pump-station');
    const tools = state.goods.tools;
    for (let i = 0; i < r.upkeepBatches * 2; i++) {
      state.goods.fuelDrums = 0;
      runCycles(w, r.everyCycles);
    }
    expect(state.goods.tools).toBe(tools - 2);
  }));

  it('stops making an output at its full stock', () => withoutEvents(() => {
    const w = quietWorld();
    const state = shopState(w, 'dustwell');
    state.goods.water = fullStock('dustwell', 'water') - 1;
    runCycles(w, 30);
    expect(state.goods.water).toBe(fullStock('dustwell', 'water'));
  }));

  it('uses up demand one crate at a time and never below zero', () => withoutEvents(() => {
    const w = quietWorld();
    const every = SITE_ECONOMY.nose.demand.meds;
    const state = shopState(w, 'nose');
    state.goods.meds = 2;
    runCycles(w, every * 5);
    expect(state.goods.meds).toBe(0);
  }));

  it('repeats the same stocks for the same seed over ten days', () => {
    const run = () => {
      const w = emptyWorld();
      w.turn = 1;
      runCycles(w, (TIME.turnsPerDay / CYCLE) * 10);
      return { goods: Object.fromEntries(Object.entries(w.shops).map(([id, s]) => [id, s.goods])), rng: w.marketRng.rngState };
    };
    expect(run()).toEqual(run());
  });
});

describe('the relief trickle', () => {
  it('waits at zero for its delay, then adds one crate per step up to the ceiling', () => withoutEvents(() => {
    const w = quietWorld();
    const state = shopState(w, 'granary');
    state.goods.grain = 0;
    state.goods.salt = 0;
    runCycles(w, 1);
    expect(essentialShort(w, 'granary', 'grain')).toBe(true);
    const delayCycles = Math.ceil(RELIEF.delayTurns / CYCLE);
    runCycles(w, delayCycles - 2);
    expect(state.goods.grain).toBe(0);
    runCycles(w, RELIEF.everyCycles * 3 + 2);
    expect(state.goods.grain).toBeGreaterThan(0);
    expect(state.goods.grain).toBeLessThanOrEqual(4);
    runCycles(w, RELIEF.everyCycles * 200);
    expect(state.goods.grain).toBe(reliefCeiling('granary', 'grain'));
    expect(essentialShort(w, 'granary', 'grain')).toBe(false);
  }));

  it('keeps a relieved price near its peak', () => {
    const w = quietWorld();
    const state = shopState(w, 'granary');
    state.goods.grain = reliefCeiling('granary', 'grain');
    const relieved = goodPrice('granary', state, 'grain', 'buy', ECONOMY.spread);
    state.goods.grain = 0;
    const peak = goodPrice('granary', state, 'grain', 'buy', ECONOMY.spread);
    state.goods.grain = stockTarget('granary', 'grain');
    const normal = goodPrice('granary', state, 'grain', 'buy', ECONOMY.spread);
    expect(relieved).toBeGreaterThan(peak * 0.9);
    expect(relieved).toBeGreaterThan(normal * 1.4);
  });

  it('names relief as the only source of an essential good with nothing else coming in', () => withoutEvents(() => {
    const w = quietWorld();
    shopState(w, 'granary').goods.grain = 0;
    shopState(w, 'granary').goods.salt = 0;
    const causes = new Set<StockCause>();
    watchStock((shop, good, delta, cause) => {
      if (shop === 'granary' && good === 'grain' && delta > 0) causes.add(cause);
    });
    try {
      runCycles(w, Math.ceil(RELIEF.delayTurns / CYCLE) + RELIEF.everyCycles * 3);
    } finally {
      watchStock(null);
    }
    expect([...causes]).toEqual(['relief']);
  }));
});

describe('site events', () => {
  it('doubles the drum batches during a Pump Station surge, and the drum price there falls', () => {
    const w = quietWorld();
    const r = recipe('pump-station', 'pump');
    const state = shopState(w, 'pump-station');
    state.goods.fuelDrums = stockTarget('pump-station', 'fuelDrums');
    const before = goodPrice('pump-station', state, 'fuelDrums', 'buy', ECONOMY.spread);
    const quiet = withoutEvents(() => {
      const copy = quietWorld();
      shopState(copy, 'pump-station').goods.fuelDrums = 0;
      runCycles(copy, r.everyCycles * 4);
      return shopState(copy, 'pump-station').goods.fuelDrums;
    });
    state.event = { kind: 'surge', recipe: 'pump', until: w.turn + TIME.turnsPerDay };
    withoutEvents(() => runCycles(w, r.everyCycles * 4));
    expect(state.goods.fuelDrums - stockTarget('pump-station', 'fuelDrums')).toBe(quiet * 2);
    expect(goodPrice('pump-station', state, 'fuelDrums', 'buy', ECONOMY.spread)).toBeLessThan(before);
  });

  it('ends a breakdown at repairTurns when the site holds tools, and uses one crate', () => withoutEvents(() => {
    const w = quietWorld();
    const def = SITE_EVENTS.find((e) => e.kind === 'breakdown' && e.site === 'dustwell')!;
    const state = shopState(w, 'dustwell');
    const tools = state.goods.tools;
    state.event = { kind: 'breakdown', recipe: def.recipe, until: w.turn + def.days * TIME.turnsPerDay };
    runCycles(w, 1);
    expect(state.goods.tools).toBe(tools - 1);
    expect(state.event!.until - w.turn).toBeLessThanOrEqual(def.repairTurns);
    runCycles(w, Math.ceil(def.repairTurns / CYCLE) + 1);
    expect(state.event).toBeNull();
    expect(state.goods.tools).toBe(tools - 1);
  }));

  it('runs a breakdown its full span without tools', () => withoutEvents(() => {
    const w = quietWorld();
    const def = SITE_EVENTS.find((e) => e.kind === 'breakdown' && e.site === 'dustwell')!;
    const state = shopState(w, 'dustwell');
    state.goods.tools = 0;
    const until = w.turn + def.days * TIME.turnsPerDay;
    state.event = { kind: 'breakdown', recipe: def.recipe, until };
    runCycles(w, Math.floor((until - w.turn) / CYCLE) - 1);
    expect(state.event).not.toBeNull();
    runCycles(w, 2);
    expect(state.event).toBeNull();
  }));

  it('rolls events on the market stream only, once a day', () => {
    const w = quietWorld();
    const rng = w.rngState;
    const market = w.marketRng.rngState;
    w.turn = TIME.turnsPerDay * 3 - 1;
    runCycles(w, 1);
    expect(w.marketRng.rngState).not.toBe(market);
    const afterDay = w.marketRng.rngState;
    runCycles(w, 3);
    expect(w.marketRng.rngState).toBe(afterDay);
    expect(w.rngState).toBe(rng);
  });
});
