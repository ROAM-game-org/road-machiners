import { beforeAll, expect, it } from 'vitest';
import { HIGHWAY } from '../data/modes';
import { haulerOf, playerVehicle } from '../sim/damage';
import { advanceFar } from '../sim/far';
import { setHeadless } from '../sim/fidelity';
import { acrossOf, alongOf, outpostFort, roadPoint, toRoad } from '../sim/highway';
import { stretchLayout } from '../sim/road-hazards';
import { canUseSite } from '../sim/sites';
import { furyRoadWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { endTurn } from '../sim/world';
import { budget } from '../test/budget';
import { buildDrive, freeDrive, GROUND, initPhysics, type Drive, type TurnResult } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const TURNS = 200;
const CRATERS_PASSED = 140;

function onPad(w: World): boolean {
  return canUseSite(haulerOf(w).pos, outpostFort(w.seed, 0, 1));
}

function haulerRun(seed: number): { w: World; turns: number; stalls: number; widest: number } {
  let w = furyRoadWorld(seed);
  w.furyRoad!.groups = [];
  let drive: Drive = buildDrive(w);
  let stalls = 0;
  let widest = 0;
  let turns = 0;
  for (; turns < TURNS && !onPad(w); turns++) {
    let result: TurnResult | null = null;
    w = endTurn(w, physicsMove(drive, (next) => (result = next)));
    stalls += w.events.filter((e) => e.t === 'stall').length;
    freeDrive(drive);
    drive = result!.next;
    widest = Math.max(widest, Math.abs(acrossOf(seed, toRoad(0, haulerOf(w).pos))));
  }
  freeDrive(drive);
  return { w, turns, stalls, widest };
}

it('drives the hauler alone through the scenes of stretch 1 to the fort pad with no stall, on seeds with different scenes', () => {
  for (const seed of [1, 2, 3, 4]) {
    const { w, turns, stalls } = haulerRun(seed);
    console.info(`seed ${seed}: the hauler reached the pad in ${turns} turns`);
    expect(stalls, `seed ${seed}`).toBe(0);
    expect(onPad(w), `seed ${seed} after ${turns} turns`).toBe(true);
  }
}, budget(1_500_000));

it('keeps the hauler on the asphalt and its verge until it turns off at the fort', () => {
  const { widest, w } = haulerRun(5);
  expect(onPad(w)).toBe(true);
  expect(widest).toBeLessThan(HIGHWAY.road.badlands);
}, budget(600_000));

const KINDS = ['pileup', 'jackknife', 'checkpoint', 'tankline', 'rockfall', 'craters', 'ramp'] as const;

function seedWith(kind: (typeof KINDS)[number]): number {
  for (let seed = 1; seed <= 60; seed++) if (stretchLayout(seed, 1).scenes.some((s) => s.kind === kind)) return seed;
  throw new Error(`No seed in 1 to 60 lays a ${kind} scene in stretch 1`);
}

function farRun(seed: number): { w: World; turns: number; stalls: number } {
  setHeadless(true);
  let w = furyRoadWorld(seed);
  w.furyRoad!.groups = [];
  let stalls = 0;
  let turns = 0;
  for (; turns < TURNS && !onPad(w); turns++) {
    w = endTurn(w, (next) => { for (const v of next.vehicles) advanceFar(next, v); });
    stalls += w.events.filter((e) => e.t === 'stall').length;
  }
  setHeadless(false);
  return { w, turns, stalls };
}

it.each(KINDS)('drives the hauler by far travel through a %s scene to the fort pad', (kind) => {
  const seed = seedWith(kind);
  const { w, turns, stalls } = farRun(seed);
  expect(stalls, `seed ${seed}`).toBe(0);
  expect(onPad(w), `seed ${seed} after ${turns} turns`).toBe(true);
}, budget(300_000));

it.each(KINDS)('drives the hauler in physics through a %s scene to the fort pad', (kind) => {
  const seed = seedWith(kind);
  const { w, turns, stalls } = haulerRun(seed);
  expect(stalls, `seed ${seed}`).toBe(0);
  expect(onPad(w), `seed ${seed} after ${turns} turns`).toBe(true);
}, budget(300_000));

const ESCORT_BESIDE = { ahead: 3, across: 2 };

function escortedRun(seed: number, turns: number): { grounded: number; stalls: number; farthest: number } {
  let w = furyRoadWorld(seed);
  w.furyRoad!.groups = [];
  let drive: Drive = buildDrive(w);
  let grounded = 0;
  let stalls = 0;
  for (let turn = 0; turn < turns; turn++) {
    const at = toRoad(0, haulerOf(w).pos);
    const spot = roadPoint(seed, 0, alongOf(seed, at) + ESCORT_BESIDE.ahead, acrossOf(seed, at) + ESCORT_BESIDE.across);
    playerVehicle(w).order = { kind: 'through', dest: spot, pace: 6 };
    let result: TurnResult | null = null;
    w = endTurn(w, physicsMove(drive, (next) => (result = next)));
    const hauler = haulerOf(w);
    grounded += w.events.filter((e) => e.t === 'collision' && e.b === GROUND && e.a === hauler.id).length;
    stalls += w.events.filter((e) => e.t === 'stall').length;
    freeDrive(drive);
    drive = result!.next;
  }
  freeDrive(drive);
  return { grounded, stalls, farthest: alongOf(seed, toRoad(0, haulerOf(w).pos)) };
}

it('keeps the hauler out of the craters of stretch 1 with the gun truck riding beside it', () => {
  const { grounded, stalls, farthest } = escortedRun(4, 30);
  expect(grounded).toBe(0);
  expect(stalls).toBe(0);
  expect(farthest).toBeGreaterThan(CRATERS_PASSED);
}, budget(300_000));
