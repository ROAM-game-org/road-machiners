import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../data/goods';
import { NPCS } from '../data/npcs';
import { PRODUCTION, RELIEF, SITE_EVENTS, siteRecipes } from '../data/market';
import { REGION } from '../data/region';
import { TIME } from '../data/time';
import { goodsCount } from './grid';
import { affordableBuyCount, tradeGoods } from './economy';
import { cargoRoom } from './inventory';
import { goodPrice, shopState, stockTarget, watchStock } from './market';
import { yieldTo } from './parley';
import { advanceProduction, recipeRunning } from './production';
import { wreckVehicle } from './combat';
import { sitePads } from './sites';
import { spawnNpcs } from './spawn';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import type { Vehicle, World } from './types';

const CYCLE = PRODUCTION.cycleTurns;
const CYCLES_PER_DAY = Math.floor(TIME.workDayTurns / CYCLE);
const site = (id: string) => [...REGION.towns, ...REGION.locations].find((s) => s.id === id)!;

function quiet<T>(run: () => T): T {
  const chances = SITE_EVENTS.map((e) => e.dailyChance);
  for (const e of SITE_EVENTS) (e as { dailyChance: number }).dailyChance = 0;
  try {
    return run();
  } finally {
    SITE_EVENTS.forEach((e, i) => ((e as { dailyChance: number }).dailyChance = chances[i]));
  }
}

function cycle(w: World): void {
  w.turn = (Math.floor(w.turn / CYCLE) + 1) * CYCLE;
  advanceProduction(w);
}

function truck(w: World, templateId: 'convoy' | 'trader'): Vehicle {
  const v = addVehicle(w, templateId === 'convoy' ? 'bowl' : 'independent', 'hauler', ['mg', 'workhorseDiesel', 'trailerBox'], { x: 40, y: 40 });
  v.brain = npcBrain(templateId, v.pos, templateId === 'convoy' ? ['supplier'] : ['trader']);
  v.resources = { ...v.resources!, money: NPCS.convoy.money * 20 };
  v.speed = 0;
  return v;
}

function park(v: Vehicle, shopId: string): void {
  v.pos = { ...sitePads(site(shopId))[0] };
}

function load(w: World, v: Vehicle, good: string, from: string, to: string, most = Infinity): number {
  park(v, from);
  const n = Math.min(most, affordableBuyCount(w, v, from, good, cargoRoom(v), v.resources!.money));
  if (n > 0) tradeGoods(w, v, from, good, n, 'buy');
  v.brain!.goals = [{ kind: 'sell', targetId: to, destination: { ...site(to).pos }, phase: 'travel', reason: 'deliverCargo', shipment: { good, from, to } }];
  return n;
}

function deliver(w: World, v: Vehicle, good: string, to: string): void {
  park(v, to);
  const held = goodsCount(v)[good] ?? 0;
  if (held > 0) tradeGoods(w, v, to, good, held, 'sell');
  v.brain!.goals = [];
}

const buyAt = (w: World, shopId: string, good: string) => goodPrice(shopId, shopState(w, shopId), good, 'buy', ECONOMY.spread);

type Region = { w: World; convoy: Vehicle; courier: Vehicle; noseCourier: Vehicle };

function region(): Region {
  const w = emptyWorld();
  w.turn = CYCLE * 2000;
  for (const s of Object.values(w.shops)) s.event = null;
  return { w, convoy: truck(w, 'convoy'), courier: truck(w, 'trader'), noseCourier: truck(w, 'trader') };
}

function dayOfShipments(r: Region, sorgut: 'arrives' | 'robbed' | 'none', crates = 16): void {
  const { w, convoy, courier } = r;
  for (const good of ['salt', 'water']) w.shops.granary.goods[good] = stockTarget('granary', good);
  if (sorgut !== 'none') load(w, convoy, 'grain', 'bowl', 'granary', crates);
  if (sorgut === 'robbed') {
    const robber = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: convoy.pos.x + 4, y: convoy.pos.y });
    robber.brain = npcBrain('buggy', robber.pos, ['raider']);
    yieldTo(w, convoy, robber, convoy.items.filter((it) => it.kind === 'good' && it.good === 'grain'));
  }
  if (sorgut !== 'none') deliver(w, convoy, 'grain', 'granary');
  load(w, courier, 'rations', 'granary', 'bowl', 12);
  deliver(w, courier, 'rations', 'bowl');
  load(w, r.noseCourier, 'rations', 'granary', 'nose', 12);
  deliver(w, r.noseCourier, 'rations', 'nose');
  for (let i = 0; i < CYCLES_PER_DAY; i++) cycle(w);
}

describe('an intercepted sorgut shipment', () => {
  it('starves the Granary, raises sorgut and then rations prices, and recovers over many cycles once shipments resume', () => quiet(() => {
    const r = region();
    const { w } = r;
    for (let day = 0; day < 3; day++) dayOfShipments(r, 'arrives');
    const steady = { sorgut: buyAt(w, 'granary', 'grain'), rations: buyAt(w, 'bowl', 'rations'), grain: w.shops.granary.goods.grain };

    const arrived: number[] = [];
    watchStock((shop, good, delta, cause) => {
      if (shop === 'granary' && good === 'grain' && cause === 'trade' && delta > 0) arrived.push(delta);
    });
    try {
      dayOfShipments(r, 'robbed');
    } finally {
      watchStock(null);
    }
    expect(arrived).toEqual([]);
    expect(w.roadNews).toMatchObject([{ kind: 'robbed', good: 'grain', from: 'bowl', to: 'granary' }]);
    expect(w.shops.granary.goods.grain).toBeLessThan(steady.grain);
    expect(buyAt(w, 'granary', 'grain')).toBeGreaterThan(steady.sorgut);

    const rationsDays: number[] = [];
    let stoppedOn: number | null = null;
    for (let day = 1; day <= 16 && rationsDays.length === 0; day++) {
      dayOfShipments(r, 'none');
      if (stoppedOn === null && recipeRunning(w, 'granary', 'rations') === 'stopped') stoppedOn = day;
      if (buyAt(w, 'bowl', 'rations') > steady.rations) rationsDays.push(day);
    }
    expect(stoppedOn).not.toBeNull();
    expect(rationsDays.length).toBe(1);
    expect(rationsDays[0]).toBeGreaterThanOrEqual(stoppedOn!);
    const peak = buyAt(w, 'granary', 'grain');

    dayOfShipments(r, 'arrives', 28);
    const afterOne = buyAt(w, 'granary', 'grain');
    expect(afterOne).toBeLessThan(peak);
    expect(afterOne).toBeGreaterThan(steady.sorgut);
    for (let day = 0; day < 4; day++) dayOfShipments(r, 'arrives', 28);
    expect(buyAt(w, 'granary', 'grain')).toBeLessThan(afterOne);
    expect(recipeRunning(w, 'granary', 'rations')).not.toBe('stopped');
  }));

  it('does not snap back on the next turn after a replacement shipment', () => quiet(() => {
    const r = region();
    const { w } = r;
    w.shops.granary.goods.grain = 0;
    const starved = buyAt(w, 'granary', 'grain');
    load(w, r.convoy, 'grain', 'bowl', 'granary', 16);
    deliver(w, r.convoy, 'grain', 'granary');
    const after = buyAt(w, 'granary', 'grain');
    expect(after).toBeLessThan(starved);
    expect(after).toBeGreaterThan(buyAt({ ...w, shops: { ...w.shops, granary: { ...w.shops.granary, goods: { ...w.shops.granary.goods, grain: 50 } } } }, 'granary', 'grain'));
  }));
});

describe('a Pump Station surge', () => {
  it('lowers the drum price there, and the drums it ships to Nose run more tool batches', () => quiet(() => {
    const run = (surge: boolean) => {
      const r = region();
      const { w, convoy } = r;
      w.shops.nose.goods.fuelDrums = 0;
      w.shops.nose.goods.tools = 0;
      w.shops['pump-station'].goods.fuelDrums = 0;
      if (surge) w.shops['pump-station'].event = { kind: 'surge', recipe: 'pump', until: w.turn + TIME.workDayTurns };
      for (let i = 0; i < CYCLES_PER_DAY; i++) cycle(w);
      const price = buyAt(w, 'pump-station', 'fuelDrums');
      load(w, convoy, 'fuelDrums', 'pump-station', 'nose');
      deliver(w, convoy, 'fuelDrums', 'nose');
      for (let i = 0; i < CYCLES_PER_DAY; i++) cycle(w);
      return { price, tools: w.shops.nose.goods.tools };
    };
    const calm = run(false);
    const surge = run(true);
    expect(surge.price).toBeLessThan(calm.price);
    expect(surge.tools).toBeGreaterThanOrEqual(calm.tools);
    expect(siteRecipes('nose').some((r) => r.inputs.fuelDrums)).toBe(true);
  }));
});

describe('a fully intercepted convoy network', () => {
  it('keeps essential goods alive by relief, and spawn timers bring traders and convoys back', () => quiet(() => {
    const w = emptyWorld();
    w.turn = CYCLE * 2000;
    const convoy = truck(w, 'convoy');
    wreckVehicle(w, convoy);
    expect(w.vehicles.filter((v) => v.brain?.templateId === 'convoy' || v.brain?.templateId === 'trader')).toEqual([]);
    for (const s of Object.values(w.shops)) for (const good of ['water', 'grain', 'rations', 'fuelDrums']) if (good in s.goods) s.goods[good] = 0;
    for (let i = 0; i < Math.ceil(RELIEF.delayTurns / CYCLE) + RELIEF.everyCycles * 4; i++) cycle(w);
    expect(w.shops.granary.goods.grain).toBeGreaterThan(0);
    expect(w.shops.bowl.goods.water).toBeGreaterThan(0);
    expect(w.shops.nose.goods.rations).toBeGreaterThan(0);
    for (let i = 0; i < Math.max(NPCS.trader.interval, NPCS.convoy.interval); i++) spawnNpcs(w);
    const back = new Set(w.vehicles.map((v) => v.brain?.templateId));
    expect(back.has('trader')).toBe(true);
    expect(back.has('convoy')).toBe(true);
    for (const v of w.vehicles.filter((x) => x.brain?.templateId === 'convoy' || x.brain?.templateId === 'trader')) expect(goodsCount(v).grain ?? 0).toBe(0);
  }));
});
