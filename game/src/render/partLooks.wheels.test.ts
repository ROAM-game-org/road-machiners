import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { wheelMounts } from '../phys/body';
import { bodyOf } from '../sim/body';
import { TRUCK_LOOK, drawnWheelPoints } from './partLooks';

describe('drawnWheelPoints', () => {
  it.each(Object.keys(CHASSIS))('%s: keeps the physics wheel order and height and pushes each wheel outward', (id) => {
    const body = bodyOf(id);
    const physics = wheelMounts(body);
    const drawn = drawnWheelPoints(body);
    expect(drawn).toHaveLength(physics.length);
    drawn.forEach((d, i) => {
      expect(d.x).toBe(physics[i].x);
      expect(d.y).toBe(physics[i].y);
      expect(Math.sign(d.z)).toBe(Math.sign(physics[i].z));
      expect(Math.abs(d.z) - Math.abs(physics[i].z)).toBeCloseTo(TRUCK_LOOK.wheelPush, 9);
    });
  });

  it('leaves the physics wheel points alone', () => {
    const body = bodyOf('scout');
    const before = JSON.stringify(wheelMounts(body));
    drawnWheelPoints(body);
    expect(JSON.stringify(wheelMounts(body))).toBe(before);
  });
});
