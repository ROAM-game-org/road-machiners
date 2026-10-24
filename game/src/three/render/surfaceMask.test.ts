import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SURFACE_MODELS } from '../../render/partLooks';
import { SURFACE_MASK } from './models';

type Marker = { version: number; side: number; white: number };
type Gltf = {
  scenes: { extras?: { surfaceMask?: Marker } }[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number }[] }[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
};
type Triangle = { corners: [number, number][]; keys: string[]; area: number };
type Island = { triangles: Triangle[] };

const UV_KEY = 1e6;
const SLACK = 0.02;
const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3 };

function readGlb(name: string): { json: Gltf; bin: Uint8Array } {
  const file = readFileSync(`public/models/${name}.glb`);
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8')) as Gltf;
  return { json, bin: new Uint8Array(file.buffer, file.byteOffset + 28 + jsonLength) };
}

function accessorValues(gltf: { json: Gltf; bin: Uint8Array }, index: number): number[][] {
  const accessor = gltf.json.accessors[index];
  const view = gltf.json.bufferViews[accessor.bufferView];
  const width = COMPONENTS[accessor.type];
  const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType]!;
  const stride = view.byteStride ?? width * bytes;
  const data = new DataView(gltf.bin.buffer, gltf.bin.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0));
  const read = (at: number) => ({ 5121: () => data.getUint8(at), 5123: () => data.getUint16(at, true), 5125: () => data.getUint32(at, true), 5126: () => data.getFloat32(at, true) })[accessor.componentType]!();
  return Array.from({ length: accessor.count }, (_, i) => Array.from({ length: width }, (_, k) => read(i * stride + k * bytes)));
}

function triangles(gltf: { json: Gltf; bin: Uint8Array }): Triangle[] {
  return gltf.json.meshes.flatMap((mesh) =>
    mesh.primitives.flatMap((primitive) => {
      const positions = accessorValues(gltf, primitive.attributes.POSITION);
      const uvs = accessorValues(gltf, primitive.attributes.TEXCOORD_0);
      const order = primitive.indices === undefined ? positions.map((_, i) => i) : accessorValues(gltf, primitive.indices).map((v) => v[0]);
      return Array.from({ length: order.length / 3 }, (_, t): Triangle => {
        const corner = [0, 1, 2].map((k) => order[t * 3 + k]);
        const [a, b, c] = corner.map((i) => positions[i]);
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const area = Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
        const corners = corner.map((i) => [uvs[i][0], 1 - uvs[i][1]] as [number, number]);
        return { corners, keys: corners.map(([x, y]) => `${Math.round(x * UV_KEY)},${Math.round(y * UV_KEY)}`), area };
      });
    }),
  );
}

function islands(all: Triangle[]): Island[] {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    const p = parent.get(k) ?? k;
    if (p === k) return k;
    const root = find(p);
    parent.set(k, root);
    return root;
  };
  for (const t of all) for (const k of t.keys.slice(1)) parent.set(find(k), find(t.keys[0]));
  const groups = new Map<string, Triangle[]>();
  for (const t of all) groups.set(find(t.keys[0]), [...(groups.get(find(t.keys[0])) ?? []), t]);
  return [...groups.values()].map((triangles) => ({ triangles }));
}

const uvArea = (t: Triangle) => Math.abs((t.corners[1][0] - t.corners[0][0]) * (t.corners[2][1] - t.corners[0][1]) - (t.corners[2][0] - t.corners[0][0]) * (t.corners[1][1] - t.corners[0][1])) / 2;

function thicknessPx(island: Island, side: number): number {
  const edges = new Map<string, number>();
  for (const t of island.triangles) {
    for (let k = 0; k < 3; k++) {
      const [a, b] = [k, (k + 1) % 3];
      const key = [t.keys[a], t.keys[b]].sort().join('|');
      edges.set(key, edges.has(key) ? 0 : Math.hypot(t.corners[a][0] - t.corners[b][0], t.corners[a][1] - t.corners[b][1]));
    }
  }
  const perimeter = [...edges.values()].reduce((s, l) => s + l, 0);
  return (4 * island.triangles.reduce((s, t) => s + uvArea(t), 0) * side) / perimeter;
}

function maskOf(name: string) {
  const gltf = readGlb(name);
  const marker = gltf.json.scenes[0].extras?.surfaceMask;
  if (!marker) throw new Error(`${name} has no surface mask marker`);
  const white = marker.white / 2 / marker.side;
  const isWhite = (island: Island) => island.triangles.every((t) => t.corners.every(([x, y]) => Math.abs(x - white) < 1e-5 && Math.abs(y - white) < 1e-5));
  const found = islands(triangles(gltf));
  return { marker, masked: found.filter((i) => !isWhite(i)) };
}

describe.each(SURFACE_MODELS)('surface mask of %s', (name) => {
  const { marker, masked } = maskOf(name);
  const side = marker.side;

  it('carries the current bake version', () => {
    expect(marker.version).toBe(SURFACE_MASK.version);
  });

  it('gives every masked UV island its own pixels', () => {
    const thin = masked.filter((island) => thicknessPx(island, side) < SURFACE_MASK.minIslandPx - SLACK);
    expect(thin.length).toBe(0);
  });

  it('keeps masked islands off the white block', () => {
    const block = marker.white / side;
    const inBlock = masked.filter((island) => island.triangles.some((t) => t.corners.some(([x, y]) => x < block && y < block)));
    expect(inBlock.length).toBe(0);
  });

  it('meets the mask texel, or fills the largest mask well', () => {
    const triangles = masked.flatMap((i) => i.triangles);
    const covered = triangles.reduce((s, t) => s + uvArea(t), 0);
    if (covered === 0) return;
    const texel = Math.sqrt(triangles.reduce((s, t) => s + t.area, 0) / (covered * side * side));
    const filledLargest = side === SURFACE_MASK.maxSide && covered >= SURFACE_MASK.leastFill;
    expect(texel <= SURFACE_MASK.metersPerPixel * (1 + SLACK) || filledLargest).toBe(true);
  });
});
