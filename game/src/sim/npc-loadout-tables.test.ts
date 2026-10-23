import { describe, expect, it } from 'vitest';
import { GEAR_LEVELS, NPCS, type NpcTemplate } from '../data/npcs';
import { PARTS } from '../data/parts';
import { makePart, makeVehicle } from './factory';
import { coreParts, mountedParts } from './grid';
import { mountPart } from './inventory';
import { generateNpcLoadout } from './npc-loadout';
import { allegianceFor, spawnAt } from './spawn';
import { isStranded, meetsSpeedFloor } from './stats';
import type { Vehicle } from './types';
import { emptyWorld } from './testkit';
import { budget } from '../test/budget';
import { describeLoadout, useLoadoutFixture } from './npc-loadout-kit';

useLoadoutFixture();

const ENGINES = Object.values(PARTS).filter((d) => d.kind === 'engine').map((d) => d.id);
const WEARS = [...new Set(Object.values(GEAR_LEVELS).flatMap((level) => level.wear.map((w) => w.value)))];

function withPart(v: Vehicle, defId: string, wear: number): Vehicle | null {
  const world = emptyWorld();
  const next = { ...v, items: [...v.items] };
  return mountPart(world, next, makePart(world, defId, wear)) ? next : null;
}

function strandedCargoRolls(tpl: NpcTemplate): string[] {
  if (tpl.loadout.cargoPart.some((entry) => entry.value === null)) return [];
  return tpl.loadout.chassis.flatMap(({ value: chassisId }) => {
    const bare = makeVehicle(emptyWorld(), { faction: 'independent', chassisId, parts: [], spares: [], cargo: {}, pos: { x: 0, y: 0 }, heading: 0, brain: null });
    return ENGINES.flatMap((engine) => WEARS.flatMap((wear) => {
      const powered = withPart(bare, engine, wear);
      if (!powered || !meetsSpeedFloor(powered, 0)) return [];
      const carries = tpl.loadout.cargoPart.some(({ value }) => {
        const loaded = withPart(powered, value!, 0);
        return loaded !== null && meetsSpeedFloor(loaded, 0);
      });
      return carries ? [] : [`${tpl.id} on ${chassisId} with ${engine} at wear ${wear}`];
    }));
  });
}

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

  it('lets every truck that must carry a cargo part take one on any engine that holds the speed floor', () => {
    expect(Object.values(NPCS).flatMap(strandedCargoRolls)).toEqual([]);
  });

  it('every rolled truck can drive: one working engine, one transmission, a cab, a tank and wheels', () => {
    for (const tpl of Object.values(NPCS)) {
      for (const { value } of tpl.loadout.chassis) {
        for (let seed = 1; seed <= 2; seed++) {
          const world = emptyWorld();
          world.rngState = seed;
          const v = spawnAt(world, tpl, generateNpcLoadout(world, tpl, value), { x: 40, y: 30 }, allegianceFor(world, tpl, null, null));
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
