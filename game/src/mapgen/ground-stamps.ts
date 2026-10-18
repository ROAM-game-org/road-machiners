import { STAMP_SITES, stampShare, type StampSite } from '../sim/ground-stamps';
import type { Vec } from '../sim/vec';
import type { MapDraft } from './bake';

const FILES = import.meta.glob<string>('./ground-stamps.bin', { query: '?url&inline', import: 'default', eager: true });
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
  const url = FILES['./ground-stamps.bin'];
  if (url === undefined || !url.startsWith(DATA_URL)) throw new Error('src/mapgen/ground-stamps.bin is missing or did not inline as base64 data');
  return Uint8Array.from(atob(url.slice(DATA_URL.length)), (c) => c.charCodeAt(0));
}

function slice<T extends Float32Array | Uint16Array | Uint8Array>(bytes: Uint8Array, at: number, n: number, make: new (b: ArrayBuffer) => T, size: number): T {
  return new make(bytes.slice(at, at + n * size).buffer);
}

export function decodeStamps(bytes: Uint8Array): GroundStamp[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('ground-stamps.bin is not a ground stamp file');
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

function blend(d: MapDraft, stamp: GroundStamp, k: number, q: number, share: number): void {
  d.heights[k] += (stamp.heights[q] - d.heights[k]) * share;
  d.sand[k] += (stamp.sand[q] / SAND_UNIT - d.sand[k]) * share;
  d.flow[k] += (stamp.flow[q] / FLOW_UNIT - d.flow[k]) * share;
  if (share >= 0.5) d.slumped[k] = stamp.slumped[q];
}

function onMap(d: MapDraft, at: Vec): boolean {
  return at.x >= 0 && at.y >= 0 && at.x <= d.size && at.y <= d.size;
}

function stampSite(d: MapDraft, site: StampSite, stamp: GroundStamp): void {
  const row = d.size + 1;
  for (let j = 0; j < stamp.h; j++)
    for (let i = 0; i < stamp.w; i++) {
      const at = { x: stamp.x0 + i + site.shift.x, y: stamp.y0 + j + site.shift.y };
      const share = onMap(d, at) ? stampShare(site, at) : 0;
      if (share > 0) blend(d, stamp, at.y * row + at.x, j * stamp.w + i, share);
    }
}

let decoded: GroundStamp[] | null = null;

function stampsOnDisk(): GroundStamp[] {
  decoded ??= decodeStamps(readFile());
  return decoded;
}

export function stampTerritoryGround(d: MapDraft): MapDraft {
  const stamps = stampsOnDisk();
  for (const site of STAMP_SITES) {
    const stamp = stamps.find((s) => s.id === site.id);
    if (!stamp) throw new Error(`${site.id} has no ground stamp`);
    stampSite(d, site, stamp);
  }
  return d;
}
