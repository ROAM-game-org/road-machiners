import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { cloneWorld } from './world';
import { gunSpans } from './armor';
import { mountedItems } from './grid';
import { generateNpcLoadout } from './npc-loadout';
import { spawnAt, spawnInitial, spawnNpcs } from './spawn';
import { emptyWorld } from './testkit';
import { budget } from '../test/budget';
import { describeLoadout, fixture, useLoadoutFixture } from './npc-loadout-kit';

useLoadoutFixture();

describe('NPC equipment generation', () => {
  it('spawns at least five equipment combinations for each base trait', () => {
    const seen: Record<string, Set<string>> = Object.fromEntries(Object.values(NPCS).map((t) => [t.traits[0], new Set<string>()]));
    for (let seed = 1; seed <= 5; seed++) {
      const world = cloneWorld(fixture);
      world.rngState = seed;
      spawnInitial(world);
      for (const v of world.vehicles) {
        if (v.brain) seen[NPCS[v.brain.templateId].traits[0]].add(describeLoadout(v));
      }
    }
    for (const [role, variants] of Object.entries(seen)) expect(variants.size, role).toBeGreaterThanOrEqual(5);
  }, budget(120_000));

  it('uses the same generator for periodic spawns without exceeding existing caps', () => {
    const world = cloneWorld(fixture);
    for (let attempt = 0; attempt < Math.max(...Object.values(NPCS).map((t) => t.cap)) + 2; attempt++) {
      for (const template of Object.values(NPCS)) world.spawnTimer[template.id] = 1;
      spawnNpcs(world);
      world.vehicles.filter((v) => v.brain).forEach((v, i) => { v.pos = { x: 5 + (i % 40) * 4, y: world.size - 5 - Math.floor(i / 40) * 4 }; });
    }
    for (const template of Object.values(NPCS)) {
      const vehicles = world.vehicles.filter((v) => v.brain?.templateId === template.id);
      expect(vehicles.length, template.id).toBe(template.cap);
      expect(new Set(vehicles.map(describeLoadout)).size).toBeGreaterThan(1);
    }
  }, budget(120_000));

  it('repeats the same initial traffic and RNG state for the same seed', () => {
    const a = cloneWorld(fixture);
    const b = cloneWorld(fixture);
    spawnInitial(a);
    spawnInitial(b);
    expect(a.vehicles).toEqual(b.vehicles);
    expect(a.rngState).toBe(b.rngState);
  });
});

describe('NPC gun placement', () => {
  it('never mounts a gun where no open side lets its arc fire', () => {
    for (const id of ['gunwagon', 'buggy', 'noseArmy', 'merc']) {
      for (let seed = 1; seed <= 10; seed++) {
        const w = emptyWorld();
        w.rngState = seed * 7919;
        const v = spawnAt(w, NPCS[id], generateNpcLoadout(w, NPCS[id]), { x: 40, y: 30 });
        for (const item of mountedItems(v, 'weapon')) {
          expect(gunSpans(v, item).length, `${id} seed ${seed} ${item.part.defId}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
