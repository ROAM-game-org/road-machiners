import { describe, expect, it } from 'vitest';
import { PAINT, PALETTE, type TruckPaint } from '../data/chassis';
import { NPCS } from '../data/npcs';
import { fallbackFaction } from '../sim/spawn';
import { MEMBER_TEMPLATES } from '../sim/sunward';
import { npcBrain } from '../sim/testkit';
import { GANG_PAINT, paintOf, playerColors, TEMPLATE_PAINT } from './palette';

const PLUM: TruckPaint = { body: 'plum', cab: 'navy', gear: 'mint' };

describe('truck paint', () => {
  it('gives every NPC template a paint for the faction it rides for', () => {
    for (const tpl of Object.values(NPCS)) {
      const truck = { id: tpl.id, faction: fallbackFaction(tpl), brain: npcBrain(tpl.id, { x: 0, y: 0 }, tpl.traits) };
      expect(() => paintOf(truck, PAINT.standard), tpl.id).not.toThrow();
    }
  });

  it('keeps the paint of a Sunward car after the order falls and it rides as an independent', () => {
    for (const id of MEMBER_TEMPLATES) expect(() => paintOf({ id, faction: 'independent', brain: npcBrain(id, { x: 0, y: 0 }, ['roamer']) }, PAINT.standard), id).not.toThrow();
  });

  it('paints every NPC in its role colors whatever the player paint is', () => {
    for (const tpl of Object.values(NPCS)) {
      const truck = { id: tpl.id, faction: fallbackFaction(tpl), brain: npcBrain(tpl.id, { x: 0, y: 0 }, tpl.traits) };
      const role = truck.faction === 'scrapjaw' || truck.faction === 'kiln' ? GANG_PAINT[truck.faction] : TEMPLATE_PAINT[tpl.id];
      expect(paintOf(truck, PLUM), tpl.id).toEqual({ body: role.top, cab: role.cab, gear: role.top });
    }
  });

  it('paints the player body, cab and gear from the palette', () => {
    expect(paintOf({ id: 'me', faction: 'player', brain: null }, PLUM)).toEqual({ body: PALETTE.plum, cab: PALETTE.navy, gear: PALETTE.mint });
    expect(playerColors(PAINT.standard)).toEqual({ body: 0x9c7a3e, cab: 0x7e8a5a, gear: 0x9c7a3e });
  });

  it('throws on a color the palette does not hold', () => {
    expect(() => playerColors({ ...PLUM, gear: 'gold' } as unknown as TruckPaint)).toThrow(/gold/);
  });
});
