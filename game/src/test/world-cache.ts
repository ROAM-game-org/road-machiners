import type { World } from '../sim/types';
import { cloneWorld } from '../sim/world';

const built = new Map<string, World>();

export function reusedWorld(key: string, build: () => World): World {
  let world = built.get(key);
  if (!world) {
    world = build();
    built.set(key, world);
  }
  return cloneWorld(world);
}
