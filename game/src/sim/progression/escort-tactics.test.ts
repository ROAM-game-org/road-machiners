import { describe, expect, it } from 'vitest';
import { dist } from '../vec';
import { BREAK_BEHIND, BREAK_OFF_BELOW, breakOffPoint, pickTarget, shouldBreakOff } from './escort-tactics';

const hauler = { x: 100, y: 100 };

describe('pickTarget', () => {
  it('picks the foe nearest the hauler', () => {
    const foes = [{ id: 'a', pos: { x: 120, y: 100 } }, { id: 'b', pos: { x: 105, y: 100 } }];
    expect(pickTarget(foes, hauler, null, 60)).toBe('b');
  });

  it('keeps the current target while it lives and stays in reach', () => {
    const foes = [{ id: 'a', pos: { x: 120, y: 100 } }, { id: 'b', pos: { x: 105, y: 100 } }];
    expect(pickTarget(foes, hauler, 'a', 60)).toBe('a');
  });

  it('drops a current target out of reach or gone', () => {
    const foes = [{ id: 'a', pos: { x: 300, y: 100 } }, { id: 'b', pos: { x: 105, y: 100 } }];
    expect(pickTarget(foes, hauler, 'a', 60)).toBe('b');
    expect(pickTarget(foes, hauler, 'gone', 60)).toBe('b');
  });

  it('picks nothing when no foe is in reach', () => {
    expect(pickTarget([{ id: 'a', pos: { x: 500, y: 0 } }], hauler, null, 60)).toBeNull();
  });
});

describe('break off', () => {
  it('leaves the fight only below the threshold', () => {
    expect(shouldBreakOff(BREAK_OFF_BELOW - 0.01)).toBe(true);
    expect(shouldBreakOff(BREAK_OFF_BELOW)).toBe(false);
  });

  it('drives to the hauler side away from the foe', () => {
    const point = breakOffPoint(hauler, { x: 120, y: 100 });
    expect(point.x).toBeLessThan(hauler.x);
    expect(dist(point, hauler)).toBeCloseTo(BREAK_BEHIND);
  });
});
