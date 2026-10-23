
import type { Vehicle } from '../sim/types';
import { isPaletteId, PAINT_SLOTS, PALETTE, type Paint, type TruckPaint } from '../data/chassis';
import type { ItemTone } from './partLooks';
import { tokenColor } from '../ui/tokens';

function tokenColorCss(name: string): string {
  return `#${tokenColor(name).toString(16).padStart(6, '0')}`;
}

export const PAL = {
  bg: 0x1a1410,
  sand: [0xc9a878, 0xc2a070, 0xbb9868, 0xd0b080],
  sandFar: 0x8a7050,
  desertSand: 0xffaf6f,
  sandLight: 0xffbf86,
  sandShade: 0xe8955c,
  road: 0xb6835e,
  roadCrack: 0x9c6c4c,
  roadRim: 0xf8a667,
  stoneGrey: 0x8a847d,
  padMark: 0xd86a2a,
  highwayAsphalt: 0x6c6a6c,
  pebble: 0x9c7c54,
  scorch: 0x2a2218,
  craterRim: 0x7a6242,
  graffiti: [0xd2cab4, 0xc29a3e, 0xa94a38, 0x6f9a94],
  desertStone: 0xb8ab9c,
  scrub: [0x6f6a3a, 0x5d5a32, 0x7c7442],
  brush: [0x7c7a4c, 0x8c8a58, 0xa49c68],
  cactus: { body: 0x70764a, shade: 0x585e3a },
  rock: { top: 0x9a8a78, side: 0x6e6254, dark: 0x4e453c },
  stone: { top: 0xc98e68, side: 0xb47f5d, dark: 0x8a5e44 },
  rimRock: { top: 0xbab3a6, side: 0x948e84, dark: 0x6e6960 },
  rust: { top: 0x8a4a2a, side: 0x5e3420, dark: 0x3a2418 },
  wall: { top: 0xb89a74, side: 0x8e7454, dark: 0x6a5840 },
  roof: [0x7a5a3a, 0x5e6a5a, 0x8a3a2a],
  water: 0x4a8a8a,
  waterLight: 0x6aaaa0,
  palm: 0x4a6a2a,
  trunk: 0x6a4a2a,
  shadow: 0x2a1a10,
  shadeTint: 0x3c3046,
  outline: 0x1a1410,
  wheel: 0x2a2420,
  metal: 0x5a5a58,
  metalLight: 0x8a8a84,
  crate: 0x9a7a4a,
  plan: tokenColor('--path-plan'),
  dest: tokenColor('--path-dest'),
  throttle: { brake: tokenColor('--path-brake'), hold: tokenColor('--path-hold'), accelerate: tokenColor('--path-accelerate') },
  select: tokenColor('--select'),
  utility: tokenColor('--accent-dim'),
  arcSpent: tokenColor('--path-spent'),
  contact: tokenColor('--path-contact'),
  smoke: 0x100e0d,
  caltrops: { spike: 0x9a9a94 },
  oil: { slick: 0x0c0b0a },
  rope: 0x16130f,
  pulse: { flash: 0xc8ecff, arc: 0x9fd8ff, spark: 0xd8f0ff },
  flare: { core: 0xffffff, halo: 0xff3a2a, light: 0xff4a3a, marker: tokenColor('--path-flare'), casing: 0x9a3426, trail: 0xb8b0a8 },
  shell: { casing: 0x2a2622, trail: 0x8a8580 },
  dustTrail: 0xe0c49a,
  radio: tokenColor('--path-radio'),
  beacon: tokenColor('--path-beacon'),
  flash: 0xfff0a0,
  brass: 0xc8a048,
  lamp: { on: 0xfff2c8, off: 0x8a8470, amber: 0xffb45a },
  siteLight: { sodium: 0xffb060, warm: 0xffd8a0, cold: 0xcfe0ff, fire: 0xff7a30, amber: 0xff7018 },
  radioLight: { on: 0xff3020, off: 0x4a1a14 },
  truckGlow: 0xffffff,
  reactorLight: 0x38d6e8,
  reactorGlow: 0x5cf0b4,
  semi: { orange: 0xd9701c, stripe: 0x1e1c1a, chrome: 0xc4c9cc, amber: 0xf2a22c, white: 0xe6e4da, rib: 0xb9b8b0 },
  hull: { light: 0xc4baa6, grey: 0x8e887c, dark: 0x6e6a62, rust: 0x7e5634 },
  glass: { top: 0x9cb8ac, side: 0x6f8f88, dark: 0x4c6460 },
  scree: 0x8e5e44,
  dirtRoad: 0x8e7d69,
  shipGlow: 0x6fe4ff,
  textDim: '#b8a888',
  damageText: tokenColorCss('--path-damage'),
};

export const GANG_PAINT: Record<'scrapjaw' | 'kiln', Paint> = {
  scrapjaw: { top: 0x8e2e22, side: 0x5e1e18, cab: 0x3a3230, cabSide: 0x262020 },
  kiln: { top: 0xa8521e, side: 0x6e3412, cab: 0x2e2a28, cabSide: 0x1e1a18 },
};

export const TEMPLATE_PAINT: Record<string, Paint> = {
  trader: { top: 0x5e7a8a, side: 0x3e5260, cab: 0xb8a070, cabSide: 0x8a7650 },
  scavenger: { top: 0x7a6a4a, side: 0x524630, cab: 0x5a6a4a, cabSide: 0x3e4a32 },
  bowlFarmer: { top: 0x5a7a3a, side: 0x3e5628, cab: 0xc8b070, cabSide: 0x9a8650 },
  noseArmy: { top: 0x5e6038, side: 0x40422a, cab: 0xa89a70, cabSide: 0x7e7452 },
  courier: { top: 0xd0a030, side: 0x9a741e, cab: 0x6a5a40, cabSide: 0x4a3e2c },
  roamer: { top: 0x4e8078, side: 0x345a54, cab: 0x8a8068, cabSide: 0x625a48 },
  vulture: { top: 0x3a2e26, side: 0x261e18, cab: 0xc8b89a, cabSide: 0x9a8a70 },
  convoy: { top: 0xb8b8b0, side: 0x86867e, cab: 0x9a5a34, cabSide: 0x6e3e24 },
  convoyGuard: { top: 0xb8b8b0, side: 0x86867e, cab: 0x9a5a34, cabSide: 0x6e3e24 },
  merc: { top: 0x2a2a2c, side: 0x1a1a1c, cab: 0x5a6068, cabSide: 0x3e4248 },
  cavalcade: { top: 0xcac0a6, side: 0x8f8774, cab: 0x2c2824, cabSide: 0x1d1b18 },
  hunter: { top: 0xb2a284, side: 0x7a6e58, cab: 0x2c2824, cabSide: 0x1d1b18 },
  marshal: { top: 0x4a3a5a, side: 0x32283e, cab: 0xd2c6a6, cabSide: 0xa2967a },
};

export type TruckColors = { body: number; cab: number; gear: number };

export function paintOf(v: Pick<Vehicle, 'id' | 'faction' | 'brain'>, playerPaint: TruckPaint): TruckColors {
  if (v.faction === 'player') return playerColors(playerPaint);
  return roleColors(rolePaint(v));
}

function rolePaint(v: Pick<Vehicle, 'id' | 'faction' | 'brain'>): Paint {
  if (v.faction === 'scrapjaw' || v.faction === 'kiln') return GANG_PAINT[v.faction];
  const paint = v.brain ? TEMPLATE_PAINT[v.brain.templateId] : undefined;
  if (!paint) throw new Error(`${v.id} of ${v.faction} has no paint`);
  return paint;
}

function roleColors(paint: Paint): TruckColors {
  return { body: paint.top, cab: paint.cab, gear: paint.top };
}

export function playerColors(paint: TruckPaint): TruckColors {
  for (const slot of PAINT_SLOTS) if (!isPaletteId(paint[slot])) throw new Error(`No palette color ${String(paint[slot])} for the ${slot}`);
  return { body: PALETTE[paint.body], cab: PALETTE[paint.cab], gear: PALETTE[paint.gear] };
}

export const ITEM_TONES = { weapon: 0x8c3a30, armor: 0x4f5458, cargo: 0x6e5236, other: 0x35587a } satisfies Record<ItemTone, number>;

export function shade(color: number, k: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((color & 0xff) * k));
  return (r << 16) | (g << 8) | b;
}

export function mix(a: number, b: number, t: number): number {
  const u = 1 - t;
  const r = Math.round(((a >> 16) & 0xff) * u + ((b >> 16) & 0xff) * t);
  const g = Math.round(((a >> 8) & 0xff) * u + ((b >> 8) & 0xff) * t);
  const bl = Math.round((a & 0xff) * u + (b & 0xff) * t);
  return (r << 16) | (g << 8) | bl;
}

const MASK_CHANNELS = ['body', 'cab', 'gear'] as const satisfies readonly (keyof TruckColors)[];

export function paintSheetPixels(sheet: Uint8ClampedArray, mask: Uint8ClampedArray, from: TruckColors, to: TruckColors): Uint8ClampedArray {
  if (sheet.length !== mask.length) throw new Error(`Paint mask has ${mask.length} bytes for a sheet of ${sheet.length}`);
  const out = new Uint8ClampedArray(sheet);
  const shifts = MASK_CHANNELS.map((slot) => ({ from: rgb(from[slot]), to: rgb(to[slot]), lum: brightness(rgb(from[slot])) }));
  for (let at = 0; at < sheet.length; at += 4) {
    const shade = brightness([sheet[at], sheet[at + 1], sheet[at + 2]]);
    for (let c = 0; c < 3; c++) {
      let v = sheet[at + c];
      for (const [i, s] of shifts.entries()) v += (mask[at + i] / 255) * (shade / s.lum) * (s.to[c] - s.from[c]);
      out[at + c] = v;
    }
  }
  return out;
}

function rgb(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

function brightness([r, g, b]: readonly number[]): number {
  return Math.max(1, 0.299 * r + 0.587 * g + 0.114 * b);
}
