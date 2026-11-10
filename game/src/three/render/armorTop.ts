import * as THREE from 'three';
import { bodyTops, cellRect, unitOfCells, type CellRect, type HeightMap } from '../../sim/body';
import { baseGrid } from '../../sim/grid';

export type TopCut = { texture: THREE.DataTexture; first: THREE.Vector2; cell: number; size: THREE.Vector2 };
export type Seams = { along: number[]; across: number[] };

export const TOP_MARGIN = 0.02;
const TOP_REACH = 1.5;
const TOP_SINK = 0.03;
const TOP_LEAST_FEATURE = 0.5;
const TOP_SMOOTH_PASSES = 2;
const CAB_REACH = 0.3;
const CAB_STEP = 0.35;
const CAB_GUARD = 0.3;

type Grid = { cols: number; rows: number; first: THREE.Vector2; cell: number };
type Mask = ArrayLike<number>;

const topCuts = new WeakMap<HeightMap, TopCut>();

export function unitTopCut(chassisId: string, unit: number): TopCut {
  return topCut(bodyTops(chassisId, unit), plateSeams(chassisId, unit));
}

export function plateSeams(chassisId: string, unit: number): Seams {
  const grid = baseGrid(chassisId);
  const along = new Set<number>();
  const across = new Set<number>();
  const add = (into: Set<number>, cell: { x: number; y: number }, ends: (r: CellRect) => [number, number]) => {
    if (unitOfCells(chassisId, [cell]).index !== unit) return;
    for (const end of ends(cellRect(chassisId, [cell]))) into.add(Number(end.toFixed(4)));
  };
  for (let y = 1; y < grid.h - 1; y++) for (const x of [0, grid.w - 1]) add(along, { x, y }, (r) => [r.x0, r.x1]);
  for (let x = 1; x < grid.w - 1; x++) for (const y of [0, grid.h - 1]) add(across, { x, y }, (r) => [r.z0, r.z1]);
  return { along: [...along].sort((a, b) => a - b), across: [...across].sort((a, b) => a - b) };
}

export function topCut(map: HeightMap, seams: Seams): TopCut {
  const known = topCuts.get(map);
  if (known) return known;
  const pad = Math.ceil(TOP_REACH / map.cell);
  const grid: Grid = { cols: map.top.length + 2 * pad, rows: Math.max(...map.top.map((column) => column.length)) + 2 * pad, first: new THREE.Vector2(map.i0 - pad, map.j0 - pad), cell: map.cell };
  const heights = paddedHeights(map, grid, pad);
  const outside = heights.map((h) => (Number.isNaN(h) ? 1 : 0));
  const body = outside.map((o) => 1 - o);
  const reach = Math.round(TOP_LEAST_FEATURE / 2 / map.cell);
  guardCab(heights, opened(heights, body, grid, reach), grid, Math.round(CAB_REACH / map.cell));
  for (let grow = 0; grow < pad; grow++) spreadOutward(heights, grid);
  const line = opened(heights, outside, grid, reach);
  for (let pass = 0; pass < TOP_SMOOTH_PASSES; pass++) pickOver(line, outside, grid, 1, mean);
  straighten(heights, line, outside, grid, seams);
  const made = { texture: heightTexture(heights, grid), first: grid.first, cell: map.cell, size: new THREE.Vector2(grid.cols, grid.rows) };
  topCuts.set(map, made);
  return made;
}

export function cutHeightAt(cut: TopCut, x: number, z: number): number {
  const data = cut.texture.image.data as Float32Array;
  const at = (i: number, j: number) => data[clampTo(j, cut.size.y) * cut.size.x + clampTo(i, cut.size.x)];
  const ci = x / cut.cell - cut.first.x - 0.5;
  const cj = -z / cut.cell - cut.first.y - 0.5;
  const i = Math.floor(ci);
  const j = Math.floor(cj);
  const low = THREE.MathUtils.lerp(at(i, j), at(i + 1, j), ci - i);
  const high = THREE.MathUtils.lerp(at(i, j + 1), at(i + 1, j + 1), ci - i);
  return THREE.MathUtils.lerp(low, high, cj - j);
}

function clampTo(n: number, size: number): number {
  return Math.min(size - 1, Math.max(0, n));
}

function paddedHeights(map: HeightMap, grid: Grid, pad: number): Float32Array {
  const heights = new Float32Array(grid.cols * grid.rows).fill(Number.NaN);
  map.top.forEach((column, i) => column.forEach((top, j) => {
    if (top !== null) heights[(j + pad) * grid.cols + i + pad] = top / 100;
  }));
  return heights;
}

function eachCell(grid: Grid, visit: (i: number, j: number, k: number) => void): void {
  for (let j = 0; j < grid.rows; j++) for (let i = 0; i < grid.cols; i++) visit(i, j, j * grid.cols + i);
}

function inside(grid: Grid, i: number, j: number): boolean {
  return i >= 0 && i < grid.cols && j >= 0 && j < grid.rows;
}

function around(values: Float32Array, mask: Mask, grid: Grid, i: number, j: number, reach: number): number[] {
  const near: number[] = [];
  for (let dj = -reach; dj <= reach; dj++)
    for (let di = -reach; di <= reach; di++) {
      const k = (j + dj) * grid.cols + i + di;
      if (inside(grid, i + di, j + dj) && mask[k] && !Number.isNaN(values[k])) near.push(values[k]);
    }
  return near;
}

function pickOver(values: Float32Array, mask: Mask, grid: Grid, reach: number, pick: (...near: number[]) => number): void {
  const before = values.slice();
  eachCell(grid, (i, j, k) => {
    if (mask[k] && !Number.isNaN(before[k])) values[k] = pick(...around(before, mask, grid, i, j, reach));
  });
}

function opened(values: Float32Array, mask: Mask, grid: Grid, reach: number): Float32Array {
  const out = values.slice();
  pickOver(out, mask, grid, reach, Math.min);
  pickOver(out, mask, grid, reach, Math.max);
  return out;
}

function onEdge(broad: Float32Array, grid: Grid, i: number, j: number): boolean {
  return [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].some(([ni, nj]) => !inside(grid, ni, nj) || Number.isNaN(broad[nj * grid.cols + ni]));
}

function guardCab(heights: Float32Array, broad: Float32Array, grid: Grid, reach: number): void {
  const filled = broad.map((h) => (Number.isNaN(h) ? 0 : 1));
  eachCell(grid, (i, j, k) => {
    if (!filled[k] || !onEdge(broad, grid, i, j)) return;
    const inner = Math.max(...around(broad, filled, grid, i, j, reach));
    if (inner - broad[k] > CAB_STEP) heights[k] = Math.min(inner, broad[k] + CAB_GUARD);
  });
}

function spreadOutward(heights: Float32Array, grid: Grid): void {
  const before = heights.slice();
  eachCell(grid, (i, j, k) => {
    if (!Number.isNaN(before[k])) return;
    const near = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].filter(([ni, nj]) => inside(grid, ni, nj) && !Number.isNaN(before[nj * grid.cols + ni]));
    if (near.length > 0) heights[k] = mean(...near.map(([ni, nj]) => before[nj * grid.cols + ni]));
  });
}

function straighten(heights: Float32Array, line: Float32Array, outside: Mask, grid: Grid, seams: Seams): void {
  const index = (x: number, z: number) => clampTo(Math.floor(-z / grid.cell - grid.first.y), grid.rows) * grid.cols + clampTo(Math.floor(x / grid.cell - grid.first.x), grid.cols);
  eachCell(grid, (i, j, k) => {
    if (!outside[k]) return;
    const x = (i + grid.first.x + 0.5) * grid.cell;
    const z = -(j + grid.first.y + 0.5) * grid.cell;
    const seamed = within(seams.along, x) ? seamLine(seams.along, x, (sx) => line[index(sx, z)]) : within(seams.across, z) ? seamLine(seams.across, z, (sz) => line[index(x, sz)]) : line[k];
    heights[k] = Math.min(seamed, line[k]) - TOP_SINK;
  });
}

function within(seams: number[], p: number): boolean {
  return seams.length > 1 && p >= seams[0] && p <= seams[seams.length - 1];
}

function seamLine(seams: number[], p: number, height: (at: number) => number): number {
  let k = 0;
  while (k < seams.length - 2 && p > seams[k + 1]) k++;
  return THREE.MathUtils.lerp(height(seams[k]), height(seams[k + 1]), (p - seams[k]) / (seams[k + 1] - seams[k]));
}

function mean(...values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function heightTexture(heights: Float32Array, grid: Grid): THREE.DataTexture {
  const open = heights.map((h) => (Number.isNaN(h) ? Number.MAX_VALUE : h));
  const texture = new THREE.DataTexture(open, grid.cols, grid.rows, THREE.RedFormat, THREE.FloatType);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
