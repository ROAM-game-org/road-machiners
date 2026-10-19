import { describe, expect, it } from 'vitest';
import { RULES } from '../data/rules';
import { UNITS } from '../data/units';
import { getUpkeepReserve } from './economy';
import { cashCut, hasRansom, haulValue, ransomOf } from './haul';
import { addGoods, cargoRoom } from './inventory';
import { holdsUp } from './npc-decisions';
import { giveInTo, payOff, yieldTo } from './parley';
import { getResources } from './resources';
import { addState, stateOf } from './states';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import type { Vehicle, World } from './types';

function setup(): { w: World; robber: Vehicle; victim: Vehicle } {
  const w = emptyWorld({ x: 200, y: 200 });
  const robber = addVehicle(w, 'independent', 'wagon', ['mg', 'stockEngine'], { x: 10, y: 10 });
  robber.brain = npcBrain('scavenger', robber.pos, ['scavenger', 'scumbag']);
  const victim = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 14, y: 10 });
  victim.brain = npcBrain('trader', victim.pos, ['trader']);
  victim.resources!.money = 0;
  robber.resources!.money = 0;
  return { w, robber, victim };
}

function fight(w: World, robber: Vehicle, victim: Vehicle): void {
  addState(w, 'combat', robber.id, victim.id, { kind: 'none' });
}

function fillRoom(w: World, v: Vehicle): void {
  while (cargoRoom(v) > 0) addGoods(w, v, 'scrap', 1);
}

const whole = (cents: number) => cents / UNITS.centsPerM;

describe('the hold-up price', () => {
  it('is the haul value when the robber can load cargo', () => {
    const { w, robber, victim } = setup();
    addGoods(w, victim, 'electronics', 2);
    const ransom = ransomOf(w, robber, victim);
    expect(ransom.haul.length).toBeGreaterThan(0);
    expect(ransom.money).toBe(haulValue(ransom.haul));
  });

  it('is a cut of the money above the reserve when the robber cannot load anything', () => {
    const { w, robber, victim } = setup();
    fillRoom(w, robber);
    addGoods(w, victim, 'electronics', 2);
    const reserve = getUpkeepReserve(victim);
    victim.resources!.money = reserve + 400;
    const ransom = ransomOf(w, robber, victim);
    expect(ransom.haul).toEqual([]);
    expect(ransom.money).toBe(Math.floor((400 * RULES.holdUp.cutShare) / UNITS.centsPerM) * UNITS.centsPerM);
  });

  it('is nothing at or under the reserve and in debt', () => {
    const { w, victim } = setup();
    const reserve = getUpkeepReserve(victim);
    victim.resources!.money = reserve;
    expect(cashCut(w, victim)).toBe(0);
    victim.resources!.money = -500;
    expect(cashCut(w, victim)).toBe(0);
  });

  it('is capped and whole M', () => {
    const { w, victim } = setup();
    victim.resources!.money = getUpkeepReserve(victim) + RULES.holdUp.cutCap * 10 + 37;
    expect(cashCut(w, victim)).toBe(RULES.holdUp.cutCap);
    victim.resources!.money = getUpkeepReserve(victim) + 1234;
    expect(cashCut(w, victim) % UNITS.centsPerM).toBe(0);
  });

  it('makes a full robber hold up a rich victim and not a poor one', () => {
    const { w, robber, victim } = setup();
    fillRoom(w, robber);
    addState(w, 'feud', robber.id, victim.id, { kind: 'feud', robbery: true });
    victim.resources!.money = getUpkeepReserve(victim);
    expect(hasRansom(ransomOf(w, robber, victim))).toBe(false);
    expect(holdsUp(w, robber, victim, null)).toBe(false);
    victim.resources!.money = getUpkeepReserve(victim) + 100000;
    expect(holdsUp(w, robber, victim, null)).toBe(true);
  });

  it('draws no random numbers', () => {
    const { w, robber, victim } = setup();
    victim.resources!.money = 100000;
    const before = w.rngState;
    ransomOf(w, robber, victim);
    expect(w.rngState).toEqual(before);
  });
});

describe('settling a hold-up', () => {
  it('payOff moves exactly the price and settles like a dropped haul', () => {
    const { w, robber, victim } = setup();
    victim.resources!.money = 100000;
    fight(w, robber, victim);
    const events = w.events.length;
    payOff(w, victim, robber, 3000);
    const mine = w.events.slice(events);
    expect(mine.filter((e) => e.t === 'transfer')).toEqual([{ t: 'transfer', from: victim.id, to: robber.id, amount: 3000 }]);
    expect(mine.filter((e) => e.t === 'holdUp')).toEqual([{ t: 'holdUp', robber: robber.id, victim: victim.id, paid: 'money', named: 'cut', value: 3000 }]);
    expect(getResources(w, victim).money).toBe(97000);
    expect(getResources(w, robber).money).toBe(3000);
    expect(stateOf(w, 'combat', robber.id, victim.id)).toBeNull();
    expect(stateOf(w, 'truce', robber.id, victim.id)).not.toBeNull();
    expect(victim.brain!.memories.some((m) => m.fact.kind === 'wronged' && m.fact.deed === 'robbed')).toBe(true);
  });

  it('yieldTo raises one cargo holdUp and no transfer', () => {
    const { w, robber, victim } = setup();
    addGoods(w, victim, 'electronics', 1);
    fight(w, robber, victim);
    const events = w.events.length;
    yieldTo(w, victim, robber);
    const mine = w.events.slice(events);
    expect(mine.filter((e) => e.t === 'holdUp')).toHaveLength(1);
    expect(mine.filter((e) => e.t === 'holdUp')[0]).toMatchObject({ paid: 'cargo' });
    expect(mine.some((e) => e.t === 'transfer')).toBe(false);
    expect(stateOf(w, 'combat', robber.id, victim.id)).toBeNull();
  });

  it('payOff refuses an empty price', () => {
    const { w, robber, victim } = setup();
    expect(() => payOff(w, victim, robber, 0)).toThrow();
  });

  it('an NPC victim pays when its money above the reserve covers the haul, and drops it otherwise', () => {
    const rich = setup();
    addGoods(rich.w, rich.victim, 'electronics', 1);
    const price = ransomOf(rich.w, rich.robber, rich.victim).money;
    rich.victim.resources!.money = getUpkeepReserve(rich.victim) + price;
    giveInTo(rich.w, rich.victim, rich.robber, ransomOf(rich.w, rich.robber, rich.victim));
    expect(getResources(rich.w, rich.robber).money).toBe(price);
    expect(rich.victim.items.some((i) => i.kind === 'good')).toBe(true);

    const poor = setup();
    addGoods(poor.w, poor.victim, 'electronics', 1);
    poor.victim.resources!.money = getUpkeepReserve(poor.victim) + price - 1;
    const before = getResources(poor.w, poor.victim).money;
    giveInTo(poor.w, poor.victim, poor.robber, ransomOf(poor.w, poor.robber, poor.victim));
    expect(getResources(poor.w, poor.victim).money).toBe(before);
    expect(poor.victim.items.some((i) => i.kind === 'good')).toBe(false);
  });

  it('an NPC victim pays a cash-only cut and keeps its reserve', () => {
    const { w, robber, victim } = setup();
    fillRoom(w, robber);
    victim.resources!.money = getUpkeepReserve(victim) + 100000;
    const ransom = ransomOf(w, robber, victim);
    giveInTo(w, victim, robber, ransom);
    expect(getResources(w, victim).money).toBeGreaterThanOrEqual(getUpkeepReserve(victim));
    expect(whole(getResources(w, robber).money)).toBe(whole(ransom.money));
  });
});
