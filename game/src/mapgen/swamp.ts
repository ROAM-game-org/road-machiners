import { SWAMP } from '../data/terrain';
import { flattenFactor } from '../sim/elevation';
import { noise2 } from '../sim/noise';
import { macroHeight } from '../sim/relief-solve';
import { chance, randRange, type Rng } from '../sim/rng';
import type { BakedProp } from '../sim/terrain';
import { zoneWeight } from '../sim/zones';
import { clamp, polylineDist, type Vec } from '../sim/vec';
import type { MapDraft } from './bake';
import { BUILT_BLACK_MUD, BUILT_DIRTY_WATER, BUILT_SCRUB } from './newworld';
import { place, prop, ruleRng, tileOf } from './oldworld';

const WET_WEIGHT = 0.05;
const BOX_STEP = 8;
const SHORE_SEED = 2;

type Box = { x0: number; x1: number; y0: number; y1: number };

export function swampLayer(seed: number, d: MapDraft): MapDraft {
  const box = swampBox(d.size);
  carveSloughs(seed, d, box);
  carveChannel(d);
  eachTile(box, d.size, (tile, c) => markTile(seed, d, tile, c));
  const rng = ruleRng(seed, SWAMP.seedOffset);
  scatterOnMud(d, rng, box, SWAMP.trees.tries, (pos) => prop('deadTree', pos, randRange(rng, ...SWAMP.trees.radius), randRange(rng, 0, Math.PI * 2)));
  scatterOnMud(d, rng, box, SWAMP.wrecks.tries, (pos) => prop('carWreck', pos, SWAMP.wrecks.radius, randRange(rng, 0, Math.PI * 2)));
  return d;
}

function wetness(seed: number, x: number, y: number): number {
  const open = 1 - flattenFactor(x, y);
  const { warp, cell } = SWAMP.shore;
  const share = clamp(open * (1 + warp) - warp * noise2(x / cell, y / cell, seed + SWAMP.seedOffset + SHORE_SEED), 0, 1);
  return share === 0 ? 0 : zoneWeight('swamp', x, y) * share;
}

function carveSloughs(seed: number, d: MapDraft, box: Box): void {
  const n = d.size + 1;
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const w = wetness(seed, x, y);
    if (w > WET_WEIGHT) d.heights[y * n + x] -= SWAMP.slough.depth * w * sloughShare(seed, x, y);
  }
}

export function sloughShare(seed: number, x: number, y: number): number {
  const { width, length, from } = SWAMP.slough;
  const along = x * Math.cos(SWAMP.outflow) + y * Math.sin(SWAMP.outflow);
  const across = -x * Math.sin(SWAMP.outflow) + y * Math.cos(SWAMP.outflow);
  const s = noise2(across / width, along / length, seed + SWAMP.seedOffset);
  return s <= from ? 0 : (s - from) / (1 - from);
}

function carveChannel(d: MapDraft): void {
  const n = d.size + 1;
  const { path, width, depth } = SWAMP.channel;
  const box = pathBox(path, width * 2, d.size);
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const gap = polylineDist({ x, y }, path);
    if (gap < width * 2 && flattenFactor(x, y) === 0) d.heights[y * n + x] -= depth * (1 - gap / (width * 2));
  }
  eachTile(box, d.size, (tile, c) => {
    if (flattenFactor(c.x, c.y) === 0 && polylineDist(c, path) < width) d.built[tile] = BUILT_BLACK_MUD;
  });
}

function markTile(seed: number, d: MapDraft, tile: number, c: Vec): void {
  if (d.built[tile] !== 0) return;
  const roll = noise2(c.x / SWAMP.scrubGrain, c.y / SWAMP.scrubGrain, seed + SWAMP.seedOffset + 1);
  const mark = depthMark(seed, d, tile, c, roll) ?? shoreMark(seed, c, roll);
  if (mark !== null) d.built[tile] = mark;
}

function depthMark(seed: number, d: MapDraft, tile: number, c: Vec, roll: number): number | null {
  const w = wetness(seed, c.x, c.y);
  return w <= WET_WEIGHT ? null : swampGround(tableAt(seed, c, w) - tileHeight(d, tile), roll);
}

function shoreMark(seed: number, c: Vec, roll: number): number | null {
  const flat = flattenFactor(c.x, c.y);
  if (flat <= 0 || flat >= 1) return null;
  const { cell, gain } = SWAMP.shore;
  const wet = zoneWeight('swamp', c.x, c.y) * clamp((1 - flat) * gain, 0, 1);
  if (noise2(c.x / cell, c.y / cell, seed + SWAMP.seedOffset + SHORE_SEED) >= wet) return null;
  return roll < SWAMP.scrubShare ? BUILT_SCRUB : BUILT_BLACK_MUD;
}

function tableAt(seed: number, c: Vec, w: number): number {
  return macroHeight(seed, c.x, c.y) + SWAMP.table.edge + (SWAMP.table.core - SWAMP.table.edge) * w;
}

export function swampGround(depth: number, roll: number): number | null {
  if (depth > SWAMP.water) return BUILT_DIRTY_WATER;
  if (depth > SWAMP.mud) return BUILT_BLACK_MUD;
  if (depth > SWAMP.mud - SWAMP.water) return roll < SWAMP.scrubShare ? BUILT_SCRUB : BUILT_BLACK_MUD;
  return null;
}

function tileHeight(d: MapDraft, tile: number): number {
  const n = d.size + 1;
  const k = Math.floor(tile / d.size) * n + (tile % d.size);
  return (d.heights[k] + d.heights[k + 1] + d.heights[k + n] + d.heights[k + n + 1]) / 4;
}

function scatterOnMud(d: MapDraft, rng: Rng, box: Box, tries: number, make: (pos: Vec) => BakedProp): void {
  for (let t = 0; t < tries; t++) {
    const pos = { x: randRange(rng, box.x0, box.x1), y: randRange(rng, box.y0, box.y1) };
    const mark = d.built[tileOf(d.size, pos)];
    if ((mark === BUILT_BLACK_MUD || mark === BUILT_SCRUB) && chance(rng, zoneWeight('swamp', pos.x, pos.y))) place(d, make(pos), 1);
  }
}

function eachTile(box: Box, size: number, visit: (tile: number, c: Vec) => void): void {
  for (let y = box.y0; y < Math.min(box.y1, size); y++) for (let x = box.x0; x < Math.min(box.x1, size); x++) visit(y * size + x, { x: x + 0.5, y: y + 0.5 });
}

function swampBox(size: number): Box {
  let box = { x0: size, x1: 0, y0: size, y1: 0 };
  for (let y = 0; y <= size; y += BOX_STEP) for (let x = 0; x <= size; x += BOX_STEP) {
    if (zoneWeight('swamp', x, y) > WET_WEIGHT) box = { x0: Math.min(box.x0, x), x1: Math.max(box.x1, x), y0: Math.min(box.y0, y), y1: Math.max(box.y1, y) };
  }
  return grown(box, BOX_STEP, size);
}

function pathBox(path: readonly Vec[], reach: number, size: number): Box {
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  return grown({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }, reach, size);
}

function grown(box: Box, by: number, size: number): Box {
  return { x0: Math.max(0, Math.floor(box.x0 - by)), x1: Math.min(size, Math.ceil(box.x1 + by)), y0: Math.max(0, Math.floor(box.y0 - by)), y1: Math.min(size, Math.ceil(box.y1 + by)) };
}
