import { REGION } from '../data/region';
import { TERRAIN, TRAILS } from '../data/terrain';
import { ROAD_INDEX } from '../sim/road-index';
import { randRange, type Rng } from '../sim/rng';
import { siteGap } from '../sim/sites';
import { BUILT_NONE, BUILT_SCRUB, BUILT_TRACK } from '../sim/terrain';
import { clamp, dist, type Vec } from '../sim/vec';
import { zoneWeight } from '../sim/zones';
import type { MapDraft } from './bake';
import { NodeHeap, nearestRoadPoint, ruleRng, tileCenter, tilesWithin } from './oldworld';

type Box = { x0: number; y0: number; x1: number; y1: number };
type Link = [Vec, Vec];
type Carve = { gap: number; target: number };

const SITES = [...REGION.towns, ...REGION.locations];
const HALF_ROAD = REGION.roadWidth / 2;
const STEPS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export function trailLayer(seed: number, d: MapDraft): MapDraft {
  const box = mountainBox(d.size);
  const nodes = trailNodes(ruleRng(seed, TRAILS.seedOffset), d, box);
  const grid = new TrailGrid(d, grown(box, TRAILS.maxLink, d.size));
  for (const [a, b] of trailLinks(nodes)) {
    const line = grid.route(a, b);
    if (line) cutTrail(d, line);
  }
  return d;
}

export function mountainBox(size: number): Box {
  let box: Box = { x0: size, y0: size, x1: 0, y1: 0 };
  const step = TRAILS.spacing / 2;
  for (let y = 0; y <= size; y += step) for (let x = 0; x <= size; x += step) {
    if (zoneWeight('mountains', x, y) >= TRAILS.minZone) box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
  }
  if (box.x1 < box.x0) throw new Error('No mountain ground for trails on this map');
  return box;
}

function grown(box: Box, by: number, size: number): Box {
  return { x0: Math.max(0, box.x0 - by), y0: Math.max(0, box.y0 - by), x1: Math.min(size, box.x1 + by), y1: Math.min(size, box.y1 + by) };
}

function trailNodes(rng: Rng, d: MapDraft, box: Box): Vec[] {
  const { spacing, jitter } = TRAILS;
  const out: Vec[] = [];
  for (let y = box.y0; y <= box.y1; y += spacing) for (let x = box.x0; x <= box.x1; x += spacing) {
    const p = { x: x + randRange(rng, -jitter, jitter) * spacing, y: y + randRange(rng, -jitter, jitter) * spacing };
    if (trailGround(d, p)) out.push(valleyNear(d, p));
  }
  return out.filter((p) => trailGround(d, p));
}

function trailGround(d: MapDraft, p: Vec): boolean {
  if (Math.min(p.x, p.y, d.size - p.x, d.size - p.y) < TRAILS.width) return false;
  return zoneWeight('mountains', p.x, p.y) >= TRAILS.minZone && SITES.every((s) => siteGap(s, p) > TRAILS.width);
}

function valleyNear(d: MapDraft, p: Vec): Vec {
  const reach = TRAILS.valleyReach;
  let best = p;
  for (let dy = -reach; dy <= reach; dy += 3) for (let dx = -reach; dx <= reach; dx += 3) {
    const q = { x: clamp(p.x + dx, 0, d.size), y: clamp(p.y + dy, 0, d.size) };
    if (cornerHeight(d, q) < cornerHeight(d, best)) best = q;
  }
  return best;
}

function cornerHeight(d: MapDraft, p: Vec): number {
  return d.heights[Math.round(p.y) * (d.size + 1) + Math.round(p.x)];
}

function trailLinks(nodes: readonly Vec[]): Link[] {
  const keys = new Set<string>();
  const out: Link[] = [];
  nodes.forEach((p, k) => {
    for (const m of nearest(nodes, k)) {
      const key = `${Math.min(k, m)}-${Math.max(k, m)}`;
      if (!keys.has(key)) out.push([p, nodes[m]]);
      keys.add(key);
    }
    const road = nearestRoadPoint(p);
    if (dist(p, road) <= TRAILS.roadLink) out.push([p, road]);
  });
  return out;
}

function nearest(nodes: readonly Vec[], k: number): number[] {
  return nodes
    .map((q, m) => ({ m, gap: m === k ? Infinity : dist(nodes[k], q) }))
    .filter((o) => o.gap <= TRAILS.maxLink)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, TRAILS.links)
    .map((o) => o.m);
}

class TrailGrid {
  private readonly w: number;
  private readonly h: number;
  private readonly heights: Float32Array;
  private readonly closed: Uint8Array;

  constructor(d: MapDraft, private readonly box: Box) {
    this.w = Math.floor((box.x1 - box.x0) / TRAILS.cell) + 1;
    this.h = Math.floor((box.y1 - box.y0) / TRAILS.cell) + 1;
    this.heights = new Float32Array(this.w * this.h);
    this.closed = new Uint8Array(this.w * this.h);
    const near = SITES.filter((s) => s.pos.x + s.radius >= box.x0 && s.pos.x - s.radius <= box.x1 && s.pos.y + s.radius >= box.y0 && s.pos.y - s.radius <= box.y1);
    for (let node = 0; node < this.heights.length; node++) {
      const p = this.posOf(node);
      this.heights[node] = cornerHeight(d, p);
      this.closed[node] = near.some((s) => siteGap(s, p) < 0) ? 1 : 0;
    }
  }

  route(from: Vec, to: Vec): Vec[] | null {
    const start = this.nodeNear(from);
    const goal = this.nodeNear(to);
    const parent = this.search(start, goal);
    if (parent === null) return null;
    const nodes = [goal];
    while (nodes[nodes.length - 1] !== start) nodes.push(parent[nodes[nodes.length - 1]]);
    const inner = nodes.slice(1, -1).filter((_, k) => (k + 1) % TRAILS.keepEvery === 0);
    return rounded([to, ...inner.map((node) => this.posOf(node)), from]);
  }

  private search(start: number, goal: number): Int32Array | null {
    const cost = new Float64Array(this.w * this.h).fill(Infinity);
    const parent = new Int32Array(this.w * this.h).fill(-1);
    const open = new NodeHeap();
    cost[start] = 0;
    open.push(start, 0);
    while (open.size > 0) {
      const a = open.pop();
      if (a === goal) return parent;
      for (const [di, dj, len] of STEPS) this.relax(a, di, dj, len, { cost, parent, open, goal });
    }
    return null;
  }

  private relax(a: number, di: number, dj: number, len: number, s: { cost: Float64Array; parent: Int32Array; open: NodeHeap; goal: number }): void {
    const b = this.openStep(a, di, dj);
    if (b < 0) return;
    const run = len * TRAILS.cell;
    const slope = Math.abs(this.heights[b] - this.heights[a]) / run / TERRAIN.drive.maxSlope;
    const through = s.cost[a] + run * (1 + TRAILS.slopeCost * slope * slope);
    if (through >= s.cost[b]) return;
    s.cost[b] = through;
    s.parent[b] = a;
    s.open.push(b, through + dist(this.posOf(b), this.posOf(s.goal)));
  }

  private openStep(a: number, di: number, dj: number): number {
    const i = (a % this.w) + di;
    const j = Math.floor(a / this.w) + dj;
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return this.closed[j * this.w + i] ? -1 : j * this.w + i;
  }

  private nodeNear(p: Vec): number {
    const i = clamp(Math.round((p.x - this.box.x0) / TRAILS.cell), 0, this.w - 1);
    return clamp(Math.round((p.y - this.box.y0) / TRAILS.cell), 0, this.h - 1) * this.w + i;
  }

  private posOf(node: number): Vec {
    return { x: this.box.x0 + (node % this.w) * TRAILS.cell, y: this.box.y0 + Math.floor(node / this.w) * TRAILS.cell };
  }
}

function rounded(line: Vec[]): Vec[] {
  let out = line;
  for (let pass = 0; pass < TRAILS.roundPasses; pass++) {
    const cut = out.slice(1).flatMap((b, k) => {
      const a = out[k];
      return [{ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 }];
    });
    out = [out[0], ...cut, out[out.length - 1]];
  }
  return out;
}

export function cutTrail(d: MapDraft, line: readonly Vec[]): void {
  const stations = densify(line);
  const profile = gradedProfile(stations.map((p) => cornerHeight(d, p)));
  const carves = new Map<number, Carve>();
  stations.forEach((p, k) => reachCorners(d, p, profile[k], carves));
  for (const [corner, c] of carves) d.heights[corner] = carvedHeight(d.heights[corner], c);
  for (const p of stations) markTrack(d, p);
}

function densify(line: readonly Vec[]): Vec[] {
  const out: Vec[] = [line[0]];
  for (let k = 1; k < line.length; k++) {
    const a = line[k - 1];
    const b = line[k];
    const steps = Math.max(1, Math.ceil(dist(a, b)));
    for (let s = 1; s <= steps; s++) out.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
  }
  return out;
}

export function gradedProfile(ground: readonly number[]): number[] {
  const reach = Math.floor(TRAILS.smooth / 2);
  const out = ground.map((_, k) => mean(ground.slice(Math.max(0, k - reach), k + reach + 1)));
  const last = out.length - 1;
  const rise = TERRAIN.drive.maxSlope * TRAILS.climb;
  for (let round = 0; round < TRAILS.gradeRounds; round++) {
    [out[0], out[last]] = [ground[0], ground[last]];
    for (let k = 1; k < last; k++) out[k] = clamp(out[k], out[k - 1] - rise, out[k - 1] + rise);
    for (let k = last - 1; k > 0; k--) out[k] = clamp(out[k], out[k + 1] - rise, out[k + 1] + rise);
  }
  return out;
}

export function trailOut(d: MapDraft, from: Vec, to: Vec): boolean {
  const reach = dist(from, to) + TRAILS.maxLink / 2;
  const box = { x0: Math.max(0, Math.min(from.x, to.x) - reach), y0: Math.max(0, Math.min(from.y, to.y) - reach), x1: Math.min(d.size, Math.max(from.x, to.x) + reach), y1: Math.min(d.size, Math.max(from.y, to.y) + reach) };
  const line = new TrailGrid(d, box).route(from, to);
  if (line) cutTrail(d, line);
  return line !== null;
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function reachCorners(d: MapDraft, p: Vec, target: number, carves: Map<number, Carve>): void {
  const reach = TRAILS.width / 2 + TRAILS.wallReach;
  const n = d.size + 1;
  for (const c of cornersWithin(d.size, p, reach)) {
    const gap = dist(c, p);
    const k = c.y * n + c.x;
    if (gap < (carves.get(k)?.gap ?? Infinity) && carvable(c)) carves.set(k, { gap, target });
  }
}

function cornersWithin(size: number, p: Vec, reach: number): Vec[] {
  const out: Vec[] = [];
  for (let y = Math.max(0, Math.ceil(p.y - reach)); y <= Math.min(size, Math.floor(p.y + reach)); y++) {
    for (let x = Math.max(0, Math.ceil(p.x - reach)); x <= Math.min(size, Math.floor(p.x + reach)); x++) if (Math.hypot(x - p.x, y - p.y) <= reach) out.push({ x, y });
  }
  return out;
}

function carvable(p: Vec): boolean {
  return ROAD_INDEX.nearestWithin(p.x, p.y, HALF_ROAD + 1) >= HALF_ROAD + 1 && SITES.every((s) => siteGap(s, p) >= 0);
}

function carvedHeight(h: number, c: Carve): number {
  const off = c.gap - TRAILS.width / 2;
  if (off <= 0) return c.target;
  return h > c.target ? Math.min(h, c.target + off * TRAILS.wall) : Math.max(h, c.target - off * TRAILS.wall);
}

function markTrack(d: MapDraft, p: Vec): void {
  for (const tile of tilesWithin(d.size, p, TRAILS.width / 2)) {
    const open = d.built[tile] === BUILT_NONE || d.built[tile] === BUILT_SCRUB;
    if (open && carvable(tileCenter(d.size, tile))) d.built[tile] = BUILT_TRACK;
  }
}
