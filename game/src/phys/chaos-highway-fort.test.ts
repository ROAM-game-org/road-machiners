import { beforeAll, expect, it } from 'vitest';
import { haulerOf, playerVehicle } from '../sim/damage';
import { makePart } from '../sim/factory';
import { mountPart } from '../sim/inventory';
import { spawnGroup, waveOf } from '../sim/chaos-highway';
import { alongOf, milestoneAt, outpostYardHalf, roadHeading, roadPoint, toRoad } from '../sim/highway';
import { inYard, yardSpots } from '../sim/outpost-gates';
import { chaosHighwayWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { endTurn, setMoveOrder } from '../sim/world';
import { budget } from '../test/budget';
import { buildDrive, freeDrive, initPhysics, type Drive, type TurnResult } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const BRAKING_TURNS = 4;
const TURNS = 60;
const FRONT_PLATES = 2;

function scene(): World {
  const w = chaosHighwayWorld(3);
  const run = w.chaosHighway!;
  const group = { ...run.groups[0], stretch: 1, from: 'ahead' as const, templates: ['buggy', 'buggy'], level: waveOf(1).level };
  run.groups = [group];
  spawnGroup(w, run, group, alongOf(w.seed, toRoad(w.seed, 0, haulerOf(w).pos)));
  const fort = milestoneAt(w.seed, 1);
  const hauler = haulerOf(w);
  hauler.pos = { ...yardSpots(w, 1).hauler };
  hauler.speed = 0;
  hauler.order = null;
  const me = playerVehicle(w);
  for (let i = 0; i < FRONT_PLATES; i++) expect(mountPart(w, me, makePart(w, 'plates', 0))).toBe(true);
  me.pos = roadPoint(w.seed, 0, fort - outpostYardHalf() - 12, 0);
  me.heading = roadHeading(w.seed, fort);
  me.speed = 0;
  me.order = null;
  w.player.fuel = 999;
  group.vehicles.forEach((id, i) => {
    const truck = w.vehicles.find((v) => v.id === id)!;
    truck.pos = roadPoint(w.seed, 0, fort - outpostYardHalf() - 5, i === 0 ? -2 : 2);
    truck.speed = 0;
  });
  return w;
}

it('keeps the hostiles out of the yard and the gateway until the gun truck rides in and wins', () => {
  let w = scene();
  const group = w.chaosHighway!.groups[0];
  let drive: Drive = buildDrive(w);
  let turn = 0;
  for (; turn < TURNS && !w.chaosHighway!.outposts[1].paid; turn++) {
    if (turn === BRAKING_TURNS) w = setMoveOrder(w, { kind: 'stopAt', dest: yardSpots(w, 1).truck });
    let result: TurnResult | null = null;
    w = endTurn(w, physicsMove(drive, (next) => (result = next)));
    freeDrive(drive);
    drive = result!.next;
    for (const id of group.vehicles) {
      const truck = w.vehicles.find((v) => v.id === id);
      if (truck) expect(inYard(w, truck.pos, 1), `turn ${turn}`).toBe(false);
    }
  }
  freeDrive(drive);
  expect(w.chaosHighway!.outposts[1].paid, `after ${turn} turns`).toBe(true);
}, budget(600_000));
