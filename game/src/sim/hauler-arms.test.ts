import { describe, expect, it } from 'vitest';
import { HIGHWAY } from '../data/modes';
import { NPC_UTILITY } from '../data/npc-behavior';
import { TIME } from '../data/time';
import { walkLane } from './armor';
import { assignAutoOrders } from './combat';
import { haulerOf, playerVehicle } from './damage';
import { makePart, newId } from './factory';
import { gridOf, itemCells, mountSpots, type Cell } from './grid';
import { planHaulerOrder } from './hauler';
import { roadHeading, roadPoint } from './highway';
import { mountPart } from './inventory';
import { fightGoal } from './npc-activities';
import { assignUtilityOrders } from './npc-utility';
import { frontAhead } from './rig';
import { endState } from './states';
import { sunAt } from './sun';
import { addVehicle, chaosHighwayWorld, npcBrain, practiceOf, startCombat } from './testkit';
import type { GridItem, PartInstance, Vehicle, World } from './types';

type PartItem = Extract<GridItem, { kind: 'part' }>;
import { endTurn } from './world';

const LANES = HIGHWAY.road.lanes;
const HOOD_ROWS = 7;
const N = 140;
const NIGHT = Array.from({ length: TIME.turnsPerDay }, (_, i) => i + 1).find((t) => !sunAt(t))!;
const DAY = Array.from({ length: TIME.turnsPerDay }, (_, i) => i + 1).find((t) => sunAt(t))!;

function openRoad(): { w: World; hauler: Vehicle } {
  const w = chaosHighwayWorld(3);
  w.chaosHighway!.groups = [];
  w.obstacles = [];
  w.turn = DAY;
  const hauler = haulerOf(w);
  hauler.pos = roadPoint(w.seed, 0, N + frontAhead(hauler.chassisId), LANES[1]);
  hauler.heading = roadHeading(w.seed, N);
  playerVehicle(w).pos = roadPoint(w.seed, 0, N - 40, LANES[3]);
  return { w, hauler };
}

function arm(w: World, v: Vehicle, defId: string): PartInstance {
  const part = makePart(w, defId, 0);
  if (!mountPart(w, v, part)) throw new Error(`${defId} found no spot on ${v.chassisId}`);
  return part;
}

function placed(w: World, v: Vehicle, defId: string, on: Cell[], wanted: (cells: { x: number; y: number }[]) => boolean): PartItem {
  const probe: PartItem = { id: newId(w, 'i'), x: 0, y: 0, rot: 0, kind: 'part', part: makePart(w, defId, 0) };
  const spot = mountSpots(gridOf(v), v.items, probe, on).find((at) => wanted(itemCells({ ...probe, ...at })));
  if (!spot) throw new Error(`${v.chassisId} has no wanted ${on.join('')} spot for ${defId}`);
  const item = { ...probe, ...spot };
  v.items.push(item);
  return item;
}

function groupTruckAt(w: World, along: number, across: number): Vehicle {
  const v = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], roadPoint(w.seed, 0, along, across), roadHeading(w.seed, along));
  v.brain = npcBrain('buggy', v.pos, ['raider']);
  v.brain.goals = [fightGoal(w, v, haulerOf(w), 'idle')];
  w.chaosHighway!.groups = [{ id: 'g1-0', stretch: 1, from: 'ahead', at: 0, templates: [], money: 10000, elites: 0, level: 'light', spawned: true, vehicles: [v.id], wrecked: 0, counted: [], retryUntil: null }];
  return v;
}

function attackedFromAhead(): { w: World; hauler: Vehicle; foe: Vehicle } {
  const { w, hauler } = openRoad();
  const foe = groupTruckAt(w, N + frontAhead(hauler.chassisId) + 8, LANES[1]);
  startCombat(w, foe, hauler);
  return { w, hauler, foe };
}

function chasedFromBehind(gap: number): { w: World; hauler: Vehicle; foe: Vehicle } {
  const { w, hauler } = openRoad();
  const foe = groupTruckAt(w, N - gap, LANES[1]);
  startCombat(w, foe, hauler);
  return { w, hauler, foe };
}

describe('guns on the hauler', () => {
  it('fire at a hostile in range with auto-fire off, while the gun truck gives no order', () => {
    const { w, hauler, foe } = attackedFromAhead();
    const gun = arm(w, hauler, 'mg');
    const gunTruck = playerVehicle(w);
    arm(w, gunTruck, 'mg');
    gunTruck.pos = roadPoint(w.seed, 0, N + frontAhead(hauler.chassisId) + 4, LANES[2]);
    w.player.autoFire = false;

    assignAutoOrders(w);

    expect(hauler.weaponOrders[gun.id]).toMatchObject({ targetId: foe.id });
    expect(gunTruck.weaponOrders).toEqual({});
  });

  it('land a shot on the hostile over real turns and award the player no hit practice', () => {
    const { w: start, hauler } = attackedFromAhead();
    arm(start, hauler, 'mg');
    start.player.autoFire = false;
    let w = start;
    const shots: string[] = [];
    for (let turn = 0; turn < 3; turn++) {
      w = endTurn(w, () => {});
      shots.push(...w.events.flatMap((e) => (e.t === 'shot' && e.shooter === hauler.id ? [e.target] : [])));
      expect(practiceOf(w, 'hit')).toEqual([]);
    }
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((target) => target !== playerVehicle(w).id)).toBe(true);
  });

  it('never aim at the gun truck, even with it in range and no hostile about', () => {
    const { w, hauler } = openRoad();
    const gun = arm(w, hauler, 'mg');
    playerVehicle(w).pos = roadPoint(w.seed, 0, N + frontAhead(hauler.chassisId) + 6, LANES[1]);

    assignAutoOrders(w);

    expect(hauler.weaponOrders[gun.id]).toBeUndefined();
  });
});

describe('the hauler driver with guns aboard', () => {
  it('plans the same order as without them, with a hostile in reach', () => {
    const bare = attackedFromAhead();
    const armed = attackedFromAhead();
    arm(armed.w, armed.hauler, 'mg');
    arm(armed.w, armed.hauler, 'sprout');

    planHaulerOrder(bare.w);
    planHaulerOrder(armed.w);

    expect(armed.hauler.order).toEqual(bare.hauler.order);
  });
});

describe('utilities on the hauler', () => {
  it('smoke up in a fight with an attacker in sight', () => {
    const { w, hauler } = attackedFromAhead();
    const sprout = arm(w, hauler, 'sprout');

    assignUtilityOrders(w);

    expect(hauler.utilityOrders[sprout.id]).toEqual({ kind: 'self' });
  });

  it('stay quiet out of a fight', () => {
    const { w, hauler } = openRoad();
    groupTruckAt(w, N - 4, LANES[1]);
    const sprout = arm(w, hauler, 'sprout');
    const caltrops = arm(w, hauler, 'caltrops');

    assignUtilityOrders(w);

    expect(hauler.utilityOrders[sprout.id]).toBeUndefined();
    expect(hauler.utilityOrders[caltrops.id]).toBeUndefined();
  });

  it.each(['caltrops', 'oilSpiller'])('drop %s on a chaser close behind', (defId) => {
    const { w, hauler } = chasedFromBehind(4);
    const part = arm(w, hauler, defId);

    assignUtilityOrders(w);

    expect(hauler.utilityOrders[part.id]).toEqual({ kind: 'self' });
  });

  it.each(['caltrops', 'oilSpiller'])('hold %s while the gun truck is behind the hauler within drop reach', (defId) => {
    const { w, hauler } = chasedFromBehind(4);
    const part = arm(w, hauler, defId);
    playerVehicle(w).pos = roadPoint(w.seed, 0, N - NPC_UTILITY.dropReach / 2, LANES[2]);

    assignUtilityOrders(w);

    expect(hauler.utilityOrders[part.id]).toBeUndefined();
  });

  it('arms the claymore in a fight and disarms it once the fight is over', () => {
    const { w, hauler } = attackedFromAhead();
    const claymore = arm(w, hauler, 'claymoreRam');

    assignUtilityOrders(w);
    expect(hauler.utilityOrders[claymore.id]).toEqual({ kind: 'self' });

    delete hauler.utilityOrders[claymore.id];
    claymore.charge = { reload: 0, armed: true };
    for (const state of w.states.filter((s) => s.kind === 'combat')) endState(w, state, 'expired');
    assignUtilityOrders(w);
    expect(hauler.utilityOrders[claymore.id]).toEqual({ kind: 'disarm' });
  });

  it('light a flare on the nearest attacker at night, and none by day', () => {
    const night = attackedFromAhead();
    night.w.turn = NIGHT;
    const flare = arm(night.w, night.hauler, 'flareCannon');
    const day = attackedFromAhead();
    const dayFlare = arm(day.w, day.hauler, 'flareCannon');

    assignUtilityOrders(night.w);
    assignUtilityOrders(day.w);

    expect(night.hauler.utilityOrders[flare.id]).toEqual({ kind: 'point', pos: night.foe.pos });
    expect(day.hauler.utilityOrders[dayFlare.id]).toBeUndefined();
  });
});

describe('armor on the hauler', () => {
  it('takes a front hit before the gun on the hood behind it', () => {
    const { w, hauler } = openRoad();
    const gun = placed(w, hauler, 'mg', ['D'], (cells) => cells.every((c) => c.y < HOOD_ROWS));
    const gunColumns = new Set(itemCells(gun).map((c) => c.x));
    const plate = placed(w, hauler, 'plates', ['F'], (cells) => cells.some((c) => gunColumns.has(c.x)));
    const lane = itemCells(plate).map((c) => c.x).find((x) => gunColumns.has(x))!;

    const walked = walkLane(w, hauler, 'front', lane, { damage: 1, pen: 99, blast: false, armorShare: 1 }).map((s) => s.part);

    expect(walked[0]).toBe(plate.part.id);
    expect(walked).toContain(gun.part.id);
  });
});
