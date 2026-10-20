import { describe, expect, it } from 'vitest';
import { PAINT, PALETTE, type TruckPaint } from '../data/chassis';
import { NPCS } from '../data/npcs';
import { fallbackFaction } from '../sim/spawn';
import { MEMBER_TEMPLATES } from '../sim/sunward';
import { npcBrain } from '../sim/testkit';
import { GANG_PAINT, paintOf, paintSheetPixels, playerColors, TEMPLATE_PAINT } from './palette';

const OXBLOOD: TruckPaint = { body: 'oxblood', cab: 'slate', gear: 'chalk' };

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
      expect(paintOf(truck, OXBLOOD), tpl.id).toEqual({ body: role.top, cab: role.cab, gear: role.top });
    }
  });

  it('paints the player body, cab and gear from the palette', () => {
    expect(paintOf({ id: 'me', faction: 'player', brain: null }, OXBLOOD)).toEqual({ body: PALETTE.oxblood, cab: PALETTE.slate, gear: PALETTE.chalk });
    expect(playerColors(PAINT.standard)).toEqual({ body: 0x9c7a3e, cab: 0x7e8a5a, gear: 0x9c7a3e });
  });

  it('throws on a color the palette does not hold', () => {
    expect(() => playerColors({ ...OXBLOOD, gear: 'gold' } as unknown as TruckPaint)).toThrow(/gold/);
  });
});

describe('paintSheetPixels', () => {
  const STANDARD = playerColors(PAINT.standard);
  const TO = playerColors({ body: 'oxblood', cab: 'slate', gear: 'chalk' });
  const px = (...pixels: number[][]): Uint8ClampedArray => new Uint8ClampedArray(pixels.flat());
  const tan = [0x9c, 0x7a, 0x3e, 255];
  const darkTan = [0x4e, 0x3d, 0x1f, 255];
  const sheet = px(tan, darkTan, [0x7e, 0x8a, 0x5a, 255], [10, 200, 30, 128]);
  const mask = px([255, 0, 0, 255], [255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 0, 255]);

  it('gives the standard sheet back for the standard paint', () => {
    const out = paintSheetPixels(sheet, mask, STANDARD, STANDARD);
    for (const [i, v] of sheet.entries()) expect(Math.abs(out[i] - v)).toBeLessThanOrEqual(1);
  });

  it('moves only masked pixels and keeps every alpha', () => {
    const out = paintSheetPixels(sheet, mask, STANDARD, TO);
    expect([...out.slice(12, 16)]).toEqual([10, 200, 30, 128]);
    expect([out[3], out[7], out[11]]).toEqual([255, 255, 255]);
  });

  it('paints a fully masked pixel in the new color', () => {
    const out = paintSheetPixels(sheet, mask, STANDARD, TO);
    expect([...out.slice(0, 3)]).toEqual([0x5a, 0x20, 0x26]);
    expect([...out.slice(8, 11)]).toEqual([0x4a, 0x50, 0x60]);
  });

  it('carries a dark toon step over to the new color', () => {
    const out = paintSheetPixels(sheet, mask, STANDARD, TO);
    for (let c = 0; c < 3; c++) expect(Math.abs(out[4 + c] - out[c] / 2)).toBeLessThanOrEqual(2);
  });

  it('blends a half-masked pixel halfway', () => {
    const out = paintSheetPixels(px(tan), px([128, 0, 0, 255]), STANDARD, TO);
    for (let c = 0; c < 3; c++) expect(Math.abs(out[c] - (tan[c] + [0x5a, 0x20, 0x26][c]) / 2)).toBeLessThanOrEqual(2);
  });

  it('throws on a mask of another size', () => {
    expect(() => paintSheetPixels(sheet, px(tan), STANDARD, TO)).toThrow(/mask/);
  });
});
