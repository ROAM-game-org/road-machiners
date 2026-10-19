import { beforeAll, describe, expect, it } from 'vitest';
import { RULES } from '../data/rules';
import { budget } from '../test/budget';
import { initPhysics } from './drive';
import { meet } from './traffic-meet-kit';

beforeAll(async () => {
  await initPhysics();
});

const SPEEDS = [4, 7];
const SECONDS = [2, 2.5];

describe.each([
  

  ['from the right at 90 degrees', Math.PI / 2],
  ['from the left at 90 degrees', -Math.PI / 2],
  ['from the right at 135 degrees', 3 * Math.PI / 4],
  ['from the left at 135 degrees', -3 * Math.PI / 4],
])('the player on a route meets a trader %s', (_name, angle) => {
  it.each(SPEEDS.flatMap((speed) => SECONDS.map((seconds) => [speed, seconds] as const)))('at speed %i, %d seconds from the crossing', (speed, seconds) => {
    const { impacts, arrivedIn } = meet(angle, speed, seconds);
    expect(impacts.filter((i) => i >= RULES.collisionMinImpact)).toEqual([]);
    expect(arrivedIn).not.toBeNull();
  }, budget(120_000));
});
