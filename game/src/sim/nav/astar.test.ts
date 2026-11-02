import { describe, expect, it } from 'vitest';
import { perfSnapshot, resetPerf } from '../../perf';
import { emptyWorld, editableTerrain } from '../testkit';
import { CELL, navLayer } from './layer';
import { findCellsToward, stampOverlay } from './astar';
import type { Blocker } from './buckets';

const LONG_CELLS = 32;
const SHORT_GAP = 10;
const WALL_RADIUS = 6;
const WALL_SPACING = 2;

function flatLayer() {
  const w = emptyWorld();
  const t = editableTerrain(w);
  t.heights.fill(0);
  t.types.fill('sand');
  return navLayer(w.terrain, [], 1);
}

function wallAround(x: number, y: number): Blocker[] {
  const wall: Blocker[] = [];
  for (let a = 0; a < 2 * Math.PI; a += 0.1) wall.push({ pos: { x: x + Math.cos(a) * WALL_RADIUS, y: y + Math.sin(a) * WALL_RADIUS }, r: WALL_SPACING });
  return wall;
}

describe('a short search to a walled-in goal', () => {
  it('ends at the nearest reachable cell without leaving the box around its two ends', () => {
    const layer = flatLayer();
    const cellAt = (x: number, y: number): number => Math.floor(y / CELL) * layer.n + Math.floor(x / CELL);
    const goal = cellAt(40, 40);
    const start = cellAt(40 - SHORT_GAP, 40);
    resetPerf();
    const cells = findCellsToward(layer, stampOverlay(layer, wallAround(40, 40), 1), start, goal, null)!;
    const side = SHORT_GAP / CELL + 2 * LONG_CELLS + 1;
    expect(cells[cells.length - 1]).not.toBe(goal);
    expect(perfSnapshot()['route-search-cells'].calls).toBeLessThanOrEqual(side * side);
  });
});
