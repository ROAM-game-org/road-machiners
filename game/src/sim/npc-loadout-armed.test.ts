import { describe, expect, it } from 'vitest';
import { GEAR_LEVEL_IDS, NPCS } from '../data/npcs';
import { budget } from '../test/budget';
import { armedTemplates, describeLoadout, realGuns, rolled, useLoadoutFixture } from './npc-loadout-kit';
import UNARMED_PINS from './npc-loadout-unarmed.json';

useLoadoutFixture();

describe('armed NPC loadouts', () => {
  it.each(armedTemplates.map((template) => [template.id, template] as const))('%s always mounts a real gun, at every gear level', (_id, template) => {
    for (const level of GEAR_LEVEL_IDS) for (let seed = 1; seed <= 10; seed++) expect(realGuns(rolled(template, level, seed)).length, `${level} seed ${seed}`).toBeGreaterThan(0);
  }, budget(240_000));

  it.each(Object.keys(UNARMED_PINS))('rolls %s as it did before armed tables', (id) => {
    const pins = (UNARMED_PINS as Record<string, string[]>)[id];
    expect(pins.map((_, i) => describeLoadout(rolled(NPCS[id], null, i + 1)))).toEqual(pins);
  }, budget(120_000));
});
