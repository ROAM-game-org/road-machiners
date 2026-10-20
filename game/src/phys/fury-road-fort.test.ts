import { beforeAll, expect, it } from 'vitest';
import { haulerOf, playerVehicle } from '../sim/damage';
import { spawnGroup, waveOf } from '../sim/fury-road';
import { alongOf, milestoneAt, outpostYardHalf, roadHeading, roadPoint, toRoad } from '../sim/highway';
import { inYard, yardSpots } from '../sim/outpost-gates';
import { furyRoadWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { endTurn, setMoveOrder } from '../sim/world';
import { budget } from '../test/budget';
import { buildDrive, freeDrive, initPhysics, type Drive, type TurnResult } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const BRAKING_TURNS = 12;
const TURNS = 60;

function scene(): World {
  const w = furyRoadWorld(3);
  const run = w.furyRoad!;
  const group = { ...run.groups[0], stretch: 1, from: 'ahead' as const, templates: ['buggy', 'buggy'], level: waveOf(1).level };
  run.groups = [group];
  spawnGroup(w, run, group, alongOf(w.seed, toRoad(w.seed, 0, haulerOf(w).pos)));
  const fort = milestoneAt(w.seed, 1);
  const hauler = haulerOf(w);
  hauler.pos = { ...yardSpots(w, 1).hauler };
  hauler.speed = 0;
  hauler.order = null;
  const me = playerVehicle(w);
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
  const group = w.furyRoad!.groups[0];
  let drive: Drive = buildDrive(w);
  let turn = 0;
  for (; turn < TURNS && !w.furyRoad!.outposts[1].paid; turn++) {
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
  expect(w.furyRoad!.outposts[1].paid, `after ${turn} turns`).toBe(true);
}, budget(600_000));
