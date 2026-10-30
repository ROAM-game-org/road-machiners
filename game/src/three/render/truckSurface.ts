import * as THREE from 'three';

export const ATLAS_MAX = 2048;
export const NEUTRAL_SLOT = '';
const NEUTRAL_SIDE = 16;

export type MaskSlot = { x: number; y: number; side: number };
export type AtlasLayout = { side: number; slots: Map<string, MaskSlot> };

const isPowerOfTwo = (n: number) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

function placeAll(order: [string, number][], side: number): Map<string, MaskSlot> | null {
  const free: MaskSlot[] = [{ x: 0, y: 0, side }];
  const slots = new Map<string, MaskSlot>();
  for (const [name, want] of order) {
    free.sort((a, b) => a.side - b.side || a.y - b.y || a.x - b.x);
    const at = free.findIndex((f) => f.side >= want);
    if (at < 0) return null;
    let cell = free.splice(at, 1)[0];
    while (cell.side > want) {
      const half = cell.side / 2;
      free.push({ x: cell.x + half, y: cell.y, side: half }, { x: cell.x, y: cell.y + half, side: half }, { x: cell.x + half, y: cell.y + half, side: half });
      cell = { x: cell.x, y: cell.y, side: half };
    }
    slots.set(name, cell);
  }
  return slots;
}

export function packMasks(sides: ReadonlyMap<string, number>): AtlasLayout {
  for (const [name, side] of sides) if (!isPowerOfTwo(side)) throw new Error(`Mask of ${name} is ${side} px, not a power of two`);
  const order: [string, number][] = [[NEUTRAL_SLOT, NEUTRAL_SIDE], ...sides];
  order.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const area = order.reduce((sum, [, s]) => sum + s * s, 0);
  for (let side = order[0][1]; side <= ATLAS_MAX; side *= 2) {
    if (side * side < area) continue;
    const slots = placeAll(order, side);
    if (slots) return { side, slots };
  }
  throw new Error(`Truck masks need ${Math.ceil(Math.sqrt(area))} px square, over the ${ATLAS_MAX} px atlas. Raise SURFACE_MASK.metersPerPixel and rebake.`);
}

export function slotUv(layout: AtlasLayout, slot: MaskSlot, u: number, v: number): [number, number] {
  return [(slot.x + u * slot.side) / layout.side, (slot.y + v * slot.side) / layout.side];
}

export const WEAR_EDGE = { minAngle: 0.5, far: 1, weld: 1e-4 };

type Side = { tri: number; opposite: number };

function corner(pos: ArrayLike<number>, tri: number, k: number): THREE.Vector3 {
  const at = (tri * 3 + k) * 3;
  return new THREE.Vector3(pos[at], pos[at + 1], pos[at + 2]);
}

function weldIds(pos: ArrayLike<number>): number[] {
  const ids = new Map<string, number>();
  const out: number[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const key = `${Math.round(pos[i] / WEAR_EDGE.weld)},${Math.round(pos[i + 1] / WEAR_EDGE.weld)},${Math.round(pos[i + 2] / WEAR_EDGE.weld)}`;
    if (!ids.has(key)) ids.set(key, ids.size);
    out.push(ids.get(key)!);
  }
  return out;
}

function edgeKey(ids: number[], tri: number, opposite: number): string {
  const a = ids[tri * 3 + ((opposite + 1) % 3)];
  const b = ids[tri * 3 + ((opposite + 2) % 3)];
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function normalOf(pos: ArrayLike<number>, tri: number): THREE.Vector3 {
  const a = corner(pos, tri, 0);
  return corner(pos, tri, 1).sub(a).cross(corner(pos, tri, 2).sub(a)).normalize();
}

function isWorn(pos: ArrayLike<number>, normals: THREE.Vector3[], self: Side, other: Side): boolean {
  const n = normals[self.tri];
  const folded = Math.acos(THREE.MathUtils.clamp(n.dot(normals[other.tri]), -1, 1));
  const away = corner(pos, other.tri, other.opposite).sub(corner(pos, self.tri, (self.opposite + 1) % 3));
  return folded >= WEAR_EDGE.minAngle && n.dot(away) < 0;
}

function altitude(pos: ArrayLike<number>, tri: number, opposite: number): number {
  const a = corner(pos, tri, (opposite + 1) % 3);
  const b = corner(pos, tri, (opposite + 2) % 3);
  const area2 = b.clone().sub(a).cross(corner(pos, tri, opposite).sub(a)).length();
  return area2 / a.distanceTo(b);
}

function sidesByEdge(pos: ArrayLike<number>): Map<string, Side[]> {
  const ids = weldIds(pos);
  const sides = new Map<string, Side[]>();
  for (let tri = 0; tri < pos.length / 9; tri++) {
    for (let opposite = 0; opposite < 3; opposite++) {
      const key = edgeKey(ids, tri, opposite);
      sides.set(key, [...(sides.get(key) ?? []), { tri, opposite }]);
    }
  }
  return sides;
}

function markFold(out: Float32Array, pos: ArrayLike<number>, side: Side): void {
  for (let k = 0; k < 3; k++) out[(side.tri * 3 + k) * 3 + side.opposite] = k === side.opposite ? altitude(pos, side.tri, side.opposite) : 0;
}

export function edgeDistances(pos: ArrayLike<number>): Float32Array {
  const tris = pos.length / 9;
  const normals = Array.from({ length: tris }, (_, t) => normalOf(pos, t));
  const out = new Float32Array(tris * 9).fill(WEAR_EDGE.far);
  for (const pair of sidesByEdge(pos).values()) {
    if (pair.length !== 2) continue;
    if (isWorn(pos, normals, pair[0], pair[1])) markFold(out, pos, pair[0]);
    if (isWorn(pos, normals, pair[1], pair[0])) markFold(out, pos, pair[1]);
  }
  return out;
}
