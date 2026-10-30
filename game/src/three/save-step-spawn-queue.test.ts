import { describe, expect, it } from 'vitest';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

const step = (world: SavedJson): SavedJson => TINY_STEPS[129 - TINY_FROM].step(structuredClone(world));

describe('save migration 129 to 130, the start roster spawns over the first turns', () => {
  it('gives an old save an empty queue, since its roster is already on the map', () => {
    const saved: SavedJson = { turn: 40, spawnTimer: { buggy: 3 }, vehicles: [{ id: 'v-buggy' }] };

    expect(step(saved)).toEqual({ ...saved, spawnQueue: [] });
  });
});
