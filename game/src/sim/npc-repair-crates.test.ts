import { describe, expect, it } from 'vitest';
import { NPC_UPKEEP, NPCS, ROAD_KIT_PARTS } from '../data/npcs';
import { REGION } from '../data/region';
import { getLotTradePrice, getUpkeepReserve, serviceAtStall, serviceVehicle, truckGoodsForSale } from './economy';
import { goodsCount } from './grid';
import { addGoods } from './inventory';
import { goodStock, type Contract } from './market';
import { npcRepairReserve } from './repair';
import { getResources } from './resources';
import { fuelCap } from './stats';
import { sitePads, type Site } from './sites';
import { fallbackFaction } from './spawn';
import { addVehicle, emptyWorld, finishBusiness, npcBrain } from './testkit';
import type { Vehicle, World } from './types';

const BOWL = REGION.towns.find((t) => t.id === 'bowl')!;
const GRANARY = REGION.locations.find((l) => l.id === 'granary')!;
const CAMP = REGION.locations.find((l) => l.kind === 'camp')!;
const RICH = 100_000;

function npcAt(w: World, templateId: string, site: Site, crates: number, chassisId = 'hauler'): Vehicle {
  const pad = { ...sitePads(site)[0] };
  const npc = addVehicle(w, fallbackFaction(NPCS[templateId]), chassisId, ['stockEngine'], pad);
  npc.brain = npcBrain(templateId, pad, ['trader']);
  if (crates > 0) addGoods(w, npc, 'parts', crates);
  getResources(w, npc).money = RICH;
  return npc;
}

function crates(npc: Vehicle): number {
  return goodsCount(npc).parts ?? 0;
}

function sellAt(w: World, npc: Vehicle, site: Site): void {
  npc.brain!.goals = [{ kind: 'sell', targetId: site.id, destination: { ...npc.pos }, phase: 'travel', reason: 'sellCargo' }];
  finishBusiness(w, npc);
}

const procure = (good: string): Contract => ({ id: 'ct-procure', shop: 'bowl', kind: 'procure', good, units: 3, cratePay: 8, reward: 40, deadline: 500, window: 500, tier: 1 });

describe('NPC repair crate reserve', () => {
  it('gives traders, scavengers and roamers the road kit and everyone else the small reserve', () => {
    const w = emptyWorld();
    for (const id of Object.keys(NPCS)) {
      const npc = npcAt(w, id, BOWL, 0);
      expect(npcRepairReserve(npc), id).toBe(['trader', 'scavenger', 'roamer'].includes(id) ? ROAD_KIT_PARTS : NPC_UPKEEP.repairParts);
    }
  });

  it('fails loud for a truck with no driver or an unknown template', () => {
    const w = emptyWorld();
    const npc = npcAt(w, 'trader', BOWL, 0);
    npc.brain!.templateId = 'nobody';
    expect(() => npcRepairReserve(npc)).toThrow('Unknown NPC template');
    npc.brain = null;
    expect(() => npcRepairReserve(npc)).toThrow('no driver template');
  });

  it.each([['trader', ROAD_KIT_PARTS], ['courier', NPC_UPKEEP.repairParts]] as const)('has a %s keep its reserve when it sells its cargo at a market', (id, reserve) => {
    const w = emptyWorld();
    const npc = npcAt(w, id, BOWL, 8);
    addGoods(w, npc, 'scrap', 2);
    sellAt(w, npc, BOWL);
    expect(goodsCount(npc).scrap).toBeUndefined();
    expect(crates(npc)).toBe(reserve);
  });

  it('offers the player only the crates above the reserve in road trade', () => {
    const w = emptyWorld();
    expect(truckGoodsForSale(npcAt(w, 'trader', BOWL, 8), 'parts')).toBe(8 - ROAD_KIT_PARTS);
    expect(truckGoodsForSale(npcAt(w, 'trader', BOWL, ROAD_KIT_PARTS - 1), 'parts')).toBe(0);
    expect(truckGoodsForSale(npcAt(w, 'courier', BOWL, 3), 'parts')).toBe(3 - NPC_UPKEEP.repairParts);
  });
});

describe('NPC repair crate restock', () => {
  it('buys crates back up to the reserve at a garage service, out of the shop stock at the shop price', () => {
    const w = emptyWorld();
    const npc = npcAt(w, 'trader', BOWL, 1);
    const stock = goodStock(w.shops.bowl, 'parts');
    const price = getLotTradePrice(w, npc, 'bowl', 'parts', ROAD_KIT_PARTS - 1, 'buy');
    serviceVehicle(w, npc, 'bowl', npcRepairReserve(npc));
    expect(crates(npc)).toBe(ROAD_KIT_PARTS);
    expect(goodStock(w.shops.bowl, 'parts')).toBe(stock - (ROAD_KIT_PARTS - 1));
    expect(RICH - getResources(w, npc).money).toBe(price);
    expect(w.events).toContainEqual({ t: 'shopMoney', vehicle: npc.id, amount: -price, kind: 'cargoBuy' });
  });

  it('buys nothing when it already holds its reserve', () => {
    const w = emptyWorld();
    const npc = npcAt(w, 'trader', BOWL, ROAD_KIT_PARTS);
    serviceVehicle(w, npc, 'bowl', npcRepairReserve(npc));
    expect(crates(npc)).toBe(ROAD_KIT_PARTS);
    expect(getResources(w, npc).money).toBe(RICH);
  });

  it('buys nothing at a stall that does not trade crates', () => {
    const w = emptyWorld();
    const npc = npcAt(w, 'trader', GRANARY, 1);
    serviceAtStall(w, npc, 'granary', npcRepairReserve(npc));
    expect(crates(npc)).toBe(1);
  });

  it('buys nothing while the shop has the crates on order', () => {
    const w = emptyWorld();
    const npc = npcAt(w, 'trader', BOWL, 1);
    w.shops.bowl.contracts.push(procure('parts'));
    serviceVehicle(w, npc, 'bowl', npcRepairReserve(npc));
    expect(crates(npc)).toBe(1);
  });

  it('buys only what the shop has in stock', () => {
    const w = emptyWorld();
    const npc = npcAt(w, 'trader', BOWL, 1);
    w.shops.bowl.goods.parts = 2;
    serviceVehicle(w, npc, 'bowl', npcRepairReserve(npc));
    expect(crates(npc)).toBe(3);
    expect(goodStock(w.shops.bowl, 'parts')).toBe(0);
  });

  it('never spends the money it keeps for fuel and supplies', () => {
    const w = emptyWorld();
    const npc = npcAt(w, 'trader', BOWL, 1);
    getResources(w, npc).money = getUpkeepReserve(npc);
    serviceVehicle(w, npc, 'bowl', npcRepairReserve(npc));
    expect(crates(npc)).toBe(1);
  });

  it('buys crates back when it ends a sale at a market that trades them', () => {
    const w = emptyWorld();
    const npc = npcAt(w, 'trader', BOWL, 0);
    addGoods(w, npc, 'scrap', 2);
    sellAt(w, npc, BOWL);
    expect(goodsCount(npc).scrap).toBeUndefined();
    expect(crates(npc)).toBe(ROAD_KIT_PARTS);
  });

  it('still leaves a sale with a full tank when it buys crates back on little money', () => {
    const w = emptyWorld();
    const npc = npcAt(w, 'trader', BOWL, 0, 'scout');
    addGoods(w, npc, 'salt', 2);
    getResources(w, npc).fuel = Math.floor(0.1 * fuelCap(npc));
    getResources(w, npc).money = 167;
    sellAt(w, npc, BOWL);
    expect(getResources(w, npc).fuel).toBe(Math.floor(fuelCap(npc)));
    expect(getResources(w, npc).money).toBeGreaterThanOrEqual(0);
  });

  it('sells at a camp and buys no crates there', () => {
    const w = emptyWorld();
    const npc = npcAt(w, 'buggy', CAMP, 1);
    npc.faction = 'scrapjaw';
    addGoods(w, npc, 'scrap', 2);
    sellAt(w, npc, CAMP);
    expect(goodsCount(npc).scrap).toBeUndefined();
    expect(crates(npc)).toBe(1);
  });
});
