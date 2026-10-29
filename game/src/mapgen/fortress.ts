
import { FORTRESS_SITES, NOSE_ROCK } from '../data/fortress';
import { REGION } from '../data/region';
import { PHYSICS } from '../data/physics';
import { TERRAIN } from '../data/terrain';
import { fortressOutline, fortressProps, pitDepth } from '../sim/fortress';
import { boxDistance, propBoxes, propObstacle } from '../sim/mapgen';
import { noise2, smooth } from '../sim/noise';
import { noseFrame, noseRocks } from '../sim/nose';
import { sitePads, type Site } from '../sim/sites';
import { dist, segmentDist, type Vec } from '../sim/vec';
import { typeCode, type MapDraft } from './bake';
import { steep } from './marks';
import { noseRiseAt, noseRiseReach } from './nose-rise';
import { tileOf } from './oldworld';

const S = PHYSICS.metersPerTile;

export function fortressLayer(d: MapDraft): MapDraft {
  const sites = [...REGION.towns, ...REGION.locations].filter((site) => site.id in FORTRESS_SITES);
  for (const site of sites) if (FORTRESS_SITES[site.id].pit !== undefined) digPit(d, site);
  const props = sites.flatMap(fortressProps);
  const nose = sites.find((site) => site.id === 'nose');
  if (nose === undefined) throw new Error('Nose is no fortress site, and its rock masses stand in its frame');
  const rockBoxes = noseRocks(nose).flatMap((p, k) => propBoxes(propObstacle(p, k)));
  raiseRock(d, nose);
  const clear = d.props.filter((p) => !rockBoxes.some((b) => boxDistance(b, p.pos) < p.r) && !(p.kind === 'rock' && steep(d, tileOf(d.size, p.pos))));
  return { ...d, props: [...clear, ...props] };
}

type RockGrid = { x0: number; y0: number; w: number; h: number; tops: Float32Array };
type RockReach = { depth: Float32Array; top: Float32Array };

function raiseRock(d: MapDraft, site: Site): void {
  const base = d.heights[Math.round(site.pos.y) * (d.size + 1) + Math.round(site.pos.x)];
  const g = rockGrid(d.size, site, noseRiseReach() / S + NOSE_ROCK.run);
  const r = rockReach(g);
  const lift = rockLift(site);
  const raised = new Uint8Array(g.w * g.h);
  for (let k = 0; k < raised.length; k++) {
    const at = (g.y0 + Math.floor(k / g.w)) * (d.size + 1) + g.x0 + (k % g.w);
    const top = base + lift({ x: g.x0 + (k % g.w), y: g.y0 + Math.floor(k / g.w) }, r.depth[k], r.top[k]);
    if (Math.fround(top) <= d.heights[at]) continue;
    d.heights[at] = top;
    raised[k] = 1;
  }
  typeRock(d, site, g, raised);
}

function typeRock(d: MapDraft, site: Site, g: RockGrid, raised: Uint8Array): void {
  const scree = typeCode('scree');
  for (let j = 0; j < g.h - 1; j++) {
    for (let i = 0; i < g.w - 1; i++) {
      const k = j * g.w + i;
      const lifted = [k, k + 1, k + g.w, k + g.w + 1].every((c) => raised[c] === 1);
      if (lifted && outsideMargin(d, site, g.x0 + i, g.y0 + j)) d.types[(g.y0 + j) * d.size + g.x0 + i] = scree;
    }
  }
}

function rockGrid(size: number, site: Site, reach: number): RockGrid {
  const x0 = Math.max(0, Math.floor(site.pos.x - reach));
  const y0 = Math.max(0, Math.floor(site.pos.y - reach));
  const w = Math.min(size, Math.ceil(site.pos.x + reach)) - x0 + 1;
  const h = Math.min(size, Math.ceil(site.pos.y + reach)) - y0 + 1;
  const top = rockTop(site);
  const tops = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) tops[j * w + i] = top({ x: x0 + i, y: y0 + j });
  return { x0, y0, w, h, tops };
}

function rockTop(site: Site): (p: Vec) => number {
  const { u, v } = noseFrame(site);
  const { seed, jitterCell } = NOSE_ROCK;
  return (p) => {
    const du = (p.x - site.pos.x) * u.x + (p.y - site.pos.y) * u.y;
    const dv = (p.x - site.pos.x) * v.x + (p.y - site.pos.y) * v.y;
    const rise = noseRiseAt(du * S, dv * S);
    if (rise === null) return Number.NaN;
    const jitter = (2 * noise2(p.x / jitterCell, p.y / jitterCell, seed + 1) - 1) * rise.jitter;
    return Math.max(0, rise.height + jitter) / S;
  };
}

function rockReach(g: RockGrid): RockReach {
  const outside = chamfer(g, (k) => !Number.isNaN(g.tops[k]));
  const depth = new Float32Array(g.w * g.h);
  const top = new Float32Array(g.w * g.h);
  for (let k = 0; k < depth.length; k++) {
    depth[k] = Number.isNaN(g.tops[k]) ? outside.dist[k] : 0;
    top[k] = g.tops[outside.from[k]];
  }
  return { depth, top: blurredOff(g, top, depth) };
}

function blurredOff(g: RockGrid, top: Float32Array, depth: Float32Array): Float32Array {
  const out = top.slice();
  for (let k = 0; k < out.length; k++) if (depth[k] > 0) out[k] = meanOff(g, top, depth, k);
  return out;
}

function meanOff(g: RockGrid, top: Float32Array, depth: Float32Array, k: number): number {
  const r = NOSE_ROCK.footBlur;
  let sum = 0;
  let n = 0;
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const m = neighbour(g, k, di, dj);
    if (m >= 0 && depth[m] > 0) [sum, n] = [sum + top[m], n + 1];
  }
  return sum / n;
}

const CHAMFER = [[-1, -1, Math.SQRT2], [0, -1, 1], [1, -1, Math.SQRT2], [-1, 0, 1]] as const;

function chamfer(g: RockGrid, seed: (k: number) => boolean): { dist: Float32Array; from: Int32Array } {
  const dist = Float32Array.from({ length: g.w * g.h }, (_, k) => (seed(k) ? 0 : Infinity));
  const from = Int32Array.from({ length: g.w * g.h }, (_, k) => k);
  for (let k = 0; k < dist.length; k++) relaxChamfer(g, dist, from, k, 1);
  for (let k = dist.length - 1; k >= 0; k--) relaxChamfer(g, dist, from, k, -1);
  return { dist, from };
}

function relaxChamfer(g: RockGrid, dist: Float32Array, from: Int32Array, k: number, sign: 1 | -1): void {
  for (const [di, dj, cost] of CHAMFER) {
    const n = neighbour(g, k, sign * di, sign * dj);
    if (n < 0 || dist[n] + cost >= dist[k]) continue;
    dist[k] = dist[n] + cost;
    from[k] = from[n];
  }
}

function neighbour(g: RockGrid, k: number, di: number, dj: number): number {
  const i = (k % g.w) + di;
  const j = Math.floor(k / g.w) + dj;
  return i < 0 || j < 0 || i >= g.w || j >= g.h ? -1 : j * g.w + i;
}

function rockLift(site: Site): (p: Vec, out: number, top: number) => number {
  const { seed, jag, jagCell, run, blend } = NOSE_ROCK;
  const clearOfRoads = roadShare(site, run);
  return (p, out, top) => {
    if (out === 0) return top;
    const beyond = smooth(unit((dist(p, site.pos) - site.radius - TERRAIN.types.siteMargin) / blend));
    if (beyond === 0) return 0;
    const edge = out + jag * noise2(p.x / jagCell, p.y / jagCell, seed);
    return top * smooth(unit(1 - edge / run)) * clearOfRoads(p) * beyond;
  };
}

function unit(t: number): number {
  return Math.min(1, Math.max(0, t));
}

function roadShare(site: Site, far: number): (p: Vec) => number {
  const { clear, ramp } = NOSE_ROCK;
  const roads = REGION.roads.flatMap((road) => road.slice(1).map((b, i) => [road[i], b] as const)).filter(([a, b]) => segmentDist(site.pos, a, b) < far * 3);
  const pads = sitePads(site);
  return (p) => {
    const fromRoad = Math.min(...roads.map(([a, b]) => segmentDist(p, a, b) - REGION.roadWidth / 2), ...pads.map((pad) => dist(p, pad) - REGION.sites.pad.width / 2));
    return unit((fromRoad - clear) / ramp);
  };
}

function outsideMargin(d: MapDraft, site: Site, x: number, y: number): boolean {
  return x < d.size && y < d.size && dist({ x: x + 0.5, y: y + 0.5 }, site.pos) >= site.radius + TERRAIN.types.siteMargin;
}

function digPit(d: MapDraft, site: Site): void {
  const box = outlineBox(site, d.size);
  const n = d.size + 1;
  const depth = new Float32Array(box.w * box.h);
  for (let j = 0; j < box.h; j++) {
    for (let i = 0; i < box.w; i++) {
      depth[j * box.w + i] = pitDepth(site, { x: box.x0 + i, y: box.y0 + j });
      d.heights[(box.y0 + j) * n + box.x0 + i] -= depth[j * box.w + i];
    }
  }
  typePit(d, box, depth);
}

type CornerBox = { x0: number; y0: number; w: number; h: number };

function outlineBox(site: Site, size: number): CornerBox {
  const outline = fortressOutline(site);
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  return { x0, y0, w: Math.min(size, Math.ceil(Math.max(...xs))) - x0 + 1, h: Math.min(size, Math.ceil(Math.max(...ys))) - y0 + 1 };
}

function typePit(d: MapDraft, box: CornerBox, depth: Float32Array): void {
  const field = typeCode('field');
  const scree = typeCode('scree');
  for (let y = 0; y < box.h - 1; y++) {
    for (let x = 0; x < box.w - 1; x++) {
      const k = y * box.w + x;
      const corners = [depth[k], depth[k + 1], depth[k + box.w], depth[k + box.w + 1]];
      if (corners.some((c) => c > 0)) d.types[(box.y0 + y) * d.size + box.x0 + x] = corners.every((c) => c === corners[0]) ? field : scree;
    }
  }
}
