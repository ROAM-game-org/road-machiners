import { beforeAll, describe, expect, it } from 'vitest';
import { RULES } from '../data/rules';
import { budget } from '../test/budget';
import { initPhysics } from './drive';
import { meetHeadOn } from './traffic-meet-kit';

beforeAll(async () => {
  await initPhysics();
});

describe.each([
  ['in the same lane', 0],
  ['one lane apart', 1.5],
])('the player on a route meets an oncoming trader %s', (_name, lane) => {
  it.each([4, 7])('at speed %i it passes with no crash and never stops while the trader is far', (speed) => {
    const { impacts, arrivedIn, stalls } = meetHeadOn(lane, speed);
    expect(impacts.filter((i) => i >= RULES.collisionMinImpact)).toEqual([]);
    expect(arrivedIn).not.toBeNull();
    expect(stalls).toBe(0);
  }, budget(120_000));
});
