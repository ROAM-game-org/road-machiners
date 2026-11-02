import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ICONS from '../../data/item-icons.json';
import { PAINT as PAINT_JOB } from '../../data/chassis';
import { playerColors } from '../../render/palette';
import { CHASSIS_MASK, CHASSIS_SHEET } from '../../render/partLooks';
import { decodePng, type DecodedPng } from '../../test/png';
import { encodePng } from '../../../scripts/png.mjs';

const SLOTS = ['body', 'cab', 'gear'] as const;
type Slot = (typeof SLOTS)[number];
const MIN_PIXELS = 50;
const MAX_HUE_GAP = 25;
const MIN_SATURATION_SHARE = 0.4;
const CELL = ICONS.cell.chassis;
const COLS = ICONS.cols.chassis;
const sheet = decodePng(readFileSync(`public/icons/${CHASSIS_SHEET}`));
const mask = decodePng(readFileSync(`public/icons/${CHASSIS_MASK}`));
const standard = playerColors(PAINT_JOB.standard);

type Hsl = { hue: number; saturation: number };

function hslOf([r, g, b]: number[]): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const light = (max + min) / 2;
  const span = max - min;
  if (span === 0) return { hue: 0, saturation: 0 };
  const saturation = span / (1 - Math.abs(2 * light - 1));
  const raw = max === rn ? ((gn - bn) / span) % 6 : max === gn ? (bn - rn) / span + 2 : (rn - gn) / span + 4;
  return { hue: (raw * 60 + 360) % 360, saturation };
}

function colorHex(hex: number): number[] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[values.length >> 1];
}

function slotPixels(index: number, slot: Slot): number[][] {
  const channel = SLOTS.indexOf(slot);
  const x0 = (index % COLS) * CELL;
  const y0 = Math.floor(index / COLS) * CELL;
  const pixels: number[][] = [];
  for (let y = y0; y < y0 + CELL; y++) {
    for (let x = x0; x < x0 + CELL; x++) {
      const at = (y * sheet.width + x) * 4;
      const marked = SLOTS.every((_, c) => (c === channel ? mask.data[at + c] > 200 : mask.data[at + c] < 50));
      if (marked && sheet.data[at + 3] === 255) pixels.push([sheet.data[at], sheet.data[at + 1], sheet.data[at + 2]]);
    }
  }
  return pixels;
}

function medianColor(pixels: number[][]): number[] {
  return [0, 1, 2].map((c) => median(pixels.map((p) => p[c])));
}

function markedSlots(index: number): { slot: Slot; pixels: number[][] }[] {
  return SLOTS.map((slot) => ({ slot, pixels: slotPixels(index, slot) })).filter((s) => s.pixels.length >= MIN_PIXELS);
}

function hueGap(a: number, b: number): number {
  const gap = Math.abs(a - b) % 360;
  return Math.min(gap, 360 - gap);
}

describe('chassis sheet in the standard paint', () => {
  const chassis = Object.entries(ICONS.chassis) as [string, { index: number }][];

  it('has a cell for each of the 18 chassis', () => {
    expect(chassis).toHaveLength(18);
    expect(sheet.width).toBe(mask.width);
    expect(sheet.height).toBe(mask.height);
  });

  it('leaves only the semi with no paint slot', () => {
    const unpainted = chassis.filter(([, { index }]) => markedSlots(index).length === 0).map(([id]) => id);
    expect(unpainted).toEqual(['semi']);
  });

  it.each(chassis.filter(([id]) => id !== 'semi'))('%s shows the standard hue on every slot its mask marks', (id, { index }) => {
    const slots = markedSlots(index);
    expect(slots.length).toBeGreaterThan(0);
    for (const { slot, pixels } of slots) {
      const median3 = medianColor(pixels);
      const got = hslOf(median3);
      const want = hslOf(colorHex(standard[slot]));
      const where = `${id} ${slot}: sheet median rgb(${median3.join(',')}) against standard #${standard[slot].toString(16)}`;
      expect(got.saturation, where).toBeGreaterThanOrEqual(want.saturation * MIN_SATURATION_SHARE);
      expect(hueGap(got.hue, want.hue), where).toBeLessThanOrEqual(MAX_HUE_GAP);
    }
  });
});

describe('decodePng', () => {
  it('reads back the pixels encodePng wrote', () => {
    const width = 5;
    const height = 4;
    const rgba = new Uint8Array(width * height * 4).map((_, i) => (i * 37 + (i >> 3) * 11) & 0xff);
    const back: DecodedPng = decodePng(encodePng(width, height, rgba));
    expect([back.width, back.height]).toEqual([width, height]);
    expect(Array.from(back.data)).toEqual(Array.from(rgba));
  });

  it('refuses a file that is not a PNG', () => {
    expect(() => decodePng(new Uint8Array(20))).toThrow('Not a PNG');
  });
});
