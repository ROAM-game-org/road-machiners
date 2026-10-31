import { describe, expect, it } from 'vitest';
import { GEAR_LEVEL_IDS } from '../data/npcs';
import { armedTemplates, realGuns, rolled, useLoadoutFixture } from './npc-loadout-kit';

export const EVEN_ARMED = armedTemplates.filter((_, i) => i % 2 === 0);
export const ODD_ARMED = armedTemplates.filter((_, i) => i % 2 === 1);

export function checkArmedTemplates(templates: typeof armedTemplates): void {
  useLoadoutFixture();

  describe('armed NPC loadouts', () => {
    it.each(templates.map((template) => [template.id, template] as const))('%s always mounts a real gun, at every gear level', (_id, template) => {
      for (const level of GEAR_LEVEL_IDS) for (let seed = 1; seed <= 10; seed++) expect(realGuns(rolled(template, level, seed)).length, `${level} seed ${seed}`).toBeGreaterThan(0);
    });
  });
}
