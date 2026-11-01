import { beforeAll, expect, it } from 'vitest';
import { TERRAIN, TERRAIN_TYPES } from '../data/terrain';
import { playerVehicle } from '../sim/damage';
import { alongOf, roadHeading, roadPoint, toRoad } from '../sim/highway';
import { tileAt } from '../sim/terrain';
import { chaosHighwayWorld } from '../sim/testkit';
import { endTurn, setMoveOrder } from '../sim/world';
import { budget } from '../test/budget';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const SEED = 3;
const START = 120;
const TURNS = 20;

function topSpeedAlong(offset: number): { speed: number; paved: boolean } {
  let w = chaosHighwayWorld(SEED);
  w.chaosHighway!.groups = [];
  w.obstacles = [];
  const me = playerVehicle(w);
  me.pos = roadPoint(SEED, 0, START, offset);
  me.heading = roadHeading(SEED, START);
  me.direct = true;
  let drive: Drive = buildDrive(w);
  let speed = 0;
  for (let turn = 0; turn < TURNS; turn++) {
    const along = alongOf(SEED, toRoad(SEED, 0, playerVehicle(w).pos));
    w = setMoveOrder(w, { kind: 'through', dest: roadPoint(SEED, 0, along + 30, offset) });
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(drive, (r) => (next = r.next)));
    freeDrive(drive);
    drive = next!;
    w.player.call = null;
    speed = Math.max(speed, playerVehicle(w).speed);
  }
  freeDrive(drive);
  const paved = TERRAIN_TYPES[w.terrain.types[tileAt(w.terrain, playerVehicle(w).pos)]].paved;
  return { speed, paved };
}

it('a truck tops out about a tenth slower on the unpaved verge than on the asphalt', () => {
  const road = topSpeedAlong(1);
  const verge = topSpeedAlong(11);

  expect([road.paved, verge.paved]).toEqual([true, false]);
  expect(verge.speed / road.speed).toBeCloseTo(TERRAIN.drive.unpavedTopSpeed, 1);
}, budget(60_000));
