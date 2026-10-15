import { beforeAll, expect, it } from 'vitest';
import { FURY_ROAD, HIGHWAY } from '../data/modes';
import { haulerOf, playerVehicle } from '../sim/damage';
import { moveWindow } from '../sim/fury-road';
import { acrossOf, alongOf, roadPoint, toRoad } from '../sim/highway';
import { stretchLayout } from '../sim/road-hazards';
import { furyRoadWorld, parkOnPad } from '../sim/testkit';
import type { World } from '../sim/types';
import { endTurn } from '../sim/world';
import { budget } from '../test/budget';
import { buildDrive, freeDrive, GROUND, initPhysics, type Drive, type TurnResult } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const LEAD = 16;
const TURNS = 30;
const PAST = 40;
const CASES = [{ stretch: 2, lane: 1 }, { stretch: 6, lane: 2 }, { stretch: 9, lane: 3 }];

function seedWithRoadblock(stretch: number): number {
  for (let seed = 1; seed <= 80; seed++) if (stretchLayout(seed, stretch).scenes.some((s) => s.kind === 'roadblock')) return seed;
  throw new Error(`No seed in 1 to 80 lays a roadblock in stretch ${stretch}`);
}

function worldAtWindow(seed: number, window: number): World {
  const w = furyRoadWorld(seed);
  for (let milestone = 1; milestone <= window; milestone++) {
    parkOnPad(w, milestone);
    w.furyRoad!.outposts.find((o) => o.milestone === milestone)!.paid = true;
    w.furyRoad!.waitingAt = milestone;
    w.furyRoad!.groups = [];
    moveWindow(w);
    w.furyRoad!.waitingAt = null;
  }
  w.furyRoad!.groups = [];
  w.vehicles = w.vehicles.filter((v) => v.faction === 'player');
  return w;
}

it.each(CASES)('drives the hauler around a stretch $stretch roadblock on its own, with no hit, no broken prop and no stall', ({ stretch, lane }) => {
  const seed = seedWithRoadblock(stretch);
  const block = stretchLayout(seed, stretch).scenes.find((s) => s.kind === 'roadblock')!;
  const window = stretch - 1;
  let w = worldAtWindow(seed, window);
  const start = block.from - LEAD;
  const hauler = haulerOf(w);
  hauler.pos = roadPoint(seed, window, start, HIGHWAY.road.lanes[lane]);
  const ahead = roadPoint(seed, window, start + 4, HIGHWAY.road.lanes[lane]);
  hauler.heading = Math.atan2(ahead.y - hauler.pos.y, ahead.x - hauler.pos.x);
  hauler.speed = FURY_ROAD.hauler.cruise;
  playerVehicle(w).pos = roadPoint(seed, window, start - 20, HIGHWAY.road.lanes[1]);
  let drive: Drive = buildDrive(w);
  let hits = 0;
  let stalls = 0;
  let widest = 0;
  for (let turn = 0; turn < TURNS; turn++) {
    let result: TurnResult | null = null;
    w = endTurn(w, physicsMove(drive, (next) => (result = next)));
    hits += w.events.filter((e) => e.t === 'collision' && e.a === hauler.id && e.b !== GROUND).length;
    stalls += w.events.filter((e) => e.t === 'stall').length;
    freeDrive(drive);
    drive = result!.next;
    widest = Math.max(widest, Math.abs(acrossOf(seed, toRoad(window, haulerOf(w).pos))));
  }
  freeDrive(drive);
  expect(hits, `seed ${seed}`).toBe(0);
  expect(w.broken, `seed ${seed}`).toHaveLength(0);
  expect(stalls, `seed ${seed}`).toBe(0);
  expect(widest, `seed ${seed}`).toBeGreaterThan(HIGHWAY.road.asphalt);
  expect(alongOf(seed, toRoad(window, haulerOf(w).pos)), `seed ${seed}`).toBeGreaterThan(block.to + PAST);
}, budget(300_000));
