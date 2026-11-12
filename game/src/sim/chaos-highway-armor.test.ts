import { describe, expect, it } from 'vitest';
import { mountedParts } from './grid';
import { rollStretch } from './stretch-roll';
import { chaosHighwayWorld } from './testkit';
import { reusedWorld } from '../test/world-cache';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function plannedTrucks(stretch: number) {
  return SEEDS.flatMap((seed) => {
    const world = reusedWorld(`chaos highway ${seed}`, () => chaosHighwayWorld(seed));
    return rollStretch(world, stretch, 1).groups.flat();
  });
}

describe('Chaos Highway group armor', () => {
  for (const stretch of [3, 4]) {
    it(`sends mostly armored trucks on stretch ${stretch}`, () => {
      const trucks = plannedTrucks(stretch);
      const armored = trucks.filter((t) => mountedParts(t.vehicle, 'armor').length > 0).length;
      expect(trucks.length).toBeGreaterThan(0);
      expect(armored * 2, `stretch ${stretch}: ${armored} of ${trucks.length} trucks carry armor`).toBeGreaterThan(trucks.length);
    });
  }
});
