import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { REGION } from '../data/region';
import { planNpcOrders } from './ai';
import { fuelRoomAt } from './economy';
import { createActivity, pushGoal, topGoal } from './npc-activities';
import { fuelForWay, fuelReserveFor, isLowOnFuel, knowsPump } from './npc-service';
import { npcProfile } from './npc-decisions';
import { getResources } from './resources';
import { sitePads } from './sites';
import { fuelCap } from './stats';
import { addVehicle, emptyWorld, finishBusiness, npcBrain } from './testkit';
import type { Vehicle, World } from './types';

const PIT = REGION.locations.find((l) => l.id === 'green-pit')!;
const FAR = REGION.towns.find((t) => t.id === 'bowl')!;

function courierAtPump(): { w: World; npc: Vehicle } {
  const w = emptyWorld({ x: 50, y: 50 });
  const npc = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { ...sitePads(PIT)[0] });
  npc.brain = npcBrain('courier', npc.pos, ['courier']);
  getResources(w, npc).money = 1000;
  pushGoal(w, npc, createActivity('travel', FAR.id, { ...FAR.pos }, 'tripToSite'));
  return { w, npc };
}

function legReserve(w: World, npc: Vehicle): number {
  return fuelForWay(w, npc, npcProfile(npc), [FAR.pos]);
}

describe('NPC fuel judgment at a pump', () => {
  it('keeps the nearest-pump reserve as the one with no leg', () => {
    const { w, npc } = courierAtPump();
    expect(fuelReserveFor(w, npc)).toBe(fuelForWay(w, npc, npcProfile(npc), []));
  });

  it('is low at a pump when the tank cannot cover the leg ahead', () => {
    const { w, npc } = courierAtPump();
    getResources(w, npc).fuel = legReserve(w, npc) * 0.5;
    expect(isLowOnFuel(w, npc, npcProfile(npc))).toBe(true);
  });

  it('is not low at a pump when the tank covers the leg ahead', () => {
    const { w, npc } = courierAtPump();
    getResources(w, npc).fuel = Math.min(fuelCap(npc), legReserve(w, npc) * 1.2);
    expect(legReserve(w, npc) * 1.2).toBeLessThan(fuelCap(npc));
    expect(isLowOnFuel(w, npc, npcProfile(npc))).toBe(false);
  });

  it('fills the tank at the pump before it drives off on a long leg', () => {
    const { w, npc } = courierAtPump();
    getResources(w, npc).fuel = 1;
    planNpcOrders(w);
    expect(topGoal(npc)).toMatchObject({ kind: 'resupply', targetId: PIT.id, reason: 'lowFuel' });
    finishBusiness(w, npc);
    expect(getResources(w, npc).fuel).toBeGreaterThan(1);
    expect(getResources(w, npc).money).toBeLessThan(1000);
  });

  it('leaves without a service when the tank is full', () => {
    const { w, npc } = courierAtPump();
    getResources(w, npc).fuel = fuelCap(npc);
    expect(fuelRoomAt(w, npc, PIT.id)).toBe(0);
    planNpcOrders(w);
    expect(topGoal(npc)?.kind).toBe('travel');
  });

  it('does not start a second service after the first one filled it', () => {
    const { w, npc } = courierAtPump();
    getResources(w, npc).fuel = 1;
    planNpcOrders(w);
    finishBusiness(w, npc);
    planNpcOrders(w);
    expect(topGoal(npc)?.kind).toBe('travel');
  });

  it('judges a follower by its leader leg', () => {
    const { w, npc: leader } = courierAtPump();
    const follower = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { x: sitePads(PIT)[0].x + 2, y: sitePads(PIT)[0].y });
    follower.brain = npcBrain('courier', follower.pos, ['courier']);
    getResources(w, follower).money = 1000;
    getResources(w, follower).fuel = 1;
    pushGoal(w, follower, createActivity('follow', leader.id, null, 'crewLeader'));
    expect(isLowOnFuel(w, follower, npcProfile(follower))).toBe(true);
  });
});

describe('knowing a pump', () => {
  it('a trader knows its towns and a Sunward hunter, with no town or base, knows none', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const trader = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 40, y: 30 }, 0);
    trader.brain = npcBrain('trader', trader.pos, NPCS.trader.traits);
    const hunter = addVehicle(w, 'sunward', 'buggy', ['stockEngine'], { x: 50, y: 30 }, 0);
    hunter.brain = npcBrain('hunter', hunter.pos, NPCS.hunter.traits);
    expect(knowsPump(npcProfile(trader))).toBe(true);
    expect(knowsPump(npcProfile(hunter))).toBe(false);
  });
});
