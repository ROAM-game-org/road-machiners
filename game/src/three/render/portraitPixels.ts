import { partDef } from "../../data/parts";
import { mountedItems } from "../../sim/grid";
import type { Vehicle } from "../../sim/types";

export type Tier = "ok" | "hurt" | "crit" | "broken";
export type Tint = { rgb: readonly [number, number, number]; lo: number; hi: number };
export type PixelSize = { width: number; height: number };

export const PX_PER_METER = 50;
export const SUPERSAMPLE = 2;
export const EMPTY_ID = 0;
export const BODY_ID = 1;
export const FIRST_PART_ID = 2;

export const TINTS = {
  steel: { rgb: [150, 156, 162], lo: 0.3, hi: 0.68 },
  tire: { rgb: [150, 150, 146], lo: 0.3, hi: 0.6 },
  hurt: { rgb: [255, 196, 60], lo: 0.2, hi: 1 },
  crit: { rgb: [255, 120, 40], lo: 0.2, hi: 1 },
  broken: { rgb: [255, 44, 40], lo: 0.2, hi: 1 },
} as const satisfies Record<string, Tint>;

export type TintName = keyof typeof TINTS;

const LEVEL_LOW_SHARE = 0.05;
const LEVEL_HIGH_SHARE = 0.95;
const MIN_LEVEL_SPAN = 64;
export const OPAQUE_ALPHA = 8;
const BYTE = 255;
const LUMA = [0.3, 0.59, 0.11] as const;
const SRGB_LINEAR_CUTOFF = 0.0031308;
const SRGB_LINEAR_SLOPE = 12.92;
const SRGB_SCALE = 1.055;
const SRGB_OFFSET = 0.055;
const SRGB_GAMMA = 2.4;

export const CONDITION_KINDS: readonly string[] = ["core", "engine", "weapon", "armor"];

export function conditionItems(vehicle: Vehicle) {
  return mountedItems(vehicle).filter((item) => CONDITION_KINDS.includes(partDef(item.part.defId).kind));
}

function luminance(px: Uint8ClampedArray, p: number): number {
  return LUMA[0] * px[p] + LUMA[1] * px[p + 1] + LUMA[2] * px[p + 2];
}

function expectSize(length: number, size: PixelSize, stride: number): void {
  if (length !== size.width * size.height * stride) throw new Error(`Pixel buffer holds ${length} values, expected ${size.width * size.height * stride}`);
}

export type PixelBox = { x: number; y: number; width: number; height: number };

export function boundsOf(rgba: Uint8ClampedArray, size: PixelSize): PixelBox {
  expectSize(rgba.length, size, 4);
  let [x0, y0, x1, y1] = [size.width, size.height, -1, -1];
  for (let p = 0; p < rgba.length / 4; p++) {
    if (rgba[p * 4 + 3] <= OPAQUE_ALPHA) continue;
    const x = p % size.width;
    const y = Math.floor(p / size.width);
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  }
  if (x1 < 0) throw new Error("No lit pixels to bound");
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

export function cropOf(rgba: Uint8ClampedArray, size: PixelSize, box: PixelBox): Uint8ClampedArray {
  expectSize(rgba.length, size, 4);
  const out = new Uint8ClampedArray(box.width * box.height * 4);
  for (let row = 0; row < box.height; row++) {
    const from = ((box.y + row) * size.width + box.x) * 4;
    out.set(rgba.subarray(from, from + box.width * 4), row * box.width * 4);
  }
  return out;
}

export type IdEntry = { box: PixelBox; count: number; lit: number; sumX: number; sumY: number };
export type IdIndex = ReadonlyMap<number, IdEntry>;

export function indexIds(ids: Uint16Array, size: PixelSize, lit?: Uint8ClampedArray): IdIndex {
  expectSize(ids.length, size, 1);
  const bounds = new Map<number, { x0: number; y0: number; x1: number; y1: number; count: number; lit: number; sumX: number; sumY: number }>();
  let p = 0;
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++, p++) {
      const id = ids[p];
      if (id === EMPTY_ID) continue;
      let at = bounds.get(id);
      if (!at) {
        at = { x0: x, y0: y, x1: x, y1: y, count: 0, lit: 0, sumX: 0, sumY: 0 };
        bounds.set(id, at);
      }
      at.x0 = Math.min(at.x0, x);
      at.x1 = Math.max(at.x1, x);
      at.y1 = y;
      at.count++;
      at.sumX += x;
      at.sumY += y;
      if (lit && lit[p * 4 + 3] > OPAQUE_ALPHA) at.lit++;
    }
  }
  const index = new Map<number, IdEntry>();
  for (const [id, at] of bounds) index.set(id, { box: { x: at.x0, y: at.y0, width: at.x1 - at.x0 + 1, height: at.y1 - at.y0 + 1 }, count: at.count, lit: at.lit, sumX: at.sumX, sumY: at.sumY });
  return index;
}

export function fullBox(size: PixelSize): PixelBox {
  return { x: 0, y: 0, width: size.width, height: size.height };
}

function eachInBox(size: PixelSize, box: PixelBox, visit: (p: number, q: number) => void): void {
  for (let row = 0; row < box.height; row++) {
    const from = (box.y + row) * size.width + box.x;
    for (let col = 0; col < box.width; col++) visit(from + col, row * box.width + col);
  }
}

export function partMaskOf(lit: Uint8ClampedArray, ids: Uint16Array, size: PixelSize, idOf: number, box: PixelBox): Uint8ClampedArray {
  if (lit.length !== ids.length * 4) throw new Error(`Lit buffer holds ${lit.length} values for ${ids.length} id pixels`);
  const mask = new Uint8ClampedArray(box.width * box.height * 4);
  eachInBox(size, box, (p, q) => {
    if (ids[p] === idOf && lit[p * 4 + 3] > OPAQUE_ALPHA) mask.set(lit.subarray(p * 4, p * 4 + 4), q * 4);
  });
  return mask;
}

export function solidMaskOf(ids: Uint16Array, size: PixelSize, idOf: number, box: PixelBox): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(box.width * box.height * 4);
  eachInBox(size, box, (p, q) => {
    if (ids[p] === idOf) mask.fill(BYTE, q * 4, q * 4 + 4);
  });
  return mask;
}

export function centerOf(ids: Uint16Array, size: PixelSize, idOf: number, entry: IdEntry | undefined): { x: number; y: number } {
  expectSize(ids.length, size, 1);
  if (!entry) throw new Error(`No pixels hold id ${idOf}`);
  return nearestOwnPixel(ids, size, idOf, entry, entry.sumX / entry.count, entry.sumY / entry.count);
}

function nearestOwnPixel(ids: Uint16Array, size: PixelSize, idOf: number, entry: IdEntry, cx: number, cy: number): { x: number; y: number } {
  let best = { x: cx, y: cy };
  let bestDist = Infinity;
  eachInBox(size, entry.box, (p) => {
    if (ids[p] !== idOf) return;
    const x = p % size.width;
    const y = Math.floor(p / size.width);
    const dist = (x - cx) ** 2 + (y - cy) ** 2;
    if (dist >= bestDist) return;
    bestDist = dist;
    best = { x, y };
  });
  return { x: best.x + 0.5, y: best.y + 0.5 };
}

function bump(counts: Map<number, number>, id: number): void {
  counts.set(id, (counts.get(id) ?? 0) + 1);
}

function countPixels(ids: Uint16Array, hidden: Uint16Array): { total: Map<number, number>; under: Map<number, Map<number, number>> } {
  const total = new Map<number, number>();
  const under = new Map<number, Map<number, number>>();
  for (let p = 0; p < ids.length; p++) {
    bump(total, ids[p]);
    if (hidden[p] === EMPTY_ID || ids[p] === EMPTY_ID) continue;
    const counts = under.get(hidden[p]) ?? new Map<number, number>();
    bump(counts, ids[p]);
    under.set(hidden[p], counts);
  }
  return { total, under };
}

function mostCovering(counts: Map<number, number>, total: Map<number, number>): number | undefined {
  const survivors = [...counts].filter(([id, count]) => id === BODY_ID || (total.get(id) ?? 0) > count);
  return survivors.sort((a, b) => b[1] - a[1])[0]?.[0];
}

function coverOf(ids: Uint16Array, hidden: Uint16Array): Map<number, number> {
  const { total, under } = countPixels(ids, hidden);
  const cover = new Map<number, number>();
  for (const [part, counts] of under) {
    const id = mostCovering(counts, total);
    if (id !== undefined) cover.set(part, id);
  }
  return cover;
}

export function hiddenOver(ids: Uint16Array, hidden: Uint16Array): Uint16Array {
  if (ids.length !== hidden.length) throw new Error(`Hidden id map holds ${hidden.length} pixels, expected ${ids.length}`);
  const cover = coverOf(ids, hidden);
  const out = ids.slice();
  for (let p = 0; p < ids.length; p++) if (hidden[p] !== EMPTY_ID && cover.get(hidden[p]) === ids[p]) out[p] = hidden[p];
  return out;
}

export function idsOf(rgba: Uint8ClampedArray): Uint16Array {
  const ids = new Uint16Array(rgba.length / 4);
  for (let p = 0; p < ids.length; p++) ids[p] = rgba[p * 4 + 3] === 0 ? EMPTY_ID : rgba[p * 4] | (rgba[p * 4 + 1] << 8);
  return ids;
}

function levelsOf(mask: Uint8ClampedArray): { low: number; span: number } {
  const lums: number[] = [];
  for (let p = 0; p < mask.length; p += 4) if (mask[p + 3] > OPAQUE_ALPHA) lums.push(luminance(mask, p));
  if (lums.length === 0) throw new Error("No lit pixels to tint");
  const sorted = Float32Array.from(lums).sort();
  const high = sorted[Math.floor(sorted.length * LEVEL_HIGH_SHARE)];
  const span = Math.max(high - sorted[Math.floor(sorted.length * LEVEL_LOW_SHARE)], MIN_LEVEL_SPAN);
  return { low: high - span, span };
}

export function tintMask(mask: Uint8ClampedArray, tint: Tint): Uint8ClampedArray {
  const { low, span } = levelsOf(mask);
  const out = mask.slice();
  for (let p = 0; p < out.length; p += 4) {
    if (out[p + 3] <= OPAQUE_ALPHA) continue;
    const t = Math.min(1, Math.max(0, (luminance(mask, p) - low) / span));
    const k = tint.lo + (tint.hi - tint.lo) * t;
    for (let c = 0; c < 3; c++) out[p + c] = tint.rgb[c] * k;
  }
  return out;
}

export function unpremultiply(rgba: Uint8ClampedArray): void {
  for (let p = 0; p < rgba.length; p += 4) {
    const alpha = rgba[p + 3];
    if (alpha === 0 || alpha === BYTE) continue;
    for (let c = 0; c < 3; c++) rgba[p + c] = Math.round((rgba[p + c] * BYTE) / alpha);
  }
}

const SRGB_BYTES = Uint8ClampedArray.from({ length: BYTE + 1 }, (_, v) => {
  const linear = v / BYTE;
  const encoded = linear <= SRGB_LINEAR_CUTOFF ? linear * SRGB_LINEAR_SLOPE : SRGB_SCALE * linear ** (1 / SRGB_GAMMA) - SRGB_OFFSET;
  return Math.round(encoded * BYTE);
});

export function linearToSrgb(rgba: Uint8ClampedArray): void {
  for (let p = 0; p < rgba.length; p += 4) for (let c = 0; c < 3; c++) rgba[p + c] = SRGB_BYTES[rgba[p + c]];
}

export function flipRows<T extends Uint8ClampedArray | Uint16Array>(data: T, width: number, height: number): void {
  const stride = data.length / (width * height);
  if (!Number.isInteger(stride)) throw new Error(`Pixel buffer of ${data.length} values does not fit ${width} by ${height}`);
  const row = width * stride;
  const swap = data.slice(0, row);
  for (let top = 0, bottom = height - 1; top < bottom; top++, bottom--) {
    swap.set(data.subarray(top * row, top * row + row));
    data.copyWithin(top * row, bottom * row, bottom * row + row);
    data.set(swap, bottom * row);
  }
}
