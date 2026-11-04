import { beforeAll, describe, expect, it } from 'vitest';
import { RULES } from '../data/rules';
import { budget } from '../test/budget';
import { initPhysics } from './drive';
import { overtake } from './traffic-meet-kit';

beforeAll(async () => {
  await initPhysics();
});

describe('the player on a route catches up with a loaded hauler on the road', () => {
  it('passes it within 25 turns with no crash and never slows below it once it swerves', () => {
    const { passedIn, impacts, slowTurns } = overtake(1);
    expect(passedIn).not.toBeNull();
    expect(impacts.filter((i) => i >= RULES.collisionMinImpact)).toEqual([]);
    expect(slowTurns).toBe(0);
  }, budget(120_000));
});
