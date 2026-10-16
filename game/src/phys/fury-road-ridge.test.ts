import { beforeAll, expect, it } from 'vitest';
import { HIGHWAY } from '../data/modes';
import { playerVehicle } from '../sim/damage';
import { acrossOf, roadHeading, roadPoint, toRoad } from '../sim/highway';
import { furyRoadWorld } from '../sim/testkit';
import { endTurn, setMoveOrder } from '../sim/world';
import { budget } from '../test/budget';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const CHARGE_TURNS = 25;

function farthestAcross(seed: number, side: number): number {
  let w = furyRoadWorld(seed);
  w.furyRoad!.groups = [];
  const n = 150;
  const me = playerVehicle(w);
  me.pos = roadPoint(seed, 0, n, side * 6);
  me.heading = roadHeading(seed, n) + (side * Math.PI) / 2;
  let drive: Drive = buildDrive(w);
  let farthest = 0;
  for (let turn = 0; turn < CHARGE_TURNS; turn++) {
    w = setMoveOrder(w, { kind: 'through', dest: roadPoint(seed, 0, n, side * 80) });
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(drive, (r) => (next = r.next)));
    freeDrive(drive);
    drive = next!;
    w.player.call = null;
    farthest = Math.max(farthest, Math.abs(acrossOf(seed, toRoad(seed, 0, playerVehicle(w).pos))));
  }
  freeDrive(drive);
  return farthest;
}

it('a truck charging the badlands ridge at full speed stops at its wall on both sides', () => {
  const wallTop = HIGHWAY.road.badlands + HIGHWAY.road.ridge.run;
  for (const seed of [3, 5]) {
    for (const side of [1, -1]) expect(farthestAcross(seed, side), `seed ${seed} side ${side}`).toBeLessThan(wallTop);
  }
}, budget(60_000));
