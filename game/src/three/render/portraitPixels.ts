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

export function partMaskOf(lit: Uint8ClampedArray, ids: Uint16Array, idOf: number): Uint8ClampedArray {
  if (lit.length !== ids.length * 4) throw new Error(`Lit buffer holds ${lit.length} values for ${ids.length} id pixels`);
  const mask = new Uint8ClampedArray(lit.length);
  for (let p = 0; p < ids.length; p++) {
    if (ids[p] !== idOf || lit[p * 4 + 3] <= OPAQUE_ALPHA) continue;
    mask.set(lit.subarray(p * 4, p * 4 + 4), p * 4);
  }
  return mask;
}

export function regionOf(mask: Uint8ClampedArray): Uint8Array {
  const region = new Uint8Array(mask.length / 4);
  for (let p = 0; p < region.length; p++) region[p] = mask[p * 4 + 3] > OPAQUE_ALPHA ? 1 : 0;
  return region;
}

type Line = { start: number; count: number; stride: number };

function grownAlong(from: Uint8Array, into: Uint8Array, line: Line, radius: number): void {
  for (let i = 0; i < line.count; i++) {
    if (!from[line.start + i * line.stride]) continue;
    const last = Math.min(line.count - 1, i + radius);
    for (let j = Math.max(0, i - radius); j <= last; j++) into[line.start + j * line.stride] = 1;
  }
}

function dilated(bits: Uint8Array, size: PixelSize, radius: number): Uint8Array {
  const across = new Uint8Array(bits.length);
  const out = new Uint8Array(bits.length);
  for (let y = 0; y < size.height; y++) grownAlong(bits, across, { start: y * size.width, count: size.width, stride: 1 }, radius);
  for (let x = 0; x < size.width; x++) grownAlong(across, out, { start: x, count: size.height, stride: size.width }, radius);
  return out;
}

type Point = { x: number; y: number };

function rowEnds(region: Uint8Array, size: PixelSize): Point[] {
  const points: Point[] = [];
  for (let y = 0; y < size.height; y++) {
    const row = region.subarray(y * size.width, (y + 1) * size.width);
    const first = row.indexOf(1);
    if (first < 0) continue;
    const last = row.lastIndexOf(1);
    points.push({ x: first, y }, { x: first, y: y + 1 }, { x: last + 1, y }, { x: last + 1, y: y + 1 });
  }
  return points;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function halfHull(points: Point[]): Point[] {
  const hull: Point[] = [];
  for (const p of points) {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop();
    hull.push(p);
  }
  hull.pop();
  return hull;
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  return [...halfHull(sorted), ...halfHull(sorted.reverse())];
}

function insideHull(hull: Point[], p: Point): boolean {
  return hull.every((a, i) => cross(a, hull[(i + 1) % hull.length], p) > 0);
}

export function hullRegion(region: Uint8Array, size: PixelSize): Uint8Array {
  expectSize(region.length, size, 1);
  const hull = convexHull(rowEnds(region, size));
  if (hull.length < 3) throw new Error("A part ring needs at least one lit pixel");
  const out = new Uint8Array(region.length);
  for (let p = 0; p < out.length; p++) out[p] = insideHull(hull, { x: (p % size.width) + 0.5, y: Math.floor(p / size.width) + 0.5 }) ? 1 : 0;
  return out;
}

export function paddedBox(box: PixelBox, pad: number, size: PixelSize): PixelBox {
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  return { x, y, width: Math.min(size.width, box.x + box.width + pad) - x, height: Math.min(size.height, box.y + box.height + pad) - y };
}

export function ringed(px: Uint8ClampedArray, region: Uint8Array, size: PixelSize, radius: number, rgb: readonly [number, number, number]): Uint8ClampedArray {
  expectSize(region.length, size, 1);
  const grown = dilated(region, size, radius);
  const out = px.slice();
  for (let p = 0; p < region.length; p++) {
    if (!grown[p] || region[p]) continue;
    out.set(rgb, p * 4);
    out[p * 4 + 3] = BYTE;
  }
  return out;
}

export function solidMaskOf(ids: Uint16Array, idOf: number): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(ids.length * 4);
  for (let p = 0; p < ids.length; p++) if (ids[p] === idOf) mask.fill(BYTE, p * 4, p * 4 + 4);
  return mask;
}

export function centerOf(ids: Uint16Array, size: PixelSize, idOf: number): { x: number; y: number } {
  expectSize(ids.length, size, 1);
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let p = 0; p < ids.length; p++) {
    if (ids[p] !== idOf) continue;
    sumX += p % size.width;
    sumY += Math.floor(p / size.width);
    count++;
  }
  if (count === 0) throw new Error(`No pixels hold id ${idOf}`);
  return nearestOwnPixel(ids, size, idOf, sumX / count, sumY / count);
}

function nearestOwnPixel(ids: Uint16Array, size: PixelSize, idOf: number, cx: number, cy: number): { x: number; y: number } {
  let best = { x: cx, y: cy };
  let bestDist = Infinity;
  for (let p = 0; p < ids.length; p++) {
    if (ids[p] !== idOf) continue;
    const x = p % size.width;
    const y = Math.floor(p / size.width);
    const dist = (x - cx) ** 2 + (y - cy) ** 2;
    if (dist >= bestDist) continue;
    bestDist = dist;
    best = { x, y };
  }
  return { x: best.x + 0.5, y: best.y + 0.5 };
}

export function hiddenOver(ids: Uint16Array, hidden: Uint16Array): Uint16Array {
  if (ids.length !== hidden.length) throw new Error(`Hidden id map holds ${hidden.length} pixels, expected ${ids.length}`);
  const out = ids.slice();
  for (let p = 0; p < ids.length; p++) if (ids[p] === BODY_ID && hidden[p] !== EMPTY_ID) out[p] = hidden[p];
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
