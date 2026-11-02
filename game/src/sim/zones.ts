import { REGION } from '../data/region';
import { ZONE_FIELD, ZONE_RULES, ZONES, type Zone, type ZoneKind } from '../data/terrain';
import { noise2, smooth } from './noise';
import { clamp, pointInPolygon, polygonEdgeDist, polylineDist, type Vec } from './vec';

export const ZONE_KINDS = Object.keys(ZONE_RULES) as ZoneKind[];

type ZoneGrid = { n: number; cell: number; weights: Record<ZoneKind, Float32Array> };

let grid: ZoneGrid | undefined;

export function zoneWeight(kind: ZoneKind, x: number, y: number): number {
  return sample(zoneGrid(), zoneGrid().weights[kind], x, y);
}

export function zoneRoughness(x: number, y: number): number {
  let owned = 0;
  let rough = 0;
  for (const kind of ZONE_KINDS) {
    const w = zoneWeight(kind, x, y);
    owned += w;
    rough += w * ZONE_RULES[kind].roughness;
  }
  return rough + (1 - owned) * ZONE_FIELD.plainRoughness;
}

export function zoneUplift(x: number, y: number): number {
  let owned = 0;
  let lift = 0;
  for (const kind of ZONE_KINDS) {
    const w = zoneWeight(kind, x, y);
    owned += w;
    lift += w * ZONE_RULES[kind].uplift;
  }
  return lift + (1 - owned);
}

export function signedZoneGap(zone: Zone, p: Vec): number {
  if ('polygon' in zone.shape) {
    const edge = polygonEdgeDist(p, zone.shape.polygon);
    return pointInPolygon(p, zone.shape.polygon) ? -edge : edge;
  }
  return polylineDist(p, zone.shape.path) - zone.shape.width;
}

export function rawZoneWeight(zone: Zone, p: Vec): number {
  const band = ZONE_FIELD.band;
  return 1 - smooth(clamp((signedZoneGap(zone, warped(p)) + band / 2) / band, 0, 1));
}

function warped(p: Vec): Vec {
  const { frequency, reach, seedOffset } = ZONE_FIELD.warp;
  const dx = (noise2(p.x * frequency, p.y * frequency, seedOffset) - 0.5) * 2 * reach;
  const dy = (noise2(p.x * frequency, p.y * frequency, seedOffset + 1) - 0.5) * 2 * reach;
  return { x: p.x + dx, y: p.y + dy };
}

function zoneGrid(): ZoneGrid {
  if (grid) return grid;
  const cell = ZONE_FIELD.cell;
  const n = Math.ceil(REGION.size / cell) + 1;
  const weights = Object.fromEntries(ZONE_KINDS.map((k) => [k, new Float32Array(n * n)])) as Record<ZoneKind, Float32Array>;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) fillCell(weights, n, i, j, { x: i * cell, y: j * cell });
  grid = { n, cell, weights };
  return grid;
}

function fillCell(weights: Record<ZoneKind, Float32Array>, n: number, i: number, j: number, p: Vec): void {
  const raw = ZONE_KINDS.map((kind) => Math.max(0, ...ZONES.filter((z) => z.kind === kind).map((z) => rawZoneWeight(z, p))));
  const total = raw.reduce((a, b) => a + b, 0);
  const scale = total > 1 ? 1 / total : 1;
  ZONE_KINDS.forEach((kind, k) => (weights[kind][j * n + i] = raw[k] * scale));
}

function sample(g: ZoneGrid, field: Float32Array, x: number, y: number): number {
  const gx = clamp(x / g.cell, 0, g.n - 1.001);
  const gy = clamp(y / g.cell, 0, g.n - 1.001);
  const i = Math.floor(gx);
  const j = Math.floor(gy);
  const fx = gx - i;
  const fy = gy - j;
  const k = j * g.n + i;
  const a = field[k];
  const b = field[k + 1];
  const c = field[k + g.n];
  const d = field[k + g.n + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
