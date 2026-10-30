import { describe, expect, it } from 'vitest';
import { HOLLOW, SUNWARD } from '../data/sunward';
import { getResources } from './resources';
import { fuelCap } from './stats';
import { shelteredAt, isSheltered } from './sites';
import { topGoal } from './npc-activities';
import { playerVehicle } from './damage';
import { spawnNpcs } from './spawn';
import { advanceSunward, collapseOrder, dawnAfter, duskTurn, gateOrder, huntTonight, isCavalcadeCar, isHunterCar, membersOf, planSunward, rideOutTurn, sunwardFacts } from './sunward';
import type { Vehicle, World } from './types';
import { letOut, orderWorld, riderAt } from '../test/sunward-kit';

describe('resting inside the Hollow', () => {
  function comesHome(w: World): Vehicle {
    const car = letOut(w, membersOf(w).find(isCavalcadeCar)!.id);
    w.events = [];
    planSunward(w, car);
    return car;
  }

  function drainGate(w: World): string[] {
    const out: string[] = [];
    for (let i = 0; i < 40 && out.length < SUNWARD.cavalcade + SUNWARD.hunters; i++) {
      w.events = [];
      advanceSunward(w);
      for (const e of w.events) if (e.t === 'leftSite') out.push(e.vehicle);
      for (const v of w.vehicles) if (v !== playerVehicle(w)) v.pos = { x: HOLLOW.pos.x + 200, y: HOLLOW.pos.y + 200 };
    }
    return out;
  }

  it('takes in a car that waits on the pad by day, refitted and with full tanks', () => {
    const w = orderWorld(5);
    w.turn = dawnAfter(duskTurn(1)) + 10;
    const car = comesHome(w);
    car.defeat = { phase: 'retreat', turns: 0, unseen: 0, foes: [], gaveUp: false };
    getResources(w, car).fuel = 0;
    expect(topGoal(car)?.reason).toBe('restHollow');

    advanceSunward(w);

    expect(isSheltered(w, car.id)).toBe(true);
    const inside = riderAt(w, car.id);
    expect(inside.defeat).toBeFalsy();
    expect(getResources(w, inside).fuel).toBe(fuelCap(inside));
    expect(w.events).toContainEqual({ t: 'enteredSite', vehicle: car.id, site: HOLLOW.id });
  });

  it('keeps out a knocked-out car and a car not on the pad', () => {
    const w = orderWorld(5);
    w.turn = dawnAfter(duskTurn(1)) + 10;
    const out = comesHome(w);
    out.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: false };
    advanceSunward(w);
    expect(isSheltered(w, out.id)).toBe(false);

    const away = comesHome(w);
    away.pos = { x: HOLLOW.pos.x + 60, y: HOLLOW.pos.y };
    advanceSunward(w);
    expect(isSheltered(w, away.id)).toBe(false);
  });

  it('spawns no refill while the whole order rests inside', () => {
    const w = orderWorld(5);
    w.turn = dawnAfter(duskTurn(1)) + 10;
    const before = membersOf(w).map((v) => v.id).sort();
    for (let i = 0; i < 200; i++) {
      w.turn++;
      spawnNpcs(w);
    }
    expect(membersOf(w).map((v) => v.id).sort()).toEqual(before);
  });

  it('lets nobody out by day', () => {
    const w = orderWorld(5);
    w.turn = dawnAfter(duskTurn(1)) + 10;
    expect(drainGate(w)).toEqual([]);
  });

  it('lets the riders out in gate order, then the hunting party, one at a time once the gate is clear', () => {
    const w = orderWorld(5);
    const day = Array.from({ length: 200 }, (_, i) => i + 1).find((d) => huntTonight(w, d))!;
    w.turn = rideOutTurn(duskTurn(day));
    advanceSunward(w);
    const night = sunwardFacts(w).night!;
    const first = w.events.filter((e) => e.t === 'leftSite').map((e) => (e.t === 'leftSite' ? e.vehicle : ''));
    expect(first).toEqual([gateOrder(w, night)[0]]);
    w.events = [];
    advanceSunward(w);
    expect(w.events.some((e) => e.t === 'leftSite')).toBe(false);

    const rest = drainGate(w);

    expect([...first, ...rest]).toEqual([...gateOrder(w, night), ...night.hunt!.party]);
    expect(shelteredAt(w, HOLLOW.id)).toEqual([]);
  });

  it('keeps the hunters inside on a night without a hunt', () => {
    const w = orderWorld(5);
    const day = Array.from({ length: 200 }, (_, i) => i + 1).find((d) => !huntTonight(w, d))!;
    w.turn = rideOutTurn(duskTurn(day));

    const out = drainGate(w);

    expect(out).toEqual(gateOrder(w, sunwardFacts(w).night!));
    expect(shelteredAt(w, HOLLOW.id).every(isHunterCar)).toBe(true);
  });

  it('empties the Hollow one roamer per turn once the order falls', () => {
    const w = orderWorld(5);
    w.turn = duskTurn(1) + 70;
    advanceSunward(w);
    const night = sunwardFacts(w).night!;
    night.beaten = night.roster.slice(0, SUNWARD.collapseAt);
    collapseOrder(w);
    const inside = shelteredAt(w, HOLLOW.id).length;

    const out = drainGate(w);

    expect(out).toHaveLength(inside);
    expect(shelteredAt(w, HOLLOW.id)).toEqual([]);
    for (const id of out) expect(riderAt(w, id).faction).toBe('independent');
  });
});


