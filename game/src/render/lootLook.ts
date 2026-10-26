export const LOOT_LOOK = { saturation: 1.35, lift: 0.12, hulkPaint: 0.5, minContrast: 10, maxLightness: 0.94 };

export function lootColor(hex: number, paint: number = hex): number {
  const base = hslOf(hex);
  const tint = hslOf(paint);
  const lifted = Math.max(base.l, Math.min(LOOT_LOOK.maxLightness, base.l + LOOT_LOOK.lift));
  if (tint.d === 0) return fromHsl(0, 0, lifted);
  return fromHsl(tint.h, Math.min(1, tint.s * LOOT_LOOK.saturation), lifted);
}

function hslOf(hex: number): { h: number; s: number; l: number; d: number } {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l, d };
  return { h: hueOf(r, g, b, max, d), s: d / (1 - Math.abs(2 * l - 1)), l, d };
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

export function lootContrast(plain: number, loot: number): number {
  const a = lab(plain);
  const b = lab(loot);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function lightnessOf(hex: number): number {
  return lab(hex)[0];
}

function lab(hex: number): [number, number, number] {
  const linear = (shift: number): number => {
    const v = ((hex >> shift) & 255) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [linear(16), linear(8), linear(0)];
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const fy = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const fz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
