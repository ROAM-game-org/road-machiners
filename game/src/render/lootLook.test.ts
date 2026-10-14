import { describe, expect, it } from 'vitest';
import { PAL } from './palette';
import { LOOT_LOOK, lootColor } from './lootLook';

function hsl(hex: number): { h: number; s: number; l: number } {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

const colors = [...PAL.roof, 0x8a5a3c, 0xc2a878, 0x6b7a4a];

describe('loot look', () => {
  it('keeps the hue and raises saturation and lightness', () => {
    for (const hex of colors) {
      const before = hsl(hex);
      const after = hsl(lootColor(hex));
      const hueGap = Math.abs(before.h - after.h);
      expect(Math.min(hueGap, 360 - hueGap)).toBeLessThan(3);
      expect(after.s).toBeGreaterThan(before.s);
      expect(after.s).toBeLessThanOrEqual(Math.min(1, before.s * LOOT_LOOK.saturation) + 0.03);
      expect(after.l).toBeGreaterThan(before.l);
    }
  });

  it('keeps a gray gray', () => {
    expect(lootColor(0x777777)).toBe(0x777777);
  });
});
