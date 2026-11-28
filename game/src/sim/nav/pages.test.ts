import { beforeAll, describe, expect, it } from 'vitest';
import { flatTerrain } from '../../test/empty-world';
import type { BakedMap, Terrain } from '../terrain';
import { findCells, stampOverlay } from './astar';
import { bakeRouteSummary, CELL, navLayer, withRoutes, type NavLayer } from './layer';

const MAP_TILES = 1024;
const RADIUS = 1;
const CROSSED_CELLS = { across: 2, down: 1 };
const NEAR_PAGES = (CROSSED_CELLS.across + 2) * (CROSSED_CELLS.down + 2);

let bakedTerrain: () => Terrain;

beforeAll(() => {
  const plain: BakedMap = { hash: 'flat', seed: 1, terrain: flatTerrain(MAP_TILES), props: [] };
  const routes = bakeRouteSummary(plain, [], [RADIUS]);
  bakedTerrain = () => withRoutes({ ...plain, terrain: flatTerrain(MAP_TILES) }, routes).terrain;
});

function cellAt(layer: NavLayer, x: number, y: number): number {
  return Math.floor(y / CELL) * layer.n + Math.floor(x / CELL);
}

function shortRoute(layer: NavLayer): number[] {
  const cells = findCells(layer, stampOverlay(layer, [], RADIUS), cellAt(layer, 100, 100), cellAt(layer, 130, 110), null);
  return [...cells!];
}

describe('a short route on a wide map with baked route pieces', () => {
  it('builds grid pages only in the two cells it crosses and the ring around them', () => {
    const layer = navLayer(bakedTerrain(), [], RADIUS);
    shortRoute(layer);
    expect(layer.blocked.pageCount()).toBeGreaterThan(0);
    expect(layer.blocked.pageCount()).toBeLessThanOrEqual(NEAR_PAGES);
    expect(layer.marks.pageCount()).toBeLessThanOrEqual(NEAR_PAGES);
    expect(layer.grid.local.pageCount()).toBeLessThanOrEqual(NEAR_PAGES);
  });

  it('finds the same cells again on a fresh layer', () => {
    const first = shortRoute(navLayer(bakedTerrain(), [], RADIUS));
    const again = shortRoute(navLayer(bakedTerrain(), [], RADIUS));
    expect(first.length).toBeGreaterThan(0);
    expect(again).toEqual(first);
  });
});
