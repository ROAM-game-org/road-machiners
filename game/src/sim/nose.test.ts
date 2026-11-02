import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { noseFrame, noseRocks } from './nose';
import type { Site } from './sites';

const nose = REGION.towns.find((t) => t.id === 'nose')!;
const OLD_FRONT_RAD = (82.8507 * Math.PI) / 180;

describe('Nose frame', () => {
  it('stays on the old front bearing wherever the gates stand (IV3)', () => {
    const { yaw, u, v } = noseFrame(nose);
    expect(yaw).toBeCloseTo(Math.atan2(Math.cos(OLD_FRONT_RAD), -Math.sin(OLD_FRONT_RAD)), 4);
    expect(v.x).toBeCloseTo(-Math.cos(OLD_FRONT_RAD), 4);
    expect(v.y).toBeCloseTo(-Math.sin(OLD_FRONT_RAD), 4);
    expect(u).toEqual({ x: -Math.sin((82.85 * Math.PI) / 180), y: Math.cos((82.85 * Math.PI) / 180) });
  });

  it('poses the rock props at the site center on that yaw (IV3)', () => {
    const { yaw } = noseFrame(nose);
    for (const rock of noseRocks(nose)) {
      expect(rock.pos).toEqual(nose.pos);
      expect(rock.yaw).toBe(yaw);
    }
  });

  it('names the gate with positive u west and the other south', () => {
    const { u, west, south } = noseFrame(nose);
    const side = (g: { face: { x: number; y: number } }) => (g.face.x - nose.pos.x) * u.x + (g.face.y - nose.pos.y) * u.y;
    expect(side(west)).toBeGreaterThan(0);
    expect(side(south)).toBeLessThan(0);
  });

  it('throws when both gates lie on one side of the axis (IV4)', () => {
    const front = (82.85 * Math.PI) / 180;
    const u = { x: -Math.sin(front), y: Math.cos(front) };
    const pos = nose.pos;
    const at = (a: number, b: number) => ({ x: pos.x + u.x * a + u.y * b, y: pos.y + u.y * a - u.x * b });
    const stub = { ...nose, gates: [at(10, -20), at(14, -18)].map((p) => ({ x: p.x, y: p.y })) } as unknown as Site;
    expect(() => noseFrame(stub)).toThrow(/one gate on each side/);
  });
});
