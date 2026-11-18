import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../data/physics';
import { REGION } from '../data/region';
import { addGoods } from './inventory';
import { climbGrade } from './stats';
import { addVehicle, emptyWorld } from './testkit';

describe('reference climb of survey reach', () => {
  it('is the planned climb of a stock courier with a gun, plates and a hauling rack under a full load of scrap', () => {
    const w = emptyWorld();
    const buggy = addVehicle(w, 'independent', 'courier', ['mg', 'stockEngine', 'plates', 'haulingRack'], { x: 30, y: 30 });
    addGoods(w, buggy, 'scrap', 999);
    const step = REGION.navigation.climbStep;
    expect(Math.floor(climbGrade(w, buggy) / step + 1e-9) * step).toBeCloseTo(REGION.navigation.reachClimb, 9);
  });
});

describe('the steepest planned climb', () => {
  it('stops at the grade a truck nose still clears, however strong the engine', () => {
    const w = emptyWorld();
    const scout = addVehicle(w, 'independent', 'scout', ['tunedEngine'], { x: 30, y: 30 });
    expect(climbGrade(w, scout)).toBe(PHYSICS.truck.maxClimbGrade);
  });
});
