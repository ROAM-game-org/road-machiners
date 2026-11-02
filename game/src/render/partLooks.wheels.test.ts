import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { wheelMounts } from '../phys/body';
import { bodyOf, unitsOf } from '../sim/body';
import { TRUCK_LOOK, drawnWheelPoints } from './partLooks';

describe('drawnWheelPoints', () => {
  it.each(Object.keys(CHASSIS))('%s: keeps the physics wheel order and height and pushes each wheel outward', (id) => {
    for (const unit of unitsOf(id)) {
      const physics = wheelMounts(unit.body, unit.index);
      const drawn = drawnWheelPoints(unit.body, unit.index);
      const tandem = unit.body.tandem ?? 0;
      expect(drawn).toHaveLength(physics.length + (unit.body.tandem === null ? 0 : 2));
      drawn.forEach((d, i) => {
        const own = physics[d.follows];
        expect(d.follows).toBe(i < physics.length ? i : d.follows);
        expect(d.x).toBe(i < physics.length ? own.x : own.x + tandem);
        expect(d.y).toBe(own.y);
        expect(Math.sign(d.z)).toBe(Math.sign(own.z));
        expect(Math.abs(d.z) - Math.abs(own.z)).toBeCloseTo(TRUCK_LOOK.wheelPush, 9);
      });
    }
  });

  it('draws the semi a second rear axle on each unit, ahead of its physics rear axle, that follows the rear wheel on its side', () => {
    for (const unit of unitsOf('semi')) {
      const physics = wheelMounts(unit.body, unit.index);
      const twins = drawnWheelPoints(unit.body, unit.index).slice(physics.length);
      expect(twins.map((t) => physics[t.follows].x < 0)).toEqual([true, true]);
      expect(twins.map((t) => Math.sign(t.z))).toEqual(twins.map((t) => Math.sign(physics[t.follows].z)));
    }
  });

  it('leaves the physics wheel points alone', () => {
    const body = bodyOf('scout');
    const before = JSON.stringify(wheelMounts(body, 0));
    drawnWheelPoints(body, 0);
    expect(JSON.stringify(wheelMounts(body, 0))).toBe(before);
  });
});
