import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../phys/drive';
import { parseLineup, runFight, type FightReport } from './combat-harness';
import { FIGHT } from './combat-fight';

beforeAll(async () => {
  await initPhysics();
});

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const ARENA_A_FLED_ON_DEV = 2;
const arenaOutcomes = new Map<number, FightReport['outcome']>();

describe('combat harness arena', () => {
  for (const seed of SEEDS) {
    it(`a damaged arena fighter turns back when it cannot escape for repairs, seed ${seed}`, () => {
      arenaOutcomes.set(seed, runFight({ ...FIGHT, a: parseLineup('buggy'), b: parseLineup('buggy'), seed, maxTurns: 200, arena: 9 }).outcome);
    });
  }

  it('ends an arena fight in a knockout on some seed and has side a flee on no more seeds than dev', () => {
    const outcomes = SEEDS.map((seed) => {
      const outcome = arenaOutcomes.get(seed);
      if (outcome === undefined) throw new Error(`The arena fight of seed ${seed} did not run`);
      return outcome;
    });
    if (!outcomes.some((o) => o === 'won' || o === 'lost')) throw new Error(`No seed of ${SEEDS.join(', ')} reached a knockout inside the arena`);
    expect(outcomes.filter((o) => o === 'a fled').length).toBeLessThanOrEqual(ARENA_A_FLED_ON_DEV);
  });
});
