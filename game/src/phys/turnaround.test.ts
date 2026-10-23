import { beforeAll, describe, expect, it } from 'vitest';
import { backUpClear, forwardTurnClear, turnaroundSpeed, turnRadius } from './turnaround';
import { bodyOf } from '../sim/body';
import { CHASSIS } from '../data/chassis';
import { addVehicle } from '../sim/testkit';
import { endTurn, setDirect, setMoveOrder } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, type TurnResult } from './drive';
import { physicsMove } from './turn';
import { PHYSICS } from '../data/physics';
import { clearanceFor } from '../sim/clearance';
import { emptyWorld } from '../sim/testkit';

const stance = { at: { x: 20, y: 20 }, heading: 0 };

function roomWith(rocks: { x: number; y: number }[], at = stance.at) {
  const w = emptyWorld(at);
  w.obstacles = rocks.map((r, i) => ({ id: `rock${i}`, pos: { x: r.x, y: r.y }, r: 0.9, kind: 'rock' as const }));
  return { room: clearanceFor(w, w.vehicles[0], []), size: w.terrain.size };
}

describe('turnaround room', () => {
  it('a full-lock turn left is clear in open ground', () => {
    const { room, size } = roomWith([]);
    expect(forwardTurnClear(room, stance, 4, 1, Math.PI, size)).toBe(true);
  });

  it('a rock on the circle toward the aim blocks the turn on that side only', () => {
    const { room, size } = roomWith([{ x: 24, y: 24 }]);
    expect(forwardTurnClear(room, stance, 4, 1, Math.PI, size)).toBe(false);
    expect(forwardTurnClear(room, stance, 4, -1, Math.PI, size)).toBe(true);
  });

  it('a turn stops at the sweep, so a rock past it does not block', () => {
    const { room, size } = roomWith([{ x: 20, y: 28 }]);
    expect(forwardTurnClear(room, stance, 4, 1, Math.PI / 2, size)).toBe(true);
    expect(forwardTurnClear(room, stance, 4, 1, Math.PI, size)).toBe(false);
  });

  it('a back-up is blocked by a rock behind the truck and clear otherwise', () => {
    const behind = roomWith([{ x: 18, y: 20 }]);
    expect(backUpClear(behind.room, stance, 4, 1, 1, behind.size)).toBe(false);
    const ahead = roomWith([{ x: 23, y: 20 }]);
    expect(backUpClear(ahead.room, stance, 4, 1, 1, ahead.size)).toBe(true);
  });

  it('a back-up leg that swings the nose left sweeps the rear toward the right', () => {
    const right = roomWith([{ x: 17.5, y: 19 }]);
    expect(backUpClear(right.room, stance, 4, 1, 1.5, right.size)).toBe(false);
    const left = roomWith([{ x: 17.5, y: 23 }]);
    expect(backUpClear(left.room, stance, 4, 1, 1.5, left.size)).toBe(true);
  });

  it('the map edge counts as blocked', () => {
    const { room, size } = roomWith([], { x: 0.5, y: 20 });
    expect(backUpClear(room, { at: { x: 0.5, y: 20 }, heading: 0 }, 4, 1, 1, size)).toBe(false);
  });

  it('a rock touching the side does not block a straight back-up', () => {
    const { room, size } = roomWith([{ x: 20, y: 21.2 }]);
    expect(room.touches(stance.at, 0, undefined)).toBe(true);
    expect(backUpClear(room, stance, Infinity, 1, 1, size)).toBe(true);
  });

  it('a rock touching the rear corner blocks a back-up that swings into it', () => {
    const { room, size } = roomWith([{ x: 17.7, y: 21.4 }]);
    expect(backUpClear(room, stance, 3, -1, 2, size)).toBe(false);
  });

  it('a truck touching a rock may turn away from it', () => {
    const { room, size } = roomWith([{ x: 20, y: 21.2 }]);
    expect(forwardTurnClear(room, stance, 4, -1, Math.PI / 2, size)).toBe(true);
  });
});

describe('turn speed', () => {
  it('follows the full-lock radius and the grip', () => {
    const b = bodyOf('scout');
    const r = turnRadius(b, PHYSICS.truck.maxSteer);
    expect(turnaroundSpeed(b, PHYSICS.truck.maxSteer, 1)).toBeCloseTo(Math.sqrt(PHYSICS.driver.cornerAccel * r));
    expect(turnaroundSpeed(b, PHYSICS.truck.maxSteer, 0.5)).toBeLessThan(turnaroundSpeed(b, PHYSICS.truck.maxSteer, 1));
  });
});

const BUS_RAPIER_CIRCLE = 6.09;

type Point = { x: number; z: number };

function fittedRadius(points: Point[]): number {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const mz = points.reduce((s, p) => s + p.z, 0) / n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of points) {
    const u = p.x - mx;
    const v = p.z - mz;
    suu += u * u; svv += v * v; suv += u * v;
    suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  const uc = (((suuu + suvv) / 2) * svv - ((svvv + svuu) / 2) * suv) / det;
  const vc = (suu * ((svvv + svuu) / 2) - suv * ((suuu + suvv) / 2)) / det;
  return Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
}

function fullLockCircleFromRest(chassisId: string): number {
  let w = emptyWorld({ x: 60, y: 60 });
  const v = addVehicle(w, 'player', chassisId, ['stockEngine'], { x: 60, y: 60 });
  w.vehicles = [v];
  w.player.vehicleId = v.id;
  w = setMoveOrder(setDirect(w, true), { kind: 'through', dest: { x: 60, y: 30 } });
  const d = buildDrive(w);
  let r: TurnResult | null = null;
  endTurn(w, physicsMove(d, (x) => (r = x)));
  freeDrive(r!.next);
  freeDrive(d);
  const frames = r!.frames[v.id].map((f) => ({ x: f.pos.x, z: f.pos.z, steer: Math.abs(f.wheels[0].steer) }));
  const lock = Math.max(...frames.map((f) => f.steer));
  return fittedRadius(frames.filter((f) => f.steer > lock - 0.01));
}

describe('the bus turning circle', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('turns the bus at full lock from rest in Rapier on the circle its old 5.85 m wheelbase gave, within 5%', () => {
    expect(Math.abs(fullLockCircleFromRest('bus') / BUS_RAPIER_CIRCLE - 1)).toBeLessThanOrEqual(0.05);
  });

  it('keeps the bus upright at top speed at full lock on flat ground', () => {
    let w = emptyWorld({ x: 60, y: 60 });
    const v = addVehicle(w, 'player', 'bus', ['stockEngine'], { x: 60, y: 60 });
    w.vehicles = [v];
    w.player.vehicleId = v.id;
    v.speed = CHASSIS.bus.maxSpeed;
    w = setMoveOrder(setDirect(w, true), { kind: 'through', dest: { x: 60, y: 40 } });
    let d = buildDrive(w);
    const tilts: number[] = [];
    for (let i = 0; i < 4; i++) {
      let r: TurnResult | null = null;
      w = endTurn(w, physicsMove(d, (x) => (r = x)));
      for (const f of r!.frames[v.id]) tilts.push(Math.acos(Math.min(1, 1 - 2 * (f.rot.x * f.rot.x + f.rot.z * f.rot.z))) * (180 / Math.PI));
      freeDrive(d);
      d = r!.next;
      const bus = w.vehicles[0];
      const turn = i % 2 ? Math.PI / 2 : -Math.PI / 2;
      w = setMoveOrder(w, { kind: 'through', dest: { x: bus.pos.x + 20 * Math.cos(bus.heading + turn), y: bus.pos.y + 20 * Math.sin(bus.heading + turn) } });
    }
    expect(Math.max(...tilts)).toBeLessThan(PHYSICS.truck.flipTilt);
  });

  it('turns the bus wider than the van, whose wheelbase it now shares', () => {
    expect(fullLockCircleFromRest('bus')).toBeGreaterThan(fullLockCircleFromRest('van'));
  });
});
