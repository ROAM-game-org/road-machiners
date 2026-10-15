import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { coreParts, mountedParts } from './grid';
import { generateNpcLoadout } from './npc-loadout';
import { spawnAt } from './spawn';
import { isStranded } from './stats';
import { emptyWorld } from './testkit';
import { budget } from '../test/budget';
import { describeLoadout, useLoadoutFixture } from './npc-loadout-kit';

useLoadoutFixture();

describe('NPC loadout tables', () => {
  it('every chassis in every table holds the speed floor on its most worn engine', () => {
    for (const tpl of Object.values(NPCS)) {
      for (const { value } of tpl.loadout.chassis) {
        for (let seed = 1; seed <= 3; seed++) {
          const world = { ...emptyWorld(), rngState: seed, marketRng: { rngState: seed * 104729 + 1 } };
          expect(() => generateNpcLoadout(world, tpl, value, 'poor'), `${tpl.id} on ${value}`).not.toThrow();
        }
      }
    }
  }, budget(120_000));

  it('every rolled truck can drive: one working engine, one transmission, a cab, a tank and wheels', () => {
    for (const tpl of Object.values(NPCS)) {
      for (const { value } of tpl.loadout.chassis) {
        for (let seed = 1; seed <= 2; seed++) {
          const world = emptyWorld();
          world.rngState = seed;
          const v = spawnAt(world, tpl, generateNpcLoadout(world, tpl, value), { x: 40, y: 30 });
          const label = `${tpl.id} on ${value} seed ${seed}: ${describeLoadout(v)}`;
          expect(coreParts(v, 'transmission'), label).toHaveLength(1);
          expect(coreParts(v, 'cab'), label).toHaveLength(1);
          expect(coreParts(v, 'tank'), label).toHaveLength(1);
          expect(coreParts(v, 'wheel').length, label).toBeGreaterThanOrEqual(4);
          expect(mountedParts(v, 'engine'), label).toHaveLength(1);
          expect(isStranded(world, v), label).toBe(false);
        }
      }
    }
  }, budget(120_000));
});
