import { describe, expect, it } from 'vitest';
import { NPC_UTILITY_PARTS } from '../data/npc-utilities';
import { NPCS } from '../data/npcs';
import { gunSpans, spanSides } from './armor';
import { mountedItems } from './grid';
import { generateNpcLoadout } from './npc-loadout';
import { budget } from '../test/budget';
import { fixture, realGuns, sweep, useLoadoutFixture } from './npc-loadout-kit';
import type { Vehicle } from './types';

useLoadoutFixture();

const hasHarpoon = (v: Vehicle) => mountedItems(v, 'weapon').some((item) => item.part.defId === 'harpoon');
const lacksFrontGun = (v: Vehicle) => !realGuns(v).some((item) => spanSides(gunSpans(v, item)).includes('front'));

describe('armed NPC loadout sweeps', () => {
  it('gives every hunter a harpoon beside its gun', () => {
    for (const v of sweep(NPCS.hunter, 40)) expect(hasHarpoon(v)).toBe(true);
  }, budget(120_000));

  it.each([['buggy', 8], ['gunwagon', 15], ['vulture', 12], ['cavalcade', 39], ['merc', 11], ['marshal', 13], ['noseArmy', 16], ['bowlFarmer', 17]] as const)('keeps the harpoon on about as many %s as before', (id, before) => {
    const count = sweep(NPCS[id], 40).filter(hasHarpoon).length;
    expect(count).toBeGreaterThanOrEqual(Math.max(3, Math.floor(before * 0.6)));
    expect(count).toBeLessThanOrEqual(Math.ceil(before * 1.4));
  }, budget(120_000));

  it.each(['buggy', 'gunwagon', 'vulture', 'merc', 'marshal', 'noseArmy', 'bowlFarmer'])('puts a real gun on the front of every %s', (id) => {
    expect(sweep(NPCS[id], 40).filter(lacksFrontGun)).toHaveLength(0);
  }, budget(120_000));

  it.each([['cavalcade', 2], ['hunter', 5]] as const)('leaves %s at most %i of 40 without a front gun', (id, most) => {
    expect(sweep(NPCS[id], 40).filter(lacksFrontGun).length).toBeLessThanOrEqual(most);
  }, budget(120_000));

  it('refuses a line gun in the utility pool of a table that is not armed', () => {
    const trader = NPCS.trader;
    NPC_UTILITY_PARTS.trader = [{ value: 'harpoon', weight: 1 }];
    try {
      expect(() => generateNpcLoadout({ ...fixture }, trader)).toThrow(/must be armed/);
    } finally {
      delete NPC_UTILITY_PARTS.trader;
    }
  });
});
