import { describe, it } from 'vitest';
import { expectSparesStay, rebuildCases } from '../test/npc-loadout-rebuild-kit';

describe('NPC loadout rebuild, seeds 1 and 2', () => {
  it.each(rebuildCases)('stows the spares of every rolled $template.id loadout on a $chassisId where the roll stowed them, with or without its cargo', (rebuild) => {
    expectSparesStay(rebuild, [1, 2]);
  });
});
