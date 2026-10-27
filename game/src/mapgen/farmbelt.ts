import { REGION } from '../data/region';
import { FARM_BELT, TERRAIN } from '../data/terrain';
import { flattenFactor } from '../sim/elevation';
import { hash, noise2 } from '../sim/noise';
import { macroHeight } from '../sim/relief-solve';
import { chance, randInt, randRange, type Rng } from '../sim/rng';
import { siteGap } from '../sim/sites';
import type { BakedProp, PropKind } from '../sim/terrain';
import { zoneWeight } from '../sim/zones';
import { clamp, dist, polylineDist, segmentDist, type Vec } from '../sim/vec';
import type { MapDraft } from './bake';
import { BUILT_CANAL, BUILT_DITCH } from './newworld';
import { BUILT_FIELD, BUILT_TRACK, markable, place, prop, ruleRng } from './oldworld';

type Frame = { origin: Vec; down: Vec; across: Vec };
type Canal = { points: Vec[]; levels: number[] };
type Box = { x0: number; x1: number; y0: number; y1: number };
type Level = { n: number; cell: number; level: Float32Array; reach: Float32Array };

const C = FARM_BELT.canal;
const RIVER = TERRAIN.features.dryRiver.path;
const RIVER_BED = TERRAIN.features.dryRiver.width + TERRAIN.features.dryRiver.bank;
const BOWL = REGION.towns.find((t) => t.id === 'bowl');
const KEEP_OFF = [...REGION.towns, ...REGION.locations];
const LEVEL_CELL = 8;
const NO_CANAL = 1e9;
const DEG = Math.PI / 180;

export function farmBeltLayer(seed: number, d: MapDraft): MapDraft {
  const frame = beltFrame(seed, d.size);
  const canals = FARM_BELT.headgates.map((g) => traceCanal(seed, g.at, g.bank));
  const level = levelGrid(canals, d.size);
  const laterals = canals.flatMap((c) => lateralsOf(seed, c, frame, level));
  for (const c of canals) carveDitch(d, c.points, C.width, C.depth, frame);
  for (const l of laterals) carveDitch(d, l, C.lateralWidth, C.lateralDepth, frame);
  const groves = markPlots(seed, d, frame, level);
  const rng = ruleRng(seed, FARM_BELT.seedOffset);
  for (const plot of groves) plantGrove(d, rng, frame, plot);
  farmsteads(seed, d, rng, frame, level);
  return d;
}

function beltFrame(seed: number, size: number): Frame {
  let gx = 0;
  let gy = 0;
  for (let y = 0; y < size; y += 32) for (let x = 0; x < size; x += 32) {
    const w = zoneWeight('farmBelt', x, y);
    if (w < 0.5) continue;
    gx += w * (macroHeight(seed, x + 16, y) - macroHeight(seed, x - 16, y));
    gy += w * (macroHeight(seed, x, y + 16) - macroHeight(seed, x, y - 16));
  }
  const length = Math.hypot(gx, gy);
  if (length === 0) throw new Error('The farm belt has no slope to lay its grid along');
  const down = { x: -gx / length, y: -gy / length };
  return { origin: FARM_BELT.headgates[0].at, down, across: { x: -down.y, y: down.x } };
}

function local(frame: Frame, p: Vec): { u: number; v: number } {
  const dx = p.x - frame.origin.x;
  const dy = p.y - frame.origin.y;
  return { u: dx * frame.down.x + dy * frame.down.y, v: dx * frame.across.x + dy * frame.across.y };
}

function traceCanal(seed: number, gate: Vec, bank: number): Canal {
  const start = macroHeight(seed, gate.x, gate.y);
  const points = [gate];
  const levels = [start];
  let heading = riverHeading(gate);
  for (let s = C.step; s <= C.maxLength; s += C.step) {
    const next = bestStep(seed, points[points.length - 1], heading, start - C.fall * s, bank);
    if (!next) break;
    heading = Math.atan2(next.y - points[points.length - 1].y, next.x - points[points.length - 1].x);
    points.push(next);
    levels.push(start - C.fall * s);
  }
  if (points.length < 2) throw new Error(`The canal from ${gate.x.toFixed(0)}, ${gate.y.toFixed(0)} found no ground to run on`);
  return { points, levels };
}

function bestStep(seed: number, from: Vec, heading: number, target: number, bank: number): Vec | null {
  const steps = C.turns.map((turn) => stepCost(seed, from, heading, turn, target, bank)).filter((s) => s !== null);
  return steps.length === 0 ? null : steps.reduce((a, b) => (b.cost < a.cost ? b : a)).p;
}

function stepCost(seed: number, from: Vec, heading: number, turn: number, target: number, bank: number): { p: Vec; cost: number } | null {
  const a = heading + turn * DEG;
  const p = { x: from.x + Math.cos(a) * C.step, y: from.y + Math.sin(a) * C.step };
  if (!canalGround(p, bank)) return null;
  return { p, cost: Math.abs(macroHeight(seed, p.x, p.y) - target) + C.turnCost * Math.abs(turn) };
}

function canalGround(p: Vec, bank: number): boolean {
  if (zoneWeight('farmBelt', p.x, p.y) < FARM_BELT.weight / 2) return false;
  if (KEEP_OFF.some((s) => siteGap(s, p) < FARM_BELT.keepOff)) return false;
  return riverSide(p) === bank && polylineDist(p, RIVER) > FARM_BELT.keepOff;
}

function riverHeading(p: Vec): number {
  const k = nearestRiverLeg(p);
  return Math.atan2(RIVER[k + 1].y - RIVER[k].y, RIVER[k + 1].x - RIVER[k].x);
}

function riverSide(p: Vec): number {
  const k = nearestRiverLeg(p);
  const [a, b] = [RIVER[k], RIVER[k + 1]];
  return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) || 1;
}

function nearestRiverLeg(p: Vec): number {
  let best = 0;
  for (let k = 1; k + 1 < RIVER.length; k++) if (polylineDist(p, [RIVER[k], RIVER[k + 1]]) < polylineDist(p, [RIVER[best], RIVER[best + 1]])) best = k;
  return best;
}

function levelGrid(canals: readonly Canal[], size: number): Level {
  const n = Math.ceil(size / LEVEL_CELL) + 1;
  const level = new Float32Array(n * n).fill(-NO_CANAL);
  const reach = new Float32Array(n * n).fill(NO_CANAL);
  const samples = canals.flatMap((c) => c.points.map((p, k) => ({ p, h: c.levels[k] })));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const at = { x: i * LEVEL_CELL, y: j * LEVEL_CELL };
    if (zoneWeight('farmBelt', at.x, at.y) < FARM_BELT.weight) continue;
    const near = samples.reduce((a, b) => (dist(b.p, at) < dist(a.p, at) ? b : a));
    level[j * n + i] = near.h;
    reach[j * n + i] = dist(near.p, at);
  }
  return { n, cell: LEVEL_CELL, level, reach };
}

function irrigable(seed: number, level: Level, p: Vec): boolean {
  const k = clamp(Math.round(p.y / level.cell), 0, level.n - 1) * level.n + clamp(Math.round(p.x / level.cell), 0, level.n - 1);
  if (level.reach[k] > FARM_BELT.cell * FARM_BELT.plots) return false;
  return macroHeight(seed, p.x, p.y) < level.level[k] + FARM_BELT.command;
}

function lateralsOf(seed: number, canal: Canal, frame: Frame, level: Level): Vec[][] {
  const out: Vec[][] = [];
  for (let k = 1; k < canal.points.length; k++) {
    const [a, b] = [local(frame, canal.points[k - 1]).v, local(frame, canal.points[k]).v];
    if (Math.floor(a / FARM_BELT.cell) !== Math.floor(b / FARM_BELT.cell)) out.push(lateral(seed, canal.points[k], frame, level));
  }
  return out.filter((l) => l.length > 2);
}

function lateral(seed: number, from: Vec, frame: Frame, level: Level): Vec[] {
  const points = [from];
  for (let s = C.step; s <= C.lateralLength; s += C.step) {
    const p = { x: from.x + frame.down.x * s, y: from.y + frame.down.y * s };
    if (!irrigable(seed, level, p) || polylineDist(p, RIVER) < FARM_BELT.keepOff) break;
    points.push(p);
  }
  return points;
}

function carveDitch(d: MapDraft, line: readonly Vec[], width: number, depth: number, frame: Frame): void {
  const n = d.size + 1;
  for (const [k, gap] of lineGaps(line, width + C.bankWidth, n, 0)) {
    const p = { x: k % n, y: Math.floor(k / n) };
    if (flattenFactor(p.x, p.y) === 0 && !onTrackLine(frame, p)) d.heights[k] += ditchProfile(gap, width, depth);
  }
  markBed(d, line, width);
}

function lineGaps(line: readonly Vec[], reach: number, n: number, offset: number): Map<number, number> {
  const gaps = new Map<number, number>();
  for (let s = 1; s < line.length; s++) segmentGaps(gaps, line[s - 1], line[s], reach, n, offset);
  return gaps;
}

function segmentGaps(gaps: Map<number, number>, a: Vec, b: Vec, reach: number, n: number, offset: number): void {
  const box = lineBox([a, b], reach, n - 1);
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const gap = segmentDist({ x: x + offset, y: y + offset }, a, b);
    if (gap < Math.min(reach, gaps.get(y * n + x) ?? Infinity)) gaps.set(y * n + x, gap);
  }
}

export function ditchProfile(gap: number, width: number, depth: number): number {
  if (gap <= width) return -depth;
  if (gap <= width + 1) return -depth * (width + 1 - gap) + C.bank * (gap - width);
  return C.bank * clamp((width + C.bankWidth - gap) / (C.bankWidth - 1), 0, 1);
}

function markBed(d: MapDraft, line: readonly Vec[], width: number): void {
  if (!BOWL) throw new Error('The farm belt needs Bowl to water its canals');
  for (const [tile, gap] of lineGaps(line, width + 1, d.size, 0.5)) {
    const c = { x: (tile % d.size) + 0.5, y: Math.floor(tile / d.size) + 0.5 };
    if (!markable(d, tile)) continue;
    d.built[tile] = gap < width && dist(c, BOWL.pos) < C.wetReach ? BUILT_CANAL : BUILT_DITCH;
  }
}

function onTrackLine(frame: Frame, p: Vec): boolean {
  const { u, v } = local(frame, p);
  const w = FARM_BELT.track.width + 1;
  return modulo(u, FARM_BELT.cell) < w || modulo(v, FARM_BELT.cell) < w;
}

function modulo(a: number, m: number): number {
  return ((a % m) + m) % m;
}

function lineBox(line: readonly Vec[], reach: number, size: number): Box {
  const xs = line.map((p) => p.x);
  const ys = line.map((p) => p.y);
  const at = (v: number): number => clamp(Math.round(v), 0, size);
  return { x0: at(Math.min(...xs) - reach), x1: at(Math.max(...xs) + reach), y0: at(Math.min(...ys) - reach), y1: at(Math.max(...ys) + reach) };
}

type Plot = { iu: number; iv: number };

function markPlots(seed: number, d: MapDraft, frame: Frame, level: Level): Plot[] {
  const groves = new Map<string, Plot>();
  const box = beltBox(d.size);
  for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) {
    const c = { x: x + 0.5, y: y + 0.5 };
    if (!plottable(seed, d, level, c, y * d.size + x)) continue;
    const plot = markTile(seed, d, frame, c, y * d.size + x);
    if (plot) groves.set(`${plot.iu},${plot.iv}`, plot);
  }
  return [...groves.values()];
}

function plottable(seed: number, d: MapDraft, level: Level, c: Vec, tile: number): boolean {
  return polylineDist(c, RIVER) > RIVER_BED && irrigable(seed, level, c) && markable(d, tile);
}

function markTile(seed: number, d: MapDraft, frame: Frame, c: Vec, tile: number): Plot | null {
  const { u, v } = local(frame, c);
  if (!onTrackLine(frame, c)) return markPlot(seed, d, u, v, tile);
  if (trackIntact(seed, c, u, v)) d.built[tile] = BUILT_TRACK;
  return null;
}

function markPlot(seed: number, d: MapDraft, u: number, v: number, tile: number): Plot | null {
  const size = FARM_BELT.cell / FARM_BELT.plots;
  const plot = { iu: Math.floor(u / size), iv: Math.floor(v / size) };
  if (Math.min(modulo(u, size), modulo(v, size), size - modulo(u, size), size - modulo(v, size)) < FARM_BELT.plotInset) return null;
  const roll = hash(plot.iu, plot.iv, seed + FARM_BELT.seedOffset);
  if (roll < FARM_BELT.shares.field) d.built[tile] = BUILT_FIELD;
  return roll >= FARM_BELT.shares.field && roll < FARM_BELT.shares.field + FARM_BELT.shares.grove ? plot : null;
}

function trackIntact(seed: number, c: Vec, u: number, v: number): boolean {
  const { breakLength, intactFrom, intactTo, reach } = FARM_BELT.track;
  const along = modulo(u, FARM_BELT.cell) < modulo(v, FARM_BELT.cell) ? v : u;
  const fromGate = Math.min(...FARM_BELT.headgates.map((g) => dist(g.at, c)));
  const keep = intactFrom + (intactTo - intactFrom) * clamp(fromGate / reach, 0, 1);
  return noise2(along / breakLength, Math.floor(u / FARM_BELT.cell) * 7 + Math.floor(v / FARM_BELT.cell), seed + FARM_BELT.seedOffset + 1) < keep;
}

function beltBox(size: number): Box {
  let box = { x0: size, x1: 0, y0: size, y1: 0 };
  for (let y = 0; y <= size; y += 8) for (let x = 0; x <= size; x += 8) {
    if (zoneWeight('farmBelt', x, y) >= FARM_BELT.weight) box = { x0: Math.min(box.x0, x), x1: Math.max(box.x1, x), y0: Math.min(box.y0, y), y1: Math.max(box.y1, y) };
  }
  return { x0: Math.max(0, box.x0 - 8), x1: Math.min(size, box.x1 + 8), y0: Math.max(0, box.y0 - 8), y1: Math.min(size, box.y1 + 8) };
}

function toMap(frame: Frame, u: number, v: number): Vec {
  return { x: frame.origin.x + frame.down.x * u + frame.across.x * v, y: frame.origin.y + frame.down.y * u + frame.across.y * v };
}

function plantGrove(d: MapDraft, rng: Rng, frame: Frame, plot: Plot): void {
  const { row, step, missing, radius } = FARM_BELT.grove;
  const size = FARM_BELT.cell / FARM_BELT.plots;
  const yaw = Math.atan2(frame.down.y, frame.down.x);
  for (let a = FARM_BELT.plotInset + row / 2; a < size - FARM_BELT.plotInset; a += row) {
    for (let b = FARM_BELT.plotInset + step / 2; b < size - FARM_BELT.plotInset; b += step) {
      if (chance(rng, missing)) continue;
      const pos = toMap(frame, plot.iu * size + a, plot.iv * size + b);
      if (polylineDist(pos, RIVER) <= RIVER_BED) continue;
      place(d, prop('deadTree', pos, randRange(rng, ...radius), yaw + randRange(rng, -0.3, 0.3)), 1);
    }
  }
}

function farmsteads(seed: number, d: MapDraft, rng: Rng, frame: Frame, level: Level): void {
  const box = beltBox(d.size);
  const corners = [box.x0, box.x1].flatMap((x) => [box.y0, box.y1].map((y) => local(frame, { x, y })));
  const [u0, u1] = [Math.min(...corners.map((c) => c.u)), Math.max(...corners.map((c) => c.u))];
  const [v0, v1] = [Math.min(...corners.map((c) => c.v)), Math.max(...corners.map((c) => c.v))];
  const cell = FARM_BELT.cell;
  for (let iu = Math.floor(u0 / cell); iu <= Math.ceil(u1 / cell); iu++) for (let iv = Math.floor(v0 / cell); iv <= Math.ceil(v1 / cell); iv++) {
    const yard = toMap(frame, iu * cell + FARM_BELT.farmstead.spread, iv * cell + FARM_BELT.farmstead.spread);
    if (irrigable(seed, level, yard) && hash(iu, iv, seed + FARM_BELT.seedOffset + 2) < FARM_BELT.farmstead.share) farmstead(d, rng, yard);
  }
}

function farmstead(d: MapDraft, rng: Rng, yard: Vec): void {
  const f = FARM_BELT.farmstead;
  if (chance(rng, f.barnShare)) build(d, rng, yard, 'barn', f.barnRadius);
  build(d, rng, yard, chance(rng, 0.5) ? 'silo' : 'waterTower', f.siloRadius);
  for (let k = randInt(rng, ...f.houses); k > 0; k--) build(d, rng, yard, chance(rng, 0.4) ? 'house' : 'ruin', randRange(rng, ...f.houseRadius));
}

function build(d: MapDraft, rng: Rng, yard: Vec, kind: PropKind, r: number): BakedProp | null {
  for (let t = 0; t < FARM_BELT.farmstead.tries; t++) {
    const a = randRange(rng, 0, Math.PI * 2);
    const at = FARM_BELT.farmstead.spread * Math.sqrt(randRange(rng, 0, 1));
    const p = prop(kind, { x: yard.x + Math.cos(a) * at, y: yard.y + Math.sin(a) * at }, r, randRange(rng, 0, Math.PI * 2));
    if (place(d, p, 2)) return p;
  }
  return null;
}
