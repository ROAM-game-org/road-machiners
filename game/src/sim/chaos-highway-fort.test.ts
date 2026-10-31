import { describe, expect, it } from 'vitest';
import { CHAOS_HIGHWAY } from '../data/modes';
import { planNpcOrders } from './ai';
import { haulerOf, playerVehicle } from './damage';
import { advanceChaosHighway, spawnGroup, waveOf } from './chaos-highway';
import { acrossOf, alongOf, milestoneAt, outpostGateSpots, outpostYardHalf, roadHeading, roadPoint, toRoad } from './highway';
import { heldGoal, holdAlong, holdOnStretch, rollingOrder, stretchSpan } from './hunters';
import { yardSpots } from './outpost-gates';
import { chaosHighwayWorld } from './testkit';
import { vehicleStats } from './stats';
import type { Vehicle, World } from './types';

function fortScene(template = 'buggy') {
  const w = chaosHighwayWorld();
  const run = w.chaosHighway!;
  const group = { ...run.groups[0], stretch: 1, from: 'ahead' as const, templates: [template], level: waveOf(1).level };
  run.groups = [group];
  spawnGroup(w, run, group, alongAt(w, haulerOf(w)));
  const hauler = haulerOf(w);
  const me = playerVehicle(w);
  const fort = milestoneAt(w.seed, 1);
  const spots = yardSpots(w, 1);
  hauler.pos = { ...spots.hauler };
  hauler.speed = 0;
  hauler.order = null;
  me.pos = roadPoint(w.seed, 0, fort - 12, 0);
  me.heading = roadHeading(w.seed, fort - 12);
  me.speed = 2;
  const truck = w.vehicles.find((v) => v.id === group.vehicles[0])!;
  truck.pos = roadPoint(w.seed, 0, fort - 6 - outpostYardHalf(), 0);
  truck.speed = 0;
  return { w, truck, me, hauler, fort };
}

function heldDest(v: Vehicle): { x: number; y: number } {
  if (!v.order || v.order.kind === 'brake') throw new Error(`${v.id} holds no point to wait at`);
  return v.order.dest;
}

function parkOnHold(w: World, v: Vehicle): void {
  for (let leg = 0; leg < 3; leg++) {
    planNpcOrders(w);
    const hold = heldDest(v);
    if (hold.x === v.pos.x && hold.y === v.pos.y) return;
    v.pos = { ...hold };
  }
  throw new Error(`${v.id} found no hold to wait at`);
}

function alongAt(w: World, v: Vehicle): number {
  return alongOf(w.seed, toRoad(w.seed, 0, v.pos));
}

function outsideLane(w: World, v: Vehicle, dest: { x: number; y: number }): boolean {
  const gate = outpostGateSpots(w.seed, 0, 1).south;
  const lane = gate.width / 2 + vehicleStats(w, v).radius + CHAOS_HIGHWAY.spawnClear;
  const centre = acrossOf(w.seed, toRoad(w.seed, 0, gate.center));
  return Math.abs(acrossOf(w.seed, toRoad(w.seed, 0, dest)) - centre) >= lane - 1e-6;
}

function expectHeld(w: World, truck: Vehicle): void {
  const order = truck.order!;
  expect(order.kind).toBe('stopAt');
  if (order.kind !== 'stopAt') return;
  const { to } = stretchSpan(w, vehicleStats(w, truck).radius);
  expect(alongOf(w.seed, toRoad(w.seed, 0, order.dest))).toBeLessThanOrEqual(to + 1e-6);
  expect(outsideLane(w, truck, order.dest)).toBe(true);
}

describe('hostiles stay out of the fort', () => {
  it('holds a rolling truck short of the yard while the gun truck is moving', () => {
    const { w, truck, me } = fortScene();
    me.pos = roadPoint(w.seed, 0, alongAt(w, truck) - 12, 0);
    planNpcOrders(w);
    expect(rollingOrder(w, truck)).not.toBeNull();
    expectHeld(w, truck);
  });

  it('holds a truck that catches up with prey standing in the yard', () => {
    const { w, truck, me, fort } = fortScene();
    me.pos = { ...yardSpots(w, 1).truck };
    me.speed = 3;
    truck.pos = roadPoint(w.seed, 0, fort - 20, 0);
    planNpcOrders(w);
    expectHeld(w, truck);
  });

  it('holds a fight point around the parked hauler and does not start an unstick drive', () => {
    const { w, truck, me } = fortScene();
    me.pos = roadPoint(w.seed, 0, alongAt(w, truck) - 60, 0);
    me.speed = 0;
    advanceChaosHighway(w);
    parkOnHold(w, truck);
    for (let i = 0; i <= 6; i++) planNpcOrders(w);
    expect(truck.brain!.recovery ?? 0).toBe(0);
    expectHeld(w, truck);
  });

  it('holds a recovery goal and a ram goal inside the yard', () => {
    const { w, truck } = fortScene();
    truck.brain!.recovery = 3;
    truck.brain!.recoveryGoal = { ...yardSpots(w, 1).truck };
    planNpcOrders(w);
    expectHeld(w, truck);
  });

  it('holds goals at the last fort north of its hold line', () => {
    const { w, truck } = fortScene();
    const run = w.chaosHighway!;
    const south = milestoneAt(w.seed, 0);
    const radius = vehicleStats(w, truck).radius;
    const goal = roadPoint(w.seed, 0, south + 1, 0);
    const held = heldGoal(w, truck, goal)!;
    expect(run.window).toBe(0);
    expect(alongOf(w.seed, toRoad(w.seed, 0, held))).toBeGreaterThanOrEqual(stretchSpan(w, radius).from - 1e-6);
    const gate = outpostGateSpots(w.seed, 0, 0).north;
    const lane = gate.width / 2 + radius + CHAOS_HIGHWAY.spawnClear;
    const centre = acrossOf(w.seed, toRoad(w.seed, 0, gate.center));
    expect(Math.abs(acrossOf(w.seed, toRoad(w.seed, 0, held)) - centre)).toBeGreaterThanOrEqual(lane - 1e-6);
  });

  it('holds a goal in the gate lane on the side of the lane the truck is on, so a goal that crosses the lane centre does not swing it from side to side', () => {
    const { w, truck, fort } = fortScene();
    const radius = vehicleStats(w, truck).radius;
    const gate = outpostGateSpots(w.seed, 0, 1).south;
    const centre = acrossOf(w.seed, toRoad(w.seed, 0, gate.center));
    const lane = gate.width / 2 + radius + CHAOS_HIGHWAY.spawnClear;
    truck.pos = roadPoint(w.seed, 0, fort - 6 - outpostYardHalf(), centre + 0.5);
    const heldAcross = (offset: number) => acrossOf(w.seed, toRoad(w.seed, 0, heldGoal(w, truck, roadPoint(w.seed, 0, fort, centre + offset))!));

    expect(heldAcross(-0.5)).toBeCloseTo(centre + lane, 1);
    expect(heldAcross(0.5)).toBeCloseTo(centre + lane, 1);
  });

  it('leaves goals on the open stretch, the gun truck and the hauler untouched', () => {
    const { w, truck, me, hauler, fort } = fortScene();
    const open = roadPoint(w.seed, 0, fort - 60, 0);
    const order = { kind: 'through' as const, dest: open, pace: 2 };
    expect(holdOnStretch(w, truck, order)).toBe(order);
    const inYard = { kind: 'through' as const, dest: { ...yardSpots(w, 1).truck } };
    expect(holdOnStretch(w, me, inYard)).toBe(inYard);
    expect(holdOnStretch(w, hauler, inYard)).toBe(inYard);
    expect(holdOnStretch(w, truck, { kind: 'brake' })).toEqual({ kind: 'brake' });
  });

  it('keeps the along clamp inside the span', () => {
    const { w, truck } = fortScene();
    const radius = vehicleStats(w, truck).radius;
    const { from, to } = stretchSpan(w, radius);
    expect(holdAlong(w, radius, to + 50)).toBe(to);
    expect(holdAlong(w, radius, from - 50)).toBe(from);
  });
});
