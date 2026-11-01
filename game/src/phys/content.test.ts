import { beforeAll, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { makeVehicle } from '../sim/factory';
import { emptyWorld } from '../sim/testkit';
import type { Vehicle, World } from '../sim/types';
import { cloneWorld, endTurn } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, simulateTurn, type TurnResult } from './drive';
import type { VehicleFrame } from './frames';
import { physicsMove } from './turn';

const UPRIGHT = Math.cos(Math.PI / 6);

let fixture: World;
beforeAll(async () => {
  await initPhysics();
  fixture = emptyWorld();
});

function soloWorld(chassisId: string): { world: World; vehicle: Vehicle } {
  const world = cloneWorld(fixture);
  const vehicle = makeVehicle(world, { faction: 'player', chassisId, parts: [{ defId: 'stockEngine', wear: 0 }], spares: [], cargo: {}, pos: { x: 30, y: 30 }, heading: 0, brain: null });
  world.vehicles = [vehicle];
  world.player.vehicleId = vehicle.id;
  return { world, vehicle };
}

function expectUpright(frame: VehicleFrame): void {
  expect(1 - 2 * (frame.rot.x ** 2 + frame.rot.z ** 2)).toBeGreaterThan(UPRIGHT);
}

it.each(Object.keys(CHASSIS))('%s drives upright with repeatable physics', (chassisId) => {
  const { world, vehicle } = soloWorld(chassisId);
  vehicle.order = { kind: 'through', dest: { x: 45, y: 30 } };
  const drive = buildDrive(world);
  try {
    const a = simulateTurn(drive, world);
    const b = simulateTurn(drive, world);
    try {
      const frames = a.frames[vehicle.id];
      expect(frames.at(-1)).toEqual(b.frames[vehicle.id].at(-1));
      expect(frames.at(-1)!.pos.x).toBeGreaterThan(frames[0].pos.x);
      for (const frame of frames) {
        expect(frame.wheels).toHaveLength(4);
        expect(Number.isFinite(frame.pos.x + frame.pos.y + frame.pos.z)).toBe(true);
        expectUpright(frame);
      }
    } finally {
      freeDrive(a.next);
      freeDrive(b.next);
    }
  } finally {
    freeDrive(drive);
  }
});

it('loader stays upright turning at full lock from top speed', () => {
  const solo = soloWorld('loader');
  let world = solo.world;
  let drive = buildDrive(world);
  const turn = (): TurnResult => {
    const results: TurnResult[] = [];
    world = endTurn(world, physicsMove(drive, (r) => results.push(r)));
    freeDrive(drive);
    drive = results[0].next;
    return results[0];
  };
  const loader = () => world.vehicles.find((v) => v.id === solo.vehicle.id)!;
  loader().order = { kind: 'through', dest: { x: 200, y: 30 } };
  try {
    for (let i = 0; i < 3; i++) turn();
    expect(loader().speed).toBeGreaterThan(2);
    loader().order = { kind: 'through', dest: { x: loader().pos.x + 2, y: loader().pos.y + 12 } };
    for (let i = 0; i < 2; i++) for (const frame of turn().frames[solo.vehicle.id]) expectUpright(frame);
  } finally {
    freeDrive(drive);
  }
});
