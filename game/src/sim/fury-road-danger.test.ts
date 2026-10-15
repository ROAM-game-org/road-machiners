import { describe, expect, it } from 'vitest';
import { FURY_ROAD } from '../data/modes';
import { dangerPercent, enemyTrucks, expectedGear, floorOf, gearMoneyOf, groupSizes, payOf } from './fury-road-danger';
import { NPCS } from '../data/npcs';
import { PARTS } from '../data/parts';
import { HAULER_KIT } from '../data/start';
import { waveOf } from './fury-road';
import { generateNpcLoadout } from './npc-loadout';
import { furyRoadWorld } from './testkit';
import type { World } from './types';

const START_GEAR = [...['mg', 'stockEngine'], ...HAULER_KIT.parts].reduce((sum, id) => sum + PARTS[id].value, 0);
const STRETCHES = Array.from({ length: 50 }, (_, i) => i + 1);
const GROWTHS = [0, 0.25, 1, 2];

function withGrowth(growth: number): World {
  const w = furyRoadWorld();
  return { ...w, setup: { ...w.setup, settings: { ...w.setup.settings, enemyGearGrowth: growth } } };
}

describe('Fury Road danger', () => {
  it('starts with one truck at the floor money, and rises by the growth setting each stretch', () => {
    const w = withGrowth(1);

    expect(expectedGear(w, 1)).toBe(START_GEAR);
    expect(Math.round((FURY_ROAD.danger.firstPercent / 100) * START_GEAR)).toBeLessThan(floorOf(1));
    expect(gearMoneyOf(w, 1)).toBe(floorOf(1));
    expect(enemyTrucks(w, 1)).toBe(1);
    expect(expectedGear(w, 2)).toBe(START_GEAR + FURY_ROAD.danger.gearShare * payOf(1));
    const share = Math.min(dangerPercent(w, 12) / enemyTrucks(w, 12), FURY_ROAD.danger.truckPercent);
    expect(gearMoneyOf(w, 12)).toBe(Math.max(floorOf(12), Math.round((share / 100) * expectedGear(w, 12))));
    expect([1, 2, 3].map((j) => dangerPercent(w, j))).toEqual([45, 55, 65]);
    expect(dangerPercent(withGrowth(2), 3)).toBe(85);
    expect(dangerPercent(withGrowth(0), 50)).toBe(45);
  });

  it('adds a truck only once every truck still gets at least the truck floor share of the expected gear', () => {
    const w = withGrowth(1);

    expect([1, 2, 4, 5, 10, 11, 17, 18].map((j) => enemyTrucks(w, j))).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
    expect(STRETCHES.every((j) => enemyTrucks(withGrowth(0), j) === 1)).toBe(true);
    for (const growth of GROWTHS) {
      const g = withGrowth(growth);
      for (const j of STRETCHES) if (enemyTrucks(g, j) > 1) expect(dangerPercent(g, j) / enemyTrucks(g, j)).toBeGreaterThanOrEqual(FURY_ROAD.danger.truckFloorPercent);
    }
  });

  it('arms every template of every pool tier with a gun at the least gear money of its first stretch', () => {
    const w = withGrowth(0);
    for (const [i, tier] of FURY_ROAD.pool.entries()) {
      const j = i === 0 ? 1 : FURY_ROAD.pool[i - 1].upTo + 1;
      const gear = { ...waveOf(j).gear, money: gearMoneyOf(w, j) };
      for (const template of Object.keys(tier.weights)) {
        for (let seed = 1; seed <= 40; seed++) {
          const loadout = generateNpcLoadout({ ...w, rngState: seed }, NPCS[template], null, waveOf(j).level, gear);
          expect(loadout.parts.some((p) => PARTS[p.defId].kind === 'weapon'), `${template} seed ${seed}`).toBe(true);
        }
      }
    }
  });

  it('never lowers the danger, the truck count, the total enemy gear or the pay from one stretch to the next', () => {
    for (const growth of GROWTHS) {
      const w = withGrowth(growth);
      const rows = STRETCHES.map((j) => ({ danger: dangerPercent(w, j), trucks: enemyTrucks(w, j), total: gearMoneyOf(w, j) * enemyTrucks(w, j), pay: payOf(j) }));
      rows.slice(1).forEach((row, i) => {
        const before = rows[i];
        expect(row.danger, `growth ${growth} stretch ${i + 2}`).toBeGreaterThanOrEqual(before.danger);
        expect(row.trucks).toBeGreaterThanOrEqual(before.trucks);
        expect(row.total).toBeGreaterThanOrEqual(before.total);
        expect(row.pay).toBeGreaterThan(before.pay);
      });
    }
  });

  it('never budgets one truck above its share of the expected player gear', () => {
    for (const growth of GROWTHS) {
      const w = withGrowth(growth);
      for (const j of STRETCHES) expect(gearMoneyOf(w, j)).toBeLessThanOrEqual(Math.max(floorOf(j), Math.round((FURY_ROAD.danger.truckPercent / 100) * expectedGear(w, j))));
    }
  });

  it('pays more every stretch with no cap, and a beaten truck pays nothing', () => {
    const { base } = FURY_ROAD.pay;

    expect(payOf(1)).toBe(base.first);
    expect(payOf(2)).toBe(base.first + base.step);
    expect(payOf(100)).toBe(base.first + 99 * base.step);
    expect(FURY_ROAD.pay).not.toHaveProperty('perWreck');
  });

  it('splits trucks into the fewest groups of at most the group size, as even as they go', () => {
    expect([1, 2, 3, 4, 5, 7, 9].map(groupSizes)).toEqual([[1], [2], [3], [2, 2], [3, 2], [3, 2, 2], [3, 3, 3]]);
    expect(() => groupSizes(0)).toThrow(/whole number/);
    expect(() => dangerPercent(withGrowth(1), 0)).toThrow(/not a stretch/);
  });
});
