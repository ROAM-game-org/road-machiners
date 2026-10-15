import { describe, expect, it } from 'vitest';
import { FURY_ROAD, HIGHWAY } from '../data/modes';
import { RULES } from '../data/rules';
import { haulerOf, playerVehicle } from './damage';
import { betweenLevels, outpostPad } from './fury-road';
import { chosenLane, haulerLane, haulerPace, laneClear, noteHaulerHits, planHaulerOrder, resetHaulerWatch, sideThreat, watchHaulerStall } from './hauler';
import { acrossOf, alongOf, milestoneAt, roadHeading, roadPoint, toRoad } from './highway';
import { addVehicle, furyRoadWorld } from './testkit';
import type { Vehicle, World } from './types';
import { dist } from './vec';

const LANES = HIGHWAY.road.lanes;
const N = 150;

function openRoad(seed = 3): { w: World; hauler: Vehicle } {
  const w = furyRoadWorld(seed);
  w.furyRoad!.groups = [];
  w.obstacles = [];
  const hauler = haulerOf(w);
  hauler.pos = roadPoint(seed, 0, N, LANES[1]);
  hauler.heading = roadHeading(seed, N);
  playerVehicle(w).pos = roadPoint(seed, 0, N - 40, LANES[3]);
  return { w, hauler };
}

function groupTruck(w: World, across: number, along: number, speed: number, heading?: number): Vehicle {
  const v = addVehicle(w, 'raiders', 'buggy', ['mg', 'stockEngine'], roadPoint(w.seed, 0, along, across), heading ?? roadHeading(w.seed, along));
  v.speed = speed;
  w.furyRoad!.groups = [{ id: 'g1-0', stretch: 1, from: 'ahead', at: 0, templates: [], money: 10000, elite: false, level: 'light', spawned: true, vehicles: [v.id], wrecked: 0, counted: [], retryUntil: null }];
  return v;
}

function across(w: World, v: Vehicle): number {
  return acrossOf(w.seed, toRoad(0, v.pos));
}

describe('the hauler driver', () => {
  it('holds its lane on open road at cruise pace, aiming at a lane center ahead', () => {
    const { w, hauler } = openRoad();
    planHaulerOrder(w);

    expect(haulerLane(w, hauler)).toBe(1);
    expect(hauler.order).toMatchObject({ kind: 'through', pace: FURY_ROAD.hauler.cruise });
    const dest = (hauler.order as { dest: { x: number; y: number } }).dest;
    expect(acrossOf(w.seed, toRoad(0, dest))).toBeCloseTo(LANES[1], 1);
    expect(alongOf(w.seed, toRoad(0, dest))).toBeCloseTo(N + FURY_ROAD.hauler.lookahead, 0);
    expect(hauler.direct).toBe(false);
  });

  it('is deterministic: the same world gives the same order', () => {
    const a = openRoad();
    const b = openRoad();
    planHaulerOrder(a.w);
    planHaulerOrder(b.w);
    expect(a.hauler.order).toEqual(b.hauler.order);
  });

  it('moves one lane away from a closing flank truck and holds with trucks on both sides', () => {
    const { w, hauler } = openRoad();
    const left = groupTruck(w, LANES[0], N + 1, 5);
    left.heading = Math.atan2(hauler.pos.y - left.pos.y, hauler.pos.x - left.pos.x);
    expect(sideThreat(w, hauler)).toBe('left');
    expect(chosenLane(w, hauler)).toBe(2);

    const right = addVehicle(w, 'raiders', 'buggy', ['mg', 'stockEngine'], roadPoint(w.seed, 0, N + 1, LANES[2] + 1.5), 0);
    right.speed = 5;
    right.heading = Math.atan2(hauler.pos.y - right.pos.y, hauler.pos.x - right.pos.x);
    w.furyRoad!.groups[0].vehicles.push(right.id);
    expect(sideThreat(w, hauler)).toBe('both');
    expect(chosenLane(w, hauler)).toBe(1);
  });

  it('ignores a truck that is beside it but driving away', () => {
    const { w, hauler } = openRoad();
    const left = groupTruck(w, LANES[0], N + 1, 5);
    left.heading = Math.atan2(left.pos.y - hauler.pos.y, left.pos.x - hauler.pos.x);
    expect(sideThreat(w, hauler)).toBeNull();
  });

  it('changes lane before a truck parked in its lane, toward the road middle on a tie', () => {
    const { w, hauler } = openRoad();
    groupTruck(w, LANES[1], N + 6, 0);
    expect(laneClear(w, hauler, 1)).toBe(false);
    expect(laneClear(w, hauler, 2)).toBe(true);
    expect(chosenLane(w, hauler)).toBe(2);
  });

  it('leaves a lane that runs into a crater dip early enough to change lanes, and ignores a crater beyond that', () => {
    const { w, hauler } = openRoad(4);
    playerVehicle(w).pos = roadPoint(4, 0, 0, LANES[3]);
    const at = (along: number, lane: number) => {
      hauler.pos = roadPoint(4, 0, along, LANES[lane]);
      hauler.heading = roadHeading(4, along);
    };
    const spots = [60, 80, 100, 120, 140, 160, 180].flatMap((along) => LANES.map((_, lane) => ({ along, lane })));
    const dip = spots.find(({ along, lane }) => {
      at(along, lane);
      return !laneClear(w, hauler, lane) && LANES.some((_, other) => laneClear(w, hauler, other));
    });
    if (!dip) throw new Error('seed 4 has no crater dip on its first stretch');
    at(dip.along, dip.lane);
    const lane = chosenLane(w, hauler);
    expect(lane).not.toBe(dip.lane);
    expect(laneClear(w, hauler, lane)).toBe(true);

    at(dip.along - FURY_ROAD.hauler.laneLook - 20, dip.lane);
    expect(laneClear(w, hauler, dip.lane)).toBe(true);
    expect(chosenLane(w, hauler)).toBe(dip.lane);
  });

  it('keeps its lane when every lane is blocked, for the router to thread the gap', () => {
    const { w, hauler } = openRoad();
    const trucks = LANES.map((lane) => addVehicle(w, 'raiders', 'buggy', ['mg', 'stockEngine'], roadPoint(w.seed, 0, N + 6, lane), 0));
    w.furyRoad!.groups = [{ id: 'g1-0', stretch: 1, from: 'ahead', at: 0, templates: [], money: 10000, elite: false, level: 'light', spawned: true, vehicles: trucks.map((t) => t.id), wrecked: 0, counted: [], retryUntil: null }];
    expect(chosenLane(w, hauler)).toBe(1);
  });

  it('aims just past a blockage that covers every lane and holds that aim as it closes in', () => {
    const { w, hauler } = openRoad();
    const wall = (along: number) => [-5, -3, -1, 1, 3, 5].map((across, i) => ({ id: `wall-${along}-${i}`, pos: roadPoint(w.seed, 0, along, across), r: 1, kind: 'rock' as const }));
    w.obstacles = [...wall(N + 8), ...wall(N + 20)];
    const aim = () => {
      planHaulerOrder(w);
      return alongOf(w.seed, toRoad(0, (hauler.order as { dest: { x: number; y: number } }).dest));
    };

    expect(LANES.every((_, lane) => !laneClear(w, hauler, lane))).toBe(true);
    const first = aim();
    expect(first).toBeGreaterThan(N + 20);
    expect(first).toBeLessThan(N + FURY_ROAD.hauler.laneLook);

    hauler.pos = roadPoint(w.seed, 0, N + 2.4, LANES[1]);
    expect(aim()).toBe(first);
  });

  it('runs at hurry pace for the alarm turns after a hit, then back at cruise', () => {
    const { w, hauler } = openRoad();
    const attacker = groupTruck(w, LANES[3], N + 8, 5);
    const part = hauler.items.find((it) => it.kind === 'part')!;
    w.events.push({ t: 'shot', shooter: attacker.id, weapon: 'w', target: hauler.id, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [{ hit: true, crit: false, offset: 0, struck: null, hits: [{ part: part.kind === 'part' ? part.part.id : '', damage: 5 }], blast: [], burst: null }] });
    noteHaulerHits(w);

    const alarm = w.furyRoad!.hauler.alarmUntil!;
    expect(alarm).toBe(w.turn + FURY_ROAD.hauler.alarmTurns);
    expect(haulerPace(w)).toBe(FURY_ROAD.hauler.hurry);
    w.turn = alarm;
    expect(haulerPace(w)).toBe(FURY_ROAD.hauler.hurry);
    w.turn = alarm + 1;
    expect(haulerPace(w)).toBe(FURY_ROAD.hauler.cruise);
  });

  it('never runs faster under fire than it cruises, so a fight cannot be outrun', () => {
    expect(FURY_ROAD.hauler.hurry).toBeLessThanOrEqual(FURY_ROAD.hauler.cruise);
  });

  it('is not alarmed by a shot that does no damage', () => {
    const { w, hauler } = openRoad();
    const attacker = groupTruck(w, LANES[3], N + 8, 5);
    w.events.push({ t: 'shot', shooter: attacker.id, weapon: 'w', target: hauler.id, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [{ hit: false, crit: false, offset: 0, struck: null, hits: [], blast: [], burst: null }] });
    noteHaulerHits(w);
    expect(w.furyRoad!.hauler.alarmUntil).toBeNull();
  });

  it('stops at the pad within the approach and never aims off the lanes before that', () => {
    const { w, hauler } = openRoad();
    const pad = outpostPad(w, 1);
    hauler.pos = roadPoint(w.seed, 0, milestoneAt(1) - 10, LANES[1]);
    expect(dist(hauler.pos, pad)).toBeLessThanOrEqual(FURY_ROAD.hauler.approach);
    planHaulerOrder(w);
    expect(hauler.order).toEqual({ kind: 'stopAt', dest: pad });
  });

  it('backs out when a drive order left it in place, keeps backing while it moves, then drives on', () => {
    const { w, hauler } = openRoad();
    planHaulerOrder(w);
    const drive = hauler.order;
    hauler.trail = [{ ...hauler.pos, heading: hauler.heading }, { ...hauler.pos, heading: hauler.heading }];
    planHaulerOrder(w);
    expect(hauler.order?.kind).toBe('stopAt');
    const spot = (hauler.order as { dest: { x: number; y: number } }).dest;
    expect(dist(spot, hauler.pos)).toBeCloseTo(RULES.reverse.distance + RULES.minAimDistance, 5);
    expect(alongOf(w.seed, toRoad(0, spot))).toBeLessThan(alongOf(w.seed, toRoad(0, hauler.pos)));

    hauler.trail = [{ ...hauler.pos, heading: hauler.heading }, { x: hauler.pos.x, y: hauler.pos.y + 1, heading: hauler.heading }];
    planHaulerOrder(w);
    expect(hauler.order).toEqual({ kind: 'stopAt', dest: spot });

    hauler.order = null;
    planHaulerOrder(w);
    expect(hauler.order).toEqual(drive);
  });

  it('does not back out after a turn parked or braking, only after a drive order that went nowhere', () => {
    const { w, hauler } = openRoad();
    hauler.trail = [{ ...hauler.pos, heading: hauler.heading }, { ...hauler.pos, heading: hauler.heading }];
    hauler.order = { kind: 'brake' };
    planHaulerOrder(w);
    expect(hauler.order?.kind).toBe('through');
  });

  it('parks between levels, braking only while it still rolls', () => {
    const { w, hauler } = openRoad();
    w.furyRoad!.waitingAt = 1;
    expect(betweenLevels(w)).toBe(true);
    hauler.speed = 3;
    planHaulerOrder(w);
    expect(hauler.order).toEqual({ kind: 'brake' });
    hauler.speed = 0;
    planHaulerOrder(w);
    expect(hauler.order).toBeNull();
  });

  it('raises a stall when it makes less than a tile of progress for the stall turns', () => {
    resetHaulerWatch();
    const { w, hauler } = openRoad();
    hauler.speed = 0;
    const stalls = [];
    for (let i = 0; i <= FURY_ROAD.hauler.stallTurns + 1; i++) {
      w.turn++;
      w.events = [];
      watchHaulerStall(w);
      stalls.push(...w.events.filter((e) => e.t === 'stall'));
    }
    expect(stalls).toEqual([{ t: 'stall', vehicle: hauler.id, goal: null, reason: 'idle' }]);
  });

  it('raises no stall while it progresses, is parked at an outpost, or is stranded', () => {
    resetHaulerWatch();
    const { w, hauler } = openRoad();
    const events = () => w.events.filter((e) => e.t === 'stall');
    for (let i = 0; i < FURY_ROAD.hauler.stallTurns * 3; i++) {
      w.turn++;
      w.events = [];
      hauler.pos = roadPoint(w.seed, 0, N + i * 2, LANES[1]);
      watchHaulerStall(w);
      expect(events()).toEqual([]);
    }
    resetHaulerWatch();
    w.furyRoad!.waitingAt = 1;
    hauler.speed = 0;
    for (let i = 0; i < FURY_ROAD.hauler.stallTurns * 3; i++) {
      w.turn++;
      w.events = [];
      watchHaulerStall(w);
      expect(events()).toEqual([]);
    }
    expect(RULES.parkedSpeed).toBeGreaterThan(0);
  });
});
