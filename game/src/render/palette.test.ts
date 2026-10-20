import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { fallbackFaction } from '../sim/spawn';
import { MEMBER_TEMPLATES } from '../sim/sunward';
import { npcBrain } from '../sim/testkit';
import { paintOf } from './palette';

describe('truck paint', () => {
  it('gives every NPC template a paint for the faction it rides for', () => {
    for (const tpl of Object.values(NPCS)) {
      const truck = { id: tpl.id, faction: fallbackFaction(tpl), brain: npcBrain(tpl.id, { x: 0, y: 0 }, tpl.traits) };
      expect(() => paintOf(truck, 'standard'), tpl.id).not.toThrow();
    }
  });

  it('keeps the paint of a Sunward car after the order falls and it rides as an independent', () => {
    for (const id of MEMBER_TEMPLATES) expect(() => paintOf({ id, faction: 'independent', brain: npcBrain(id, { x: 0, y: 0 }, ['roamer']) }, 'standard'), id).not.toThrow();
  });
});
