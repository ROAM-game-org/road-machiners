import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../phys/drive';
import { parseLineup, runFight, type FightReport } from './combat-harness';
import { FIGHT } from './combat-fight';

export function describeArenaSeeds(seeds: readonly number[], aFledOnDev: number): void {
  const outcomes = new Map<number, FightReport['outcome']>();

  beforeAll(async () => {
    await initPhysics();
  });

  describe('combat harness arena', () => {
    for (const seed of seeds) {
      it(`a damaged arena fighter turns back when it cannot escape for repairs, seed ${seed}`, () => {
        outcomes.set(seed, runFight({ ...FIGHT, a: parseLineup('buggy'), b: parseLineup('buggy'), seed, maxTurns: 200, arena: 9 }).outcome);
      });
    }

    it(`ends an arena fight decisively on some seed and has side a flee on no more than ${aFledOnDev} of seeds ${seeds.join(', ')}, as dev does`, () => {
      const results = seeds.map((seed) => {
        const outcome = outcomes.get(seed);
        if (outcome === undefined) throw new Error(`The arena fight of seed ${seed} did not run`);
        return outcome;
      });
      if (results.every((o) => o === 'timeout')) throw new Error(`No seed of ${seeds.join(', ')} ended its arena fight before the turn limit`);
      expect(results.filter((o) => o === 'a fled').length).toBeLessThanOrEqual(aFledOnDev);
    });
  });
}
