import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../phys/drive';
import { forceOption } from '../sim/testkit';
import { parseLineup, runFight } from './combat-harness';
import { FIGHT } from './combat-fight';

beforeAll(async () => {
  await initPhysics();
});

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('names the courier side when it flees a stronger truck', () => {
  const outcomes: string[] = [];
  it.each(SEEDS)('plays seed %i', (seed) => {
    forceOption('truceOffered', 'refuse');
    forceOption('mercyBegged', 'finish');
    outcomes.push(runFight({ ...FIGHT, a: parseLineup('merc:snowball'), b: parseLineup('courier:courier@poor@courier#2'), seed, maxTurns: 40 }).outcome);
  });

  it('sees the courier flee before the other side does', () => {
    expect(outcomes.find((outcome) => outcome === 'a fled' || outcome === 'b fled')).toBe('b fled');
  });
});
