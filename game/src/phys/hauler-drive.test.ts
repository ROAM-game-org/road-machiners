import { beforeAll, expect, it } from 'vitest';
import { HIGHWAY } from '../data/modes';
import { RULES } from '../data/rules';
import { haulerOf, playerVehicle } from '../sim/damage';
import { advanceFar } from '../sim/far';
import { setHeadless } from '../sim/fidelity';
import { acrossOf, milestoneAt, roadHeading, roadPoint, toRoad } from '../sim/highway';
import { stretchLayout } from '../sim/road-hazards';
import { inYard, wholeInYard, yardSpots } from '../sim/outpost-gates';
import { furyRoadWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { dist } from '../sim/vec';
import { endTurn } from '../sim/world';
import { budget } from '../test/budget';
import { buildDrive, freeDrive, initPhysics, type Drive, type TurnResult } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const TURNS = 200;

function onPad(w: World): boolean {
  return inYard(w, haulerOf(w).pos, 1);
}

type HaulerRun = { w: World; turns: number; stalls: number; widest: number };

const played = new Map<number, HaulerRun>();

function haulerRun(seed: number): HaulerRun {
  const done = played.get(seed) ?? playHauler(seed);
  played.set(seed, done);
  return done;
}

function playHauler(seed: number): HaulerRun {
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

function fromLane(seed: number, lane: number): { w: World; turns: number; stalls: number; won: boolean } {
  let w = furyRoadWorld(seed);
  w.furyRoad!.groups = [];
  const hauler = haulerOf(w);
  hauler.pos = roadPoint(seed, 0, milestoneAt(1) - 30, HIGHWAY.road.lanes[lane]);
  hauler.heading = roadHeading(seed, milestoneAt(1) - 30);
  playerVehicle(w).pos = roadPoint(seed, 0, milestoneAt(1) - 40, HIGHWAY.road.lanes[2]);
  let drive: Drive = buildDrive(w);
  let stalls = 0;
  let won = false;
  let turns = 0;
  const spot = yardSpots(w, 1).hauler;
  for (; turns < TURNS; turns++) {
    let result: TurnResult | null = null;
    w = endTurn(w, physicsMove(drive, (next) => (result = next)));
    stalls += w.events.filter((e) => e.t === 'stall').length;
    won ||= w.events.some((e) => e.t === 'outpostReached');
    freeDrive(drive);
    drive = result!.next;
    const parked = haulerOf(w).speed <= RULES.parkedSpeed && dist(haulerOf(w).pos, spot) <= RULES.arriveRadius * 2;
    if (won && parked) break;
  }
  freeDrive(drive);
  return { w, turns, stalls, won };
}

it.each([0, 1, 2, 3])('wins on entering the yard from lane %i, then parks whole in the yard at its spot with no stall (IV7)', (lane) => {
  for (const seed of [1, 2]) {
    const { w, turns, stalls, won } = fromLane(seed, lane);
    expect(won, `seed ${seed} lane ${lane}`).toBe(true);
    expect(stalls, `seed ${seed} lane ${lane}`).toBe(0);
    const hauler = haulerOf(w);
    expect(dist(hauler.pos, yardSpots(w, 1).hauler), `seed ${seed} lane ${lane} after ${turns} turns`).toBeLessThanOrEqual(RULES.arriveRadius * 2);
    expect(wholeInYard(w, hauler, 1)).toBe(true);
  }
}, budget(600_000));
