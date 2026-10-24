import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { addGoods } from './inventory';
import { climbGrade } from './stats';
import { addVehicle, emptyWorld } from './testkit';

describe('reference climb of survey reach', () => {
  it('is the planned climb of a stock buggy with a gun and plates under a full load of scrap', () => {
    const w = emptyWorld();
    const buggy = addVehicle(w, 'independent', 'buggy', ['mg', 'stockEngine', 'plates'], { x: 30, y: 30 });
    addGoods(w, buggy, 'scrap', 999);
    const step = REGION.navigation.climbStep;
    expect(Math.floor(climbGrade(w, buggy) / step + 1e-9) * step).toBeCloseTo(REGION.navigation.reachClimb, 9);
  });
});
