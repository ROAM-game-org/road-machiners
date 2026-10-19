import { describe, expect, it } from 'vitest';
import { ROAD_NEWS } from '../data/market';
import { NPCS } from '../data/npcs';
import { REGION } from '../data/region';
import { TIME } from '../data/time';
import { goodsCount } from './grid';
import { addGoods } from './inventory';
import { sellVehicleCargo } from './economy';
import { tradeOffers } from './npc-decisions';
import { yieldTo } from './parley';
import { legRisk, liveRoadNews, reportLoss, reportLostTruck, reportShipmentLoss } from './road-news';
import { sitePads } from './sites';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import type { RoadNews, Vehicle, World } from './types';

const site = (id: string) => [...REGION.towns, ...REGION.locations].find((s) => s.id === id)!;

function shipping(w: World, good: string, from: string, to: string, crates: number): Vehicle {
  const npc = addVehicle(w, 'bowl', 'hauler', ['mg', 'workhorseDiesel', 'trailerBox'], { ...sitePads(site(from))[0] });
  npc.brain = npcBrain('convoy', npc.pos, ['supplier']);
  npc.brain.goals = [{ kind: 'sell', targetId: to, destination: { ...site(to).pos }, phase: 'travel', reason: 'deliverCargo', shipment: { good, from, to } }];
  if (addGoods(w, npc, good, crates) !== crates) throw new Error('No room for the shipment');
  return npc;
}

const news = (turn: number, from = 'dustwell', to = 'bowl'): RoadNews => ({ turn, kind: 'robbed', good: 'water', units: 3, from, to });

describe('road news', () => {
  it('reports a lost shipment with its good, crates and leg', () => {
    const w = emptyWorld();
    const npc = shipping(w, 'grain', 'bowl', 'granary', 8);
    reportShipmentLoss(w, npc, 'robbed', 5);
    expect(w.roadNews).toEqual([{ turn: w.turn, kind: 'robbed', good: 'grain', units: 5, from: 'bowl', to: 'granary' }]);
  });

  it('writes nothing for a truck that carries no shipment, or loses none of it', () => {
    const w = emptyWorld();
    const npc = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 40, y: 40 });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    reportLostTruck(w, npc, 'destroyed');
    reportShipmentLoss(w, shipping(w, 'grain', 'bowl', 'granary', 8), 'robbed', 0);
    expect(w.roadNews).toEqual([]);
  });

  it('reports every shipment crate on a knocked-out or destroyed truck', () => {
    const w = emptyWorld();
    reportLostTruck(w, shipping(w, 'water', 'dustwell', 'bowl', 6), 'knockedOut');
    expect(w.roadNews.map((n) => [n.kind, n.units])).toEqual([['knockedOut', 6]]);
  });

  it('throws on news that names an unknown site', () => {
    expect(() => reportLoss(emptyWorld(), news(1, 'nowhere'))).toThrow(/unknown site/);
  });

  it('keeps at most ROAD_NEWS.max entries, and lets entries expire after ROAD_NEWS.days', () => {
    const w = emptyWorld();
    w.turn = 5000;
    for (let i = 0; i < ROAD_NEWS.max + 4; i++) reportLoss(w, news(w.turn));
    expect(w.roadNews).toHaveLength(ROAD_NEWS.max);
    w.turn += Math.round(ROAD_NEWS.days * TIME.turnsPerDay);
    expect(liveRoadNews(w)).toEqual([]);
    reportLoss(w, news(w.turn));
    expect(w.roadNews).toHaveLength(1);
  });

  it('counts the risk of a leg in either direction while the news lives', () => {
    const w = emptyWorld();
    w.turn = 5000;
    reportLoss(w, news(w.turn, 'dustwell', 'bowl'));
    reportLoss(w, news(w.turn, 'bowl', 'dustwell'));
    expect(legRisk(w, 'dustwell', 'bowl')).toBeCloseTo(2 * ROAD_NEWS.riskShare);
    expect(legRisk(w, 'bowl', 'dustwell')).toBeCloseTo(2 * ROAD_NEWS.riskShare);
    expect(legRisk(w, 'green-pit', 'bowl')).toBe(0);
    w.turn += Math.round(ROAD_NEWS.days * TIME.turnsPerDay);
    expect(legRisk(w, 'dustwell', 'bowl')).toBe(0);
  });
});

describe('a robbed shipment', () => {
  it('writes road news, and the robbed crates never reach the buyer stock', () => {
    const w = emptyWorld();
    const npc = shipping(w, 'grain', 'bowl', 'granary', 8);
    const robber = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: npc.pos.x + 4, y: npc.pos.y });
    robber.brain = npcBrain('buggy', robber.pos, ['raider']);
    const handed = npc.items.filter((it) => it.kind === 'good' && it.good === 'grain').slice(0, 5);
    yieldTo(w, npc, robber, handed);
    expect(w.roadNews).toMatchObject([{ kind: 'robbed', good: 'grain', units: 5, from: 'bowl', to: 'granary' }]);
    const before = w.shops.granary.goods.grain;
    npc.pos = { ...sitePads(site('granary'))[0] };
    npc.speed = 0;
    sellVehicleCargo(w, npc, 'granary', 0);
    expect(goodsCount(npc).grain ?? 0).toBe(0);
    expect(w.shops.granary.goods.grain).toBe(before + 3);
  });
});

describe('route choice with road news', () => {
  function waterBuyer(): { w: World; trader: Vehicle } {
    const w = emptyWorld();
    w.turn = 5000;
    w.shops.bowl.goods.water = 0;
    const trader = addVehicle(w, 'independent', 'hauler', ['stockEngine', 'trailerBox'], { ...sitePads(site('bowl'))[0] });
    trader.brain = npcBrain('trader', trader.pos, ['trader']);
    trader.resources = { ...trader.resources!, money: NPCS.trader.money * 10 };
    return { w, trader };
  }

  const waterWeight = (w: World, trader: Vehicle, from: string) =>
    tradeOffers(w, trader).find((o) => o.value.good === 'water' && o.value.source === from && o.value.sellShop === 'bowl')?.weight ?? 0;

  it('weighs a robbed Dustwell to Bowl water run below the Green Pit run while the news lives', () => {
    const { w, trader } = waterBuyer();
    const dustwell = waterWeight(w, trader, 'dustwell');
    expect(dustwell).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) reportLoss(w, news(w.turn, 'dustwell', 'bowl'));
    expect(waterWeight(w, trader, 'dustwell')).toBeLessThan(dustwell);
    expect(waterWeight(w, trader, 'green-pit')).toBeGreaterThan(waterWeight(w, trader, 'dustwell'));
    w.turn += Math.round(ROAD_NEWS.days * TIME.turnsPerDay);
    expect(waterWeight(w, trader, 'dustwell')).toBeCloseTo(dustwell);
  });
});
