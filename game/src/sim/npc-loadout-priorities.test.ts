import { describe, expect, it } from 'vitest';
import { GEAR_LEVELS, NPCS, PRIORITY_TOP, type GearLevel, type LoadoutPriorities, type NpcTemplate } from '../data/npcs';
import { partDef, type EngineDef, type WeaponDef } from '../data/parts';
import { gunSpans } from './armor';
import { makeVehicle } from './factory';
import { baseGrid, facingOf, itemCells, mountedItems, mountedParts } from './grid';
import { vehicleStats } from './stats';
import { wornDef } from './wear';
import { fallbackFaction } from './spawn';
import type { Vehicle } from './types';
import { budget } from '../test/budget';
import { fixture, gearCost, loadoutOf, rolled, useLoadoutFixture } from './npc-loadout-kit';

useLoadoutFixture();

describe('NPC equipment priorities', () => {
  const withPriorities = (template: NpcTemplate, change: Partial<LoadoutPriorities>): NpcTemplate => ({ ...template, loadout: { ...template.loadout, priorities: { ...template.loadout.priorities, ...change } } });
  const ROLLS = 8;
  const average = (template: NpcTemplate, level: GearLevel | null, of: (v: Vehicle) => number) => {
    let total = 0;
    for (let seed = 1; seed <= ROLLS; seed++) total += of(rolled(template, level, seed));
    return total / ROLLS;
  };
  const guns = (v: Vehicle) => mountedItems(v, 'weapon').filter((item) => !(partDef(item.part.defId) as WeaponDef).line).length;
  const edgeCells = (v: Vehicle) => baseGrid(v.chassisId).cells.flat().filter((cell) => cell === 'F' || cell === 'L' || cell === 'R' || cell === 'B').length;
  const coverage = (v: Vehicle) => mountedItems(v, 'armor').reduce((sum, item) => sum + itemCells(item).length, 0) / edgeCells(v);
  const topSpeed = (v: Vehicle) => vehicleStats(fixture, v).maxSpeed;


  describe('loadout priorities', () => {
    it('gives more armor coverage for more armor priority', () => {
      const armor = (priority: number) => average(withPriorities(NPCS.gunwagon, { armor: priority }), 'standard', coverage);
      expect(armor(PRIORITY_TOP)).toBeGreaterThan(armor(0));
    }, budget(120_000));

    it('keeps a faster truck for more speed priority', () => {
      const speed = (priority: number) => average(withPriorities(NPCS.merc, { speed: priority }), 'standard', topSpeed);
      expect(speed(PRIORITY_TOP)).toBeGreaterThan(speed(0));
    }, budget(120_000));

    it('gives more guns for more firepower priority', () => {
      const firepower = (priority: number) => average(withPriorities(NPCS.gunwagon, { firepower: priority }), 'standard', guns);
      expect(firepower(PRIORITY_TOP)).toBeGreaterThan(firepower(0));
    }, budget(120_000));
    it('picks engines a wallet can feed: no role runs on turbines and the average burn stays near a stock engine', () => {
      const engineOf = (v: Vehicle) => mountedParts(v, 'engine')[0].defId;
      const fuelUse = (v: Vehicle) => wornDef<EngineDef>(mountedParts(v, 'engine')[0]).fuelMult;
      for (const template of Object.values(NPCS)) {
        const trucks = Array.from({ length: ROLLS }, (_, i) => rolled(template, null, i + 1));
        expect(trucks.filter((v) => engineOf(v) === 'turbine').length, template.id).toBeLessThanOrEqual(ROLLS / 4);
        expect(trucks.reduce((sum, v) => sum + fuelUse(v), 0) / ROLLS, template.id).toBeLessThan(1.5);
      }
    }, budget(240_000));
  });

  it('armors at least 80% of the edge cells on most loaded trucks', () => {
    const choices = Object.values(NPCS).flatMap((template) => template.loadout.chassis.map((c) => ({ template, chassisId: c.value })));
    const covered = choices.filter(({ template, chassisId }, i) => {
      const world = { ...fixture, rngState: i + 1, marketRng: { rngState: (i + 1) * 104729 + 1 } };
      const loadout = loadoutOf(world, template, chassisId, 'loaded');
      return coverage(makeVehicle(world, { ...loadout, faction: fallbackFaction(template), brain: null, pos: { x: 50, y: 50 }, heading: 0 })) >= 0.8;
    });
    expect(covered.length / choices.length).toBeGreaterThan(0.6);
  }, budget(120_000));

  it('keeps a poor truck within its gear money', () => {
    for (const template of Object.values(NPCS)) {
      for (let seed = 1; seed <= 4; seed++) {
        const loadout = loadoutOf({ ...fixture, rngState: seed }, template, null, 'poor');
        expect(gearCost(loadout.parts), template.id).toBeLessThanOrEqual(GEAR_LEVELS.poor.money);
      }
    }
  });

  it('lets a poor driver buy some armor', () => {
    const armor = (v: Vehicle) => (mountedItems(v, 'armor').length > 0 ? 1 : 0);
    expect(average(NPCS.courier, 'poor', armor)).toBeGreaterThanOrEqual(0.75);
  }, budget(120_000));

  it('mounts some guns facing a flank or the rear', () => {
    let turned = 0;
    for (const template of [NPCS.gunwagon, NPCS.merc, NPCS.convoyGuard]) {
      for (let seed = 1; seed <= 8; seed++) {
        const v = rolled(template, 'standard', seed);
        for (const item of mountedItems(v, 'weapon')) {
          if (facingOf(item) === 0) continue;
          turned++;
          expect(gunSpans(v, item).length).toBeGreaterThan(0);
        }
      }
    }
    expect(turned).toBeGreaterThan(0);
  }, budget(120_000));
});
