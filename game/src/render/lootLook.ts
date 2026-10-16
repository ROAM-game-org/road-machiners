export const LOOT_LOOK = { saturation: 1.35, lift: 0.03, hulkPaint: 0.3 };

export function lootColor(hex: number): number {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return hex;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = hueOf(r, g, b, max, d);
  return fromHsl(h, Math.min(1, s * LOOT_LOOK.saturation), Math.min(1, l + LOOT_LOOK.lift));
}

function hueOf(r: number, g: number, b: number, max: number, d: number): number {
  if (max === r) return (((g - b) / d) % 6 + 6) % 6;
  if (max === g) return (b - r) / d + 2;
  return (r - g) / d + 4;
}

function fromHsl(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h) % 6];
  const byte = (v: number): number => Math.round((v + m) * 255);
  return (byte(r) << 16) | (byte(g) << 8) | byte(b);
}
