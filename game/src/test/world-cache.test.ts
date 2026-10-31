import { describe, expect, it } from 'vitest';
import { NPCS, SPAWN } from '../data/npcs';
import { standardWorld } from './world-cache';

describe('the shared start world', () => {
  it('has its whole roster placed and an empty spawn queue', () => {
    const world = standardWorld(1);
    expect(world.spawnQueue).toEqual([]);
    const placed = world.vehicles.filter((v) => v.brain && NPCS[v.brain.templateId]);
    expect(placed.length).toBeGreaterThanOrEqual(SPAWN.initial.length);
  });
});
