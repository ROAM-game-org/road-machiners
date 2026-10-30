import { beforeAll, describe, expect, it } from 'vitest';
import { PHYSICS } from '../data/physics';
import { RULES } from '../data/rules';
import { makeVehicle } from '../sim/factory';
import { restBend } from '../sim/rig';
import { vehicleStats } from '../sim/stats';
import { editableTerrain, emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { endTurn, setMoveOrder } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, toMps, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

function rolling(chassisId: string, speed: number): World {
  const w = emptyWorld({ x: 20, y: 60 });
  const me = w.vehicles[0];
  const v = makeVehicle(w, { faction: 'player', chassisId, parts: [{ defId: 'workhorseDiesel', wear: 0 }], spares: [], cargo: {}, pos: me.pos, heading: 0, brain: null });
  w.vehicles[0] = { ...v, id: me.id, speed, bend: restBend(chassisId) };
  w.player.fuel = 999;
  editableTerrain(w).types.fill('asphalt' as 'road');
  return w;
}

function brakeDistance(chassisId: string, speed: number): { meters: number; turns: number; predicted: number } {
  let w = setMoveOrder(rolling(chassisId, speed), { kind: 'brake' });
  const decel = toMps(vehicleStats(w, w.vehicles[0]).brake) / PHYSICS.turnSeconds;
  const start = w.vehicles[0].pos.x;
  let d: Drive | null = buildDrive(w);
  let turns = 0;
  while (w.vehicles[0].speed > RULES.parkedSpeed / 10 && turns < 6) {
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(d!, (r) => (next = r.next)));
    freeDrive(d!);
    d = next;
    turns++;
  }
  freeDrive(d!);
  return { meters: (w.vehicles[0].pos.x - start) * PHYSICS.metersPerTile, turns, predicted: toMps(speed) ** 2 / (2 * decel) };
}

describe('braking at the constant rate of the brake stat', () => {
  it.each(['scout', 'semi'])('a %s stops in the distance its brake stat gives, not at once', (chassisId) => {
    const top = vehicleStats(rolling(chassisId, 0), rolling(chassisId, 0).vehicles[0]).maxSpeed;
    const run = brakeDistance(chassisId, top * 0.75);
    expect(run.meters).toBeGreaterThan(run.predicted * 0.9);
    expect(run.meters).toBeLessThan(run.predicted * 1.15);
    expect(run.turns).toBeGreaterThan(1);
  }, 60_000);

  it('twice the speed takes about four times the distance', () => {
    const slow = brakeDistance('scout', 2);
    const fast = brakeDistance('scout', 4);
    expect(fast.meters / slow.meters).toBeGreaterThan(3.4);
    expect(fast.meters / slow.meters).toBeLessThan(4.6);
  }, 60_000);
});
