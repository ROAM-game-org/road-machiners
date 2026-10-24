import { describe, expect, it } from 'vitest';
import { NPC_UTILITY_PARTS } from '../data/npc-utilities';
import { GEAR_LEVEL_IDS, NPCS, type NpcTemplate } from '../data/npcs';
import { isLineGun, partDef } from '../data/parts';
import { gunSpans, spanSides } from './armor';
import { mountedItems } from './grid';
import { generateNpcLoadout } from './npc-loadout';
import { budget } from '../test/budget';
import { describeLoadout, fixture, rolled, useLoadoutFixture } from './npc-loadout-kit';
import UNARMED_PINS from './npc-loadout-unarmed.json';
import type { Vehicle } from './types';

useLoadoutFixture();

const armedTemplates = Object.values(NPCS).filter((template) => template.loadout.armed);
const harpoonTemplates = armedTemplates.filter((template) => NPC_UTILITY_PARTS[template.id]?.some((entry) => entry.value === 'harpoon'));

const realGuns = (v: Vehicle) => mountedItems(v, 'weapon').filter((item) => !isLineGun(partDef(item.part.defId)));
const hasHarpoon = (v: Vehicle) => mountedItems(v, 'weapon').some((item) => item.part.defId === 'harpoon');
const lacksFrontGun = (v: Vehicle) => !realGuns(v).some((item) => spanSides(gunSpans(v, item)).includes('front'));
const sweep = (template: NpcTemplate, seeds: number) => Array.from({ length: seeds }, (_, i) => rolled(template, null, i + 1));

describe('armed NPC loadouts', () => {
  it.each(armedTemplates.map((template) => [template.id, template] as const))('%s always mounts a real gun, at every gear level', (_id, template) => {
    for (const level of GEAR_LEVEL_IDS) for (let seed = 1; seed <= 25; seed++) expect(realGuns(rolled(template, level, seed)).length, `${level} seed ${seed}`).toBeGreaterThan(0);
  }, budget(240_000));

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

  it.each(Object.keys(UNARMED_PINS))('rolls %s as it did before armed tables', (id) => {
    const pins = (UNARMED_PINS as Record<string, string[]>)[id];
    expect(pins.map((_, i) => describeLoadout(rolled(NPCS[id], null, i + 1)))).toEqual(pins);
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
