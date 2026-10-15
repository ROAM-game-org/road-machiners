import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { GEAR_LEVELS, NPCS, type GearLevel } from '../data/npcs';
import { PARTS, partDef } from '../data/parts';
import { START_KITS } from '../data/start';
import { cloneWorld, newWorld } from './world';
import { CONDITION } from '../data/wear';
import { makeVehicle } from './factory';
import { freeCells, isMounted, mountedItems } from './grid';
import { vehicleMass } from './mass';
import { generateNpcLoadout, sampleWeighted } from './npc-loadout';
import { spawnAt } from './spawn';
import { npcMassRoom } from './stats';
import { emptyWorld } from './testkit';
import { TEST_MAP } from '../test/map';
import { budget } from '../test/budget';
import { defaultSetup } from './settings';
import type { Vehicle } from './types';
import { fixture, loadoutOf, useLoadoutFixture } from './npc-loadout-kit';

useLoadoutFixture();

describe('part wear', () => {
  it.each(Object.values(NPCS))('rolls a wear step within the level wear table for every mounted, non-core part of $id', (template) => {
    const rolled = new Set<number>();
    for (let seed = 1; seed <= 10; seed++) {
      const loadout = loadoutOf({ ...fixture, rngState: seed, marketRng: { rngState: seed * 7919 } }, template);
      const allowed = new Set(GEAR_LEVELS[loadout.level].wear.map((entry) => entry.value));
      for (const { defId: id, wear } of loadout.parts) {
        expect(wear, id).toBeGreaterThanOrEqual(0);
        expect(wear, id).toBeLessThanOrEqual(CONDITION.maxWear);
        expect(allowed, id).toContain(wear);
        rolled.add(wear);
      }
    }
    expect(rolled.size, `${template.id} wear variety`).toBeGreaterThan(1);
  });

  it('rolls the same wear for the same seed', () => {
    const loadoutA = generateNpcLoadout({ ...fixture, rngState: 7 }, NPCS.trader);
    const loadoutB = generateNpcLoadout({ ...fixture, rngState: 7 }, NPCS.trader);
    expect(loadoutA.parts).toEqual(loadoutB.parts);
    expect(loadoutA.spares).toEqual(loadoutB.spares);
  });

  it('gives the same loadout for the same inputs in any call order', () => {
    const rolled = (id: string, seed: number, level: GearLevel) => {
      const w = emptyWorld();
      w.rngState = seed;
      const loadout = generateNpcLoadout(w, NPCS[id], null, level);
      return { loadout, rngState: w.rngState, marketRng: w.marketRng, nextId: w.nextId };
    };
    const first = rolled('gunwagon', 3, 'loaded');
    rolled('trader', 5, 'poor');
    expect(rolled('gunwagon', 3, 'loaded')).toEqual(first);
  });

  it('makes pristine parts rare and near-junk parts common at the standard level', () => {
    const wears: number[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      for (const p of loadoutOf({ ...fixture, rngState: seed, marketRng: { rngState: seed * 7919 } }, NPCS.trader, null, 'standard').parts) wears.push(p.wear);
    }
    const share = (wear: number) => wears.filter((w) => w === wear).length / wears.length;
    expect(share(0)).toBeLessThan(0.08);
    expect(share(CONDITION.maxWear)).toBeGreaterThan(0.4);
  });

  it('a poor level wears parts more than a loaded one', () => {
    const mean = (level: GearLevel) => {
      let sum = 0, n = 0;
      for (let seed = 1; seed <= 12; seed++) {
        for (const p of loadoutOf({ ...fixture, rngState: seed, marketRng: { rngState: seed * 7919 } }, NPCS.merc, null, level).parts) [sum, n] = [sum + p.wear, n + 1];
      }
      return sum / n;
    };
    expect(mean('poor')).toBeGreaterThan(mean('loaded'));
  });
});

describe('trader spare parts', () => {
  it('carries rolled spares when it has grid room and rated mass to spare', () => {
    const template = structuredClone(NPCS.trader);
    template.loadout.chassis = [{ value: 'hauler', weight: 1 }];
    template.loadout.cargoPart = [{ value: null, weight: 1 }];
    template.loadout.goods = [{ value: null, weight: 1 }];
    template.loadout.spares = { pool: [{ value: 'steelPlate', weight: 1 }], count: [{ value: 2, weight: 1 }] };
    const loadout = loadoutOf({ ...fixture, rngState: 5 }, template, null, 'poor');
    expect(loadout.spares.length).toBeGreaterThan(0);
    for (const spare of loadout.spares) {
      expect(spare.defId).toBe('steelPlate');
      expect(spare.wear).toBeGreaterThanOrEqual(0);
      expect(spare.wear).toBeLessThanOrEqual(CONDITION.maxWear);
    }
  });

  it('carries no more spares than the rated mass takes', () => {
    const template = structuredClone(NPCS.trader);
    template.loadout.chassis = [{ value: 'buggy', weight: 1 }];
    template.loadout.cargoPart = [{ value: null, weight: 1 }];
    template.loadout.goods = [{ value: null, weight: 1 }];
    const heaviest = Object.values(PARTS).filter((d) => d.kind !== 'core').reduce((a, d) => (d.mass > a.mass ? d : a));
    const count = Math.ceil(CHASSIS.buggy.ratedMass / heaviest.mass);
    template.loadout.spares = { pool: [{ value: heaviest.id, weight: 1 }], count: [{ value: count, weight: 1 }] };

    const loadout = loadoutOf({ ...fixture, rngState: 3 }, template, null, 'standard');
    const truck = makeVehicle(fixture, { ...loadout, cargo: {}, faction: template.faction, brain: null, pos: { x: 50, y: 50 }, heading: 0 });

    expect(loadout.spares.length).toBeLessThan(count);
    expect(vehicleMass(truck)).toBeLessThanOrEqual(CHASSIS.buggy.ratedMass);
  });

  it('never rolls spares for a template with no spare table', () => {
    const loadout = loadoutOf({ ...fixture, rngState: 3 }, NPCS.buggy);
    expect(loadout.spares).toEqual([]);
  });
});

describe('weighted equipment rolls', () => {
  it('draws rare equipment less often than common equipment', () => {
    const rng = { rngState: 42 };
    const pool = [{ value: 'common', weight: 9 }, { value: 'rare', weight: 1 }];
    const rolls = Array.from({ length: 1000 }, () => sampleWeighted(rng, pool));
    const rare = rolls.filter((value) => value === 'rare').length;
    expect(rare).toBeGreaterThan(0);
    expect(rare).toBeLessThan(200);
  });

  it.each([0, -1, NaN, Infinity])('rejects weight %s before consuming randomness', (weight) => {
    const rng = { rngState: 42 };
    expect(() => sampleWeighted(rng, [{ value: 'bad', weight }])).toThrow(/weights/);
    expect(rng.rngState).toBe(42);
  });

  it('rejects an empty pool and overflowing total', () => {
    const rng = { rngState: 42 };
    expect(() => sampleWeighted(rng, [])).toThrow(/Empty/);
    expect(() => sampleWeighted(rng, [{ value: 'a', weight: Number.MAX_VALUE }, { value: 'b', weight: Number.MAX_VALUE }])).toThrow(/total/);
    expect(rng.rngState).toBe(42);
  });
});

describe('spawned NPCs', () => {
  it('carry the rolled wear and spares into the world', () => {
    const first = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const npcs = first.vehicles.filter((v) => v.brain !== null);
    const parts = npcs.flatMap((v) => v.items.flatMap((it) => (it.kind === 'part' && partDef(it.part.defId).kind !== 'core' ? [it.part] : [])));
    expect(parts.some((p) => p.wear > 0)).toBe(true);
    const hasLooseSpare = (v: Vehicle) => v.items.some((it) => it.kind === 'part' && !isMounted(v.chassisId, it));
    let carriesSpares = first.vehicles.some((v) => v.brain?.templateId === 'trader' && hasLooseSpare(v));
    for (let seed = 2; seed <= 4 && !carriesSpares; seed++) {
      const world = newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
      carriesSpares = world.vehicles.some((v) => v.brain?.templateId === 'trader' && hasLooseSpare(v));
    }
    expect(carriesSpares).toBe(true);
  });
});

describe('raider haul room', () => {
  const RAIDERS = ['buggy', 'gunwagon'];
  const rolled = (id: string, level: GearLevel, seed: number) => {
    const world = { ...cloneWorld(fixture), vehicles: [], rngState: seed * 7919 + 1, marketRng: { rngState: seed * 104729 + 1 } };
    const template = NPCS[id];
    return { template, v: spawnAt(world, template, generateNpcLoadout(world, template, null, level), { x: 40, y: 30 }) };
  };

  it.each(RAIDERS)('keeps room for the reserve after its own load on at least 95%% of %s rolls, armed', (id) => {
    let kept = 0;
    let rolls = 0;
    for (const level of ['standard', 'heavy', 'loaded'] as const) {
      for (let seed = 1; seed <= 20; seed++, rolls++) {
        const { template, v } = rolled(id, level, seed);
        if (freeCells(v) >= template.loadout.haul.cells && npcMassRoom(v) >= template.loadout.haul.kg) kept++;
        expect(mountedItems(v, 'weapon').length).toBeGreaterThan(0);
      }
    }
    expect(kept / rolls).toBeGreaterThanOrEqual(0.95);
  }, budget(240_000));

  it('rejects a negative or fractional reserve', () => {
    const template = { ...NPCS.buggy, loadout: { ...NPCS.buggy.loadout, haul: { kg: -1, cells: 0 } } };
    expect(() => generateNpcLoadout({ ...fixture }, template)).toThrow(/haul reserves/);
    const fractional = { ...NPCS.buggy, loadout: { ...NPCS.buggy.loadout, haul: { kg: 0, cells: 1.5 } } };
    expect(() => generateNpcLoadout({ ...fixture }, fractional)).toThrow(/haul reserves/);
  });
});
