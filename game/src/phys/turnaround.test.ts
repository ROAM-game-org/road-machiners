import { describe, expect, it } from 'vitest';
import { CELL } from '../sim/nav/layer';
import { backUpClear, forwardTurnClear, turnaroundSpeed, turnRadius } from './turnaround';
import { bodyOf } from '../sim/body';
import { PHYSICS } from '../data/physics';

const N = 80;

function gridWith(rocks: { x: number; y: number }[]) {
  const blocked = new Uint8Array(N * N);
  for (const r of rocks) for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) blocked[(Math.floor(r.y / CELL) + dy) * N + Math.floor(r.x / CELL) + dx] = 1;
  return { n: N, blocked };
}

const stance = { at: { x: 20, y: 20 }, heading: 0 };

describe('turnaround room', () => {
  it('a full-lock turn left is clear on an empty grid', () => {
    expect(forwardTurnClear(gridWith([]), stance, 4, 1, Math.PI)).toBe(true);
  });

  it('a rock on the circle toward the aim blocks the turn on that side only', () => {
    const grid = gridWith([{ x: 24, y: 24 }]);
    expect(forwardTurnClear(grid, stance, 4, 1, Math.PI)).toBe(false);
    expect(forwardTurnClear(grid, stance, 4, -1, Math.PI)).toBe(true);
  });

  it('a turn stops at the sweep, so a rock past it does not block', () => {
    const grid = gridWith([{ x: 20, y: 28 }]);
    expect(forwardTurnClear(grid, stance, 4, 1, Math.PI / 2)).toBe(true);
    expect(forwardTurnClear(grid, stance, 4, 1, Math.PI)).toBe(false);
  });

  it('a back-up is blocked by a rock behind the truck and clear otherwise', () => {
    expect(backUpClear(gridWith([{ x: 19, y: 20 }]), stance, 4, 1, 1)).toBe(false);
    expect(backUpClear(gridWith([{ x: 21, y: 20 }]), stance, 4, 1, 1)).toBe(true);
  });

  it('a back-up leg that swings the nose left sweeps the rear toward the right', () => {
    const grid = gridWith([{ x: 18.9, y: 19.6 }]);
    expect(backUpClear(grid, stance, 4, 1, 1.5)).toBe(false);
    expect(backUpClear(gridWith([{ x: 18.9, y: 22.5 }]), stance, 4, 1, 1.5)).toBe(true);
  });

  it('the map edge counts as blocked', () => {
    expect(backUpClear(gridWith([]), { at: { x: 0.5, y: 20 }, heading: 0 }, 4, 1, 1)).toBe(false);
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
