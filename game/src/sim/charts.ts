import { REGION } from '../data/region';
import { EFFORT, SHOPS } from '../data/market';
import { TERRAIN } from '../data/terrain';
import { atlasOf, atlasSites, type Atlas } from './atlas';
import { chartSite } from './locations';
import { gridSquareArea, gridSquareOf, gridSquares, gridSquareSpan, sameGridSquare, type GridSquare } from './map-grid';
import { requireShop } from './market';
import { pay } from './economy';
import type { World } from './types';
import { playerCommand } from './world';
import { fairM } from './money';

export type SheetOffer = { square: GridSquare; price: number };

function squareName(square: GridSquare): string {
  return `${square.column},${square.row}`;
}

export function chartSeller(atlas: Atlas, square: GridSquare): string {
  const b = gridSquareArea(square);
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  let best: { id: string; gap: number } | null = null;
  for (const site of atlasSites(atlas)) {
    if (!SHOPS[site.id]?.charts) continue;
    const gap = Math.hypot(site.pos.x - cx, site.pos.y - cy);
    if (!best || gap < best.gap || (gap === best.gap && site.id < best.id)) best = { id: site.id, gap };
  }
  if (!best) throw new Error('No town on this map sells charts');
  return best.id;
}

export function unexploredIn(world: World, square: GridSquare): number {
  if (world.size !== REGION.size) throw new Error(`Map size ${world.size} is not the ${REGION.size} tiles of the map grid`);
  const b = gridSquareSpan(square);
  let n = 0;
  for (let y = b.y0; y < b.y1; y++) {
    const row = y * world.size;
    for (let x = b.x0; x < b.x1; x++) if (world.player.explored[row + x] === 0) n++;
  }
  return n;
}

export function chartPrice(unexplored: number): number {
  if (unexplored <= 0) return 0;
  return fairM((EFFORT.wage[1] * unexplored) / (2 * TERRAIN.vision.radius * EFFORT.refSpeed));
}

export function chartsOnSale(world: World, shopId: string): SheetOffer[] {
  if (!SHOPS[shopId]?.charts) return [];
  const atlas = atlasOf(world.terrain);
  const offers: SheetOffer[] = [];
  for (const square of gridSquares()) {
    if (chartSeller(atlas, square) !== shopId) continue;
    const unexplored = unexploredIn(world, square);
    if (unexplored > 0) offers.push({ square, price: chartPrice(unexplored) });
  }
  return offers;
}

export function buyChart(world: World, square: GridSquare): World {
  return playerCommand(world, (w) => {
    const shopId = requireShop(w);
    const atlas = atlasOf(w.terrain);
    if (chartSeller(atlas, square) !== shopId) throw new Error(`${shopId} does not sell square ${squareName(square)}`);
    const unexplored = unexploredIn(w, square);
    if (unexplored === 0) throw new Error(`Square ${squareName(square)} is already explored`);
    pay(w, chartPrice(unexplored));
    const b = gridSquareSpan(square);
    for (let y = b.y0; y < b.y1; y++) w.player.explored.fill(1, y * w.size + b.x0, y * w.size + b.x1);
    for (const site of atlasSites(atlas)) {
      if (sameGridSquare(gridSquareOf(site.pos), square) && !w.player.discovered.includes(site.id)) chartSite(w, site);
    }
  });
}
