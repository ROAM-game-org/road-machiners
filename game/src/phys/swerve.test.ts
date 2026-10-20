import { beforeAll, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { PHYSICS } from '../data/physics';
import { makeVehicle } from '../sim/factory';
import { vehicleStats } from '../sim/stats';
import { emptyWorld } from '../sim/testkit';
import { endTurn, setMoveOrder } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, type Drive, type TurnResult } from './drive';
import { physicsMove } from './turn';

const UPRIGHT = Math.cos(Math.PI / 6);
const SWERVES = 3;

beforeAll(async () => {
  await initPhysics();
});

it.each(Object.keys(CHASSIS))('%s at top speed swerving hard stays upright and on the ground', (chassisId) => {
  const world = emptyWorld();
  const vehicle = makeVehicle(world, { faction: 'player', chassisId, parts: [{ defId: 'stockEngine', wear: 0 }], spares: [], cargo: {}, pos: { x: 30, y: 30 }, heading: 0, brain: null });
  world.vehicles = [vehicle];
  world.player.vehicleId = vehicle.id;
  vehicle.speed = vehicleStats(world, vehicle).maxSpeed;
  let w = setMoveOrder(world, { kind: 'through', dest: { x: 34, y: 40 } });
  let d: Drive = buildDrive(w);
  try {
    for (let i = 0; i < SWERVES; i++) {
      let r: TurnResult | null = null;
      w = endTurn(w, physicsMove(d, (x) => (r = x)));
      freeDrive(d);
      d = r!.next;
      for (const frame of r!.frames[vehicle.id]) {
        expect(1 - 2 * (frame.rot.x ** 2 + frame.rot.z ** 2)).toBeGreaterThan(UPRIGHT);
        expect(frame.wheels.some((wheel) => wheel.suspension < PHYSICS.truck.suspensionRest + PHYSICS.truck.suspensionTravel)).toBe(true);
      }
      const at = w.vehicles[0].pos;
      w = setMoveOrder(w, { kind: 'through', dest: i % 2 ? { x: at.x + 4, y: at.y + 10 } : { x: at.x - 4, y: at.y - 10 } });
    }
  } finally {
    freeDrive(d);
  }
});
