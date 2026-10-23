import { beforeAll, expect, it } from 'vitest';
import { CHASSIS_FEATURES } from '../data/chassis';
import { playerVehicle } from '../sim/damage';
import { alongOf, roadHeading, roadPoint, toRoad } from '../sim/highway';
import { furyRoadWorld } from '../sim/testkit';
import { endTurn, setMoveOrder } from '../sim/world';
import { budget } from '../test/budget';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const SEED = 3;
const START = 120;
const VERGE = 11;
const TURNS = 5;

function groundCovered(offRoadCut: number): number {
  const chassisId = playerVehicle(furyRoadWorld(SEED)).chassisId;
  const original = CHASSIS_FEATURES[chassisId];
  CHASSIS_FEATURES[chassisId] = { id: 'offRoad', offRoadCut };
  try {
    let w = furyRoadWorld(SEED);
    w.furyRoad!.groups = [];
    w.obstacles = [];
    const me = playerVehicle(w);
    me.pos = roadPoint(SEED, 0, START, VERGE);
    me.heading = roadHeading(SEED, START);
    me.direct = true;
    const from = alongOf(SEED, toRoad(SEED, 0, me.pos));
    let drive: Drive = buildDrive(w);
    for (let turn = 0; turn < TURNS; turn++) {
      const along = alongOf(SEED, toRoad(SEED, 0, playerVehicle(w).pos));
      w = setMoveOrder(w, { kind: 'through', dest: roadPoint(SEED, 0, along + 30, VERGE) });
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(drive, (r) => (next = r.next)));
      freeDrive(drive);
      drive = next!;
      w.player.call = null;
    }
    freeDrive(drive);
    return alongOf(SEED, toRoad(SEED, 0, playerVehicle(w).pos)) - from;
  } finally {
    CHASSIS_FEATURES[chassisId] = original;
  }
}

it('an off-road drive truck covers more of the verge in five turns than the same truck without it', () => {
  const plain = groundCovered(0);
  const offRoad = groundCovered(1);
  expect(offRoad).toBeGreaterThan(plain * 1.05);
}, budget(120_000));
