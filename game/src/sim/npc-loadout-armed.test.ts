import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { budget } from '../test/budget';
import { describeLoadout, rolled } from './npc-loadout-kit';
import { EVEN_ARMED, checkArmedTemplates } from '../test/npc-loadout-armed-kit';
import UNARMED_PINS from './npc-loadout-unarmed.json';

checkArmedTemplates(EVEN_ARMED);

describe('armed NPC loadouts', () => {
  it.each(Object.keys(UNARMED_PINS))('rolls %s as it did before armed tables', (id) => {
    const pins = (UNARMED_PINS as Record<string, string[]>)[id];
    expect(pins.map((_, i) => describeLoadout(rolled(NPCS[id], null, i + 1)))).toEqual(pins);
  }, budget(120_000));
});
