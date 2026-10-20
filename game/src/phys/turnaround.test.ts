import { describe, expect, it } from 'vitest';
import { backUpClear, forwardTurnClear, turnaroundSpeed, turnRadius } from './turnaround';
import { bodyOf } from '../sim/body';
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
    const behind = roomWith([{ x: 17.5, y: 20 }]);
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
    expect(room.touches(stance.at, 0)).toBe(true);
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
