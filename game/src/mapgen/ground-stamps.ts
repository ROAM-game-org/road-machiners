import { REGION, type TerritoryDef } from '../data/region';
import { MAPGEN } from '../data/terrain';
import { pointInPolygon, polygonEdgeDist, type Vec } from '../sim/vec';
import type { MapDraft } from './bake';

const FILES = import.meta.glob<string>('./territory-ground.bin', { query: '?url&inline', import: 'default', eager: true });
const DATA_URL = 'data:application/octet-stream;base64,';
const MAGIC = 0x5053544b;
const SAND_UNIT = 10000;
const FLOW_UNIT = 10;

export type GroundStamp = {
  id: string;
  x0: number;
  y0: number;
  w: number;
  h: number;
  heights: Float32Array;
  sand: Uint16Array;
  flow: Uint16Array;
  slumped: Uint8Array;
};

function readFile(): Uint8Array {
  const url = FILES['./territory-ground.bin'];
  if (url === undefined || !url.startsWith(DATA_URL)) throw new Error('src/mapgen/territory-ground.bin is missing or did not inline as base64 data');
  return Uint8Array.from(atob(url.slice(DATA_URL.length)), (c) => c.charCodeAt(0));
}

function slice<T extends Float32Array | Uint16Array | Uint8Array>(bytes: Uint8Array, at: number, n: number, make: new (b: ArrayBuffer) => T, size: number): T {
  return new make(bytes.slice(at, at + n * size).buffer);
}

export function decodeStamps(bytes: Uint8Array): GroundStamp[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('territory-ground.bin is not a ground stamp file');
  const out: GroundStamp[] = [];
  let at = 8;
  for (let s = 0; s < view.getUint32(4, true); s++) {
    const length = view.getUint8(at);
    const id = new TextDecoder().decode(bytes.slice(at + 1, at + 1 + length));
    at += 1 + length;
    const [x0, y0, w, h] = [view.getInt32(at, true), view.getInt32(at + 4, true), view.getUint32(at + 8, true), view.getUint32(at + 12, true)];
    at += 16;
    const n = w * h;
    const heights = slice(bytes, at, n, Float32Array, 4);
    const sand = slice(bytes, at + n * 4, n, Uint16Array, 2);
    const flow = slice(bytes, at + n * 6, n, Uint16Array, 2);
    const slumped = slice(bytes, at + n * 8, n, Uint8Array, 1);
    at += n * 9;
    out.push({ id, x0, y0, w, h, heights, sand, flow, slumped });
  }
  return out;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function shareOf(t: TerritoryShape, p: Vec): number {
  const gap = pointInPolygon(p, t.outline) ? 0 : polygonEdgeDist(p, t.outline);
  return gap >= MAPGEN.groundFeather ? 0 : 1 - smooth(gap / MAPGEN.groundFeather);
}

type TerritoryShape = { outline: Vec[] };

export function stampTerritoryGround(d: MapDraft): MapDraft {
  const stamps = decodeStamps(readFile());
  const row = d.size + 1;
  for (const t of REGION.locations.filter((l): l is TerritoryDef => l.kind === 'territory')) {
    const stamp = stamps.find((s) => s.id === t.id);
    if (!stamp) throw new Error(`Territory ${t.id} has no ground stamp`);
    if (!t.groundFrom) throw new Error(`Territory ${t.id} has no place its ground was made at`);
    const [dx, dy] = [t.pos.x - t.groundFrom.x, t.pos.y - t.groundFrom.y];
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) throw new Error(`Territory ${t.id} stands off the tile grid of its ground`);
    const outline = t.outline!.map((p) => ({ x: t.pos.x + p.x, y: t.pos.y + p.y }));
    for (let j = 0; j < stamp.h; j++)
      for (let i = 0; i < stamp.w; i++) {
        const x = stamp.x0 + i + dx;
        const y = stamp.y0 + j + dy;
        if (x < 0 || y < 0 || x > d.size || y > d.size) continue;
        const share = shareOf({ outline }, { x, y });
        if (share === 0) continue;
        const [k, q] = [y * row + x, j * stamp.w + i];
        d.heights[k] += (stamp.heights[q] - d.heights[k]) * share;
        d.sand[k] += (stamp.sand[q] / SAND_UNIT - d.sand[k]) * share;
        d.flow[k] += (stamp.flow[q] / FLOW_UNIT - d.flow[k]) * share;
        if (share >= 0.5) d.slumped[k] = stamp.slumped[q];
      }
  }
  return d;
}
