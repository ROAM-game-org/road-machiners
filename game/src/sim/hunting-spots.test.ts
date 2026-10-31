import { describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { makeHuntingSpots, preyTraffic } from './hunting-spots-bake';
import { huntingSpots } from './hunting-spots';
import { defaultSetup } from './settings';
import { newWorld } from './world';

describe('hunting spots', () => {
  it('are the spots the bake would pick now', () => {
    const world = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
    const bake = makeHuntingSpots(world, preyTraffic(world, () => {}));
    const { spots, samples } = huntingSpots(TEST_MAP);
    expect({ spots, samples }).toEqual(JSON.parse(JSON.stringify(bake)));
  }, 60_000);

  it('refuse a map they were not baked for', () => {
    expect(() => huntingSpots({ hash: 'other', terrain: TEST_MAP.terrain })).toThrow(/Run npm run old-spots/);
  });
});
