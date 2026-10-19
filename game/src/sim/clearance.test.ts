import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { PHYSICS } from '../data/physics';
import { bodyOf } from './body';
import { clearanceFor, footprintOf } from './clearance';
import { emptyWorld } from './testkit';
import type { Obstacle } from './types';

const S = PHYSICS.metersPerTile;

describe('the body footprint', () => {
  it.each(Object.keys(CHASSIS))('%s: every corner of the body box lies inside a circle', (id) => {
    const { offsets, r } = footprintOf(id);
    const { half } = bodyOf(id);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const corner = { x: (sx * half.x) / S, y: (sz * half.z) / S };
        expect(offsets.some((o) => Math.hypot(corner.x - o, corner.y) <= r + 1e-9)).toBe(true);
      }
  });

  it('a long body is covered by narrow circles, not one wide disc', () => {
    const { offsets, r } = footprintOf('semi');
    const { half } = bodyOf('semi');
    expect(offsets.length).toBeGreaterThan(1);
    expect(r).toBeLessThan(Math.hypot(half.x, half.z) / S / 2);
  });
});

describe('what a truck at a pose touches', () => {
  const rock = (x: number, y: number): Obstacle => ({ id: 'rock1', pos: { x, y }, r: 0.9, kind: 'rock' });
  const at = { x: 30, y: 30 };

  function clearance(obstacles: Obstacle[]) {
    const w = emptyWorld(at);
    w.obstacles = obstacles;
    return clearanceFor(w, w.vehicles[0], []);
  }

  it('is clear in open ground and touches a rock inside the body', () => {
    expect(clearance([]).touches(at, 0)).toBe(false);
    expect(clearance([rock(31, 30)]).touches(at, 0)).toBe(true);
    expect(clearance([rock(36, 30)]).touches(at, 0)).toBe(false);
  });

  it('turns with the heading', () => {
    const c = clearance([{ ...rock(30, 31.1), r: 0.5 }]);
    expect(c.touches(at, 0)).toBe(false);
    expect(c.touches(at, Math.PI / 2)).toBe(true);
  });

  it('ignores a breakable fence', () => {
    const fence: Obstacle = { id: 'fence1', pos: { x: 31, y: 30 }, r: 0.6, kind: 'landmark', look: 'fence', yaw: Math.PI / 2 };
    expect(clearance([fence]).touches(at, 0)).toBe(false);
  });

  it('catches a parked truck passed as an extra blocker', () => {
    const w = emptyWorld(at);
    const c = clearanceFor(w, w.vehicles[0], [{ pos: { x: 31.2, y: 30 }, r: 1 }]);
    expect(c.touches(at, 0)).toBe(true);
  });
});

describe('a truck meeting a moving truck', () => {
  const at = { x: 30, y: 30 };
  const clearance = () => clearanceFor(emptyWorld(at), emptyWorld(at).vehicles[0], []);
  const mover = (pos: { x: number; y: number }, vel: { x: number; y: number }) => ({ id: 'v9', pos, vel, r: 0.8 });

  it('meets a truck that crosses ahead within the roll time', () => {
    expect(clearance().meetsMoving({ x: 34, y: 30 }, 0, 1, [mover({ x: 34, y: 34 }, { x: 0, y: -4 })])).toBe(true);
  });

  it('does not meet a truck that is already past by then', () => {
    expect(clearance().meetsMoving({ x: 34, y: 30 }, 0, 1, [mover({ x: 34, y: 34 }, { x: 0, y: 4 })])).toBe(false);
  });

  it('IV6: throws on a non-finite velocity', () => {
    expect(() => clearance().meetsMoving({ x: 34, y: 30 }, 0, 1, [mover({ x: 34, y: 34 }, { x: Number.NaN, y: 0 })])).toThrow();
  });
});
