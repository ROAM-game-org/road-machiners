import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { REGION } from '../data/region';
import { ECONOMY } from '../data/goods';
import { getUpkeepReserve, sellAtCamp, serviceVehicle, supplyCharge, transfer } from './economy';
import { affordableUnits } from './money';
import { makePart } from './factory';
import { mountedParts } from './grid';
import { fuelCap, suppliesCap } from './stats';
import { maxHp, partValue } from './wear';
import { addGoods, stowPart } from './inventory';
import { getResources } from './resources';
import { siteGates, sitePads } from './sites';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import type { GameEvent, PartInstance, ShopMoneyKind, Vehicle, World } from './types';

const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
const kiln = REGION.locations.find((l) => l.id === 'kiln')!;

type ShopMoneyEvent = Extract<GameEvent, { t: 'shopMoney' }>;

function shopMoneyOf(w: World, vehicle: Vehicle): ShopMoneyEvent[] {
  return w.events.filter((e): e is ShopMoneyEvent => e.t === 'shopMoney' && e.vehicle === vehicle.id);
}

function totalsByKind(events: readonly ShopMoneyEvent[]): Partial<Record<ShopMoneyKind, number>> {
  const totals: Partial<Record<ShopMoneyKind, number>> = {};
  for (const e of events) totals[e.kind] = (totals[e.kind] ?? 0) + e.amount;
  return totals;
}

function traderInBowl(parts: string[] = ['stockEngine']): { w: World; npc: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  const npc = addVehicle(w, 'independent', 'hauler', parts, { ...sitePads(bowl)[0] });
  npc.brain = npcBrain('trader', npc.pos, NPCS.trader.traits);
  w.events = [];
  return { w, npc };
}

describe('shop money', () => {
  it('names every money change of an NPC service in town by its kind', () => {
    const { w, npc } = traderInBowl();
    const resources = getResources(w, npc);
    resources.money = 500_000;
    resources.fuel = 1;
    resources.supplies = 1;
    addGoods(w, npc, 'scrap', 2);
    stowPart(w, npc, makePart(w, 'mg', 0));
    mountedParts(npc, 'engine')[0].hp = 1;
    const before = resources.money;

    serviceVehicle(w, npc, 'bowl', 0);

    const events = shopMoneyOf(w, npc);
    const kinds = totalsByKind(events);
    expect(Object.keys(kinds).sort()).toEqual(['cargoSale', 'fuel', 'partSale', 'repair', 'supplies']);
    expect(kinds.cargoSale).toBeGreaterThan(0);
    expect(kinds.partSale).toBeGreaterThan(0);
    expect(kinds.fuel).toBeLessThan(0);
    expect(kinds.supplies).toBeLessThan(0);
    expect(kinds.repair).toBeLessThan(0);
    expect(events.reduce((sum, e) => sum + e.amount, 0)).toBe(resources.money - before);
  });

  it('names a raider camp sale', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const raider = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { ...sitePads(kiln)[0] });
    raider.brain = npcBrain('buggy', raider.pos, NPCS.buggy.traits);
    addGoods(w, raider, 'salt', 2);
    const before = getResources(w, raider).money;

    sellAtCamp(w, raider, 'kiln', 0);

    const events = shopMoneyOf(w, raider);
    expect(events.map((e) => e.kind)).toEqual(['campSale']);
    expect(events[0].amount).toBe(getResources(w, raider).money - before);
  });

  it('names a payment between two trucks', () => {
    const { w, npc } = traderInBowl();
    const other = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { ...sitePads(bowl)[1] });
    other.brain = npcBrain('trader', other.pos, NPCS.trader.traits);

    transfer(w, npc, other, 12);

    expect(w.events).toContainEqual({ t: 'transfer', from: npc.id, to: other.id, amount: 12 });
  });
});

function repairUnitCost(part: PartInstance): number {
  return (ECONOMY.repairShare * partValue(part)) / maxHp(part);
}

function fullTanks(w: World, npc: Vehicle): void {
  const resources = getResources(w, npc);
  resources.fuel = fuelCap(npc);
  resources.supplies = suppliesCap(npc);
}

describe('NPC service spending', () => {
  it('buys supplies before fuel when the money cannot fill both', () => {
    const { w, npc } = traderInBowl();
    const resources = getResources(w, npc);
    resources.money = 20;
    resources.supplies = 0;
    resources.fuel = 1;
    const supplies = Math.min(Math.floor(suppliesCap(npc)), affordableUnits(20, ECONOMY.supplyPrice.supplies));

    serviceVehicle(w, npc, 'bowl', 0);

    expect(resources.supplies).toBe(supplies);
    expect(resources.fuel).toBe(1 + Math.floor((20 - supplyCharge('supplies', supplies)) / ECONOMY.supplyPrice.fuel));
    expect(shopMoneyOf(w, npc).map((e) => e.kind)).toEqual(['supplies', 'fuel']);
  });

  it('repairs the engine even into its upkeep reserve, and then no armor', () => {
    const { w, npc } = traderInBowl(['stockEngine', 'plates']);
    fullTanks(w, npc);
    const engine = mountedParts(npc, 'engine')[0];
    const plates = mountedParts(npc, 'armor')[0];
    engine.hp = 1;
    plates.hp = 1;
    const engineCost = Math.ceil((maxHp(engine) - 1) * repairUnitCost(engine));
    const resources = getResources(w, npc);
    resources.money = getUpkeepReserve(npc) + engineCost - 1;

    serviceVehicle(w, npc, 'bowl', 0);

    expect(engine.hp).toBe(maxHp(engine));
    expect(plates.hp).toBe(1);
    expect(resources.money).toBe(getUpkeepReserve(npc) - 1);
  });

  it('repairs armor with the money above the reserve and never dips under it', () => {
    const { w, npc } = traderInBowl(['stockEngine', 'plates']);
    fullTanks(w, npc);
    const plates = mountedParts(npc, 'armor')[0];
    plates.hp = 1;
    const unit = repairUnitCost(plates);
    const resources = getResources(w, npc);
    resources.money = getUpkeepReserve(npc) + Math.ceil(3 * unit);

    serviceVehicle(w, npc, 'bowl', 0);

    expect(plates.hp).toBe(4);
    expect(resources.money).toBe(getUpkeepReserve(npc));
  });

  it('repairs no armor when its money is under the reserve', () => {
    const { w, npc } = traderInBowl(['stockEngine', 'plates']);
    fullTanks(w, npc);
    const plates = mountedParts(npc, 'armor')[0];
    plates.hp = 1;
    const resources = getResources(w, npc);
    resources.money = getUpkeepReserve(npc) - 1;

    serviceVehicle(w, npc, 'bowl', 0);

    expect(plates.hp).toBe(1);
    expect(resources.money).toBe(getUpkeepReserve(npc) - 1);
  });
});
