import { START_KITS } from '../data/start';
import { defaultSetup } from '../sim/settings';
import type { World } from '../sim/types';
import { spawnQueueNow } from '../sim/spawn';
import { cloneWorld, newWorld } from '../sim/world';
import { TEST_MAP } from './map';

const built = new Map<string, World>();

export function reusedWorld(key: string, build: () => World): World {
  let world = built.get(key);
  if (!world) {
    world = build();
    built.set(key, world);
  }
  return cloneWorld(world);
}

export function standardWorld(seed: number): World {
  return reusedWorld(`standard ${seed}`, () => {
    const world = newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    spawnQueueNow(world);
    return world;
  });
}
