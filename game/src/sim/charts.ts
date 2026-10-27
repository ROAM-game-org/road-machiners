import { CHARTS } from '../data/charts';
import { EFFORT, SHOPS } from '../data/market';
import { TERRAIN } from '../data/terrain';
import { atlasOf, atlasSites, type Atlas } from './atlas';
import { chartSite } from './locations';
import { requireShop } from './market';
import { pay } from './economy';
import type { World } from './types';
import { playerCommand } from './world';
import { fairM } from './money';

export type Sheet = { col: number; row: number };
export type SheetBounds = { x0: number; y0: number; x1: number; y1: number };
export type SheetOffer = { sheet: Sheet; price: number };

export function sheetId(s: Sheet): string {
  return `${s.col},${s.row}`;
}

export function sheetSide(size: number): number {
  const side = size / CHARTS.perSide;
  if (!Number.isInteger(side)) throw new Error(`Map size ${size} does not split into ${CHARTS.perSide} whole sheets a side`);
  return side;
}

export function chartSheets(size: number): Sheet[] {
  sheetSide(size);
  const sheets: Sheet[] = [];
  for (let row = 0; row < CHARTS.perSide; row++) for (let col = 0; col < CHARTS.perSide; col++) sheets.push({ col, row });
  return sheets;
}

export function sheetAt(size: number, p: { x: number; y: number }): Sheet {
  const side = sheetSide(size);
  return { col: Math.floor(p.x / side), row: Math.floor(p.y / side) };
}

export function sheetTiles(size: number, sheet: Sheet): SheetBounds {
  const side = sheetSide(size);
  if (sheet.col < 0 || sheet.row < 0 || sheet.col >= CHARTS.perSide || sheet.row >= CHARTS.perSide)
    throw new Error(`Sheet ${sheetId(sheet)} is off the map`);
  return { x0: sheet.col * side, y0: sheet.row * side, x1: (sheet.col + 1) * side, y1: (sheet.row + 1) * side };
}

export function chartSeller(atlas: Atlas, sheet: Sheet, size: number): string {
  const b = sheetTiles(size, sheet);
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

export function unexploredIn(world: World, sheet: Sheet): number {
  const b = sheetTiles(world.size, sheet);
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
  for (const sheet of chartSheets(world.size)) {
    if (chartSeller(atlas, sheet, world.size) !== shopId) continue;
    const unexplored = unexploredIn(world, sheet);
    if (unexplored > 0) offers.push({ sheet, price: chartPrice(unexplored) });
  }
  return offers;
}

export function buyChart(world: World, sheet: Sheet): World {
  return playerCommand(world, (w) => {
    const shopId = requireShop(w);
    const atlas = atlasOf(w.terrain);
    if (chartSeller(atlas, sheet, w.size) !== shopId) throw new Error(`${shopId} does not sell sheet ${sheetId(sheet)}`);
    const unexplored = unexploredIn(w, sheet);
    if (unexplored === 0) throw new Error(`Sheet ${sheetId(sheet)} is already explored`);
    pay(w, chartPrice(unexplored));
    const b = sheetTiles(w.size, sheet);
    for (let y = b.y0; y < b.y1; y++) w.player.explored.fill(1, y * w.size + b.x0, y * w.size + b.x1);
    for (const site of atlasSites(atlas)) {
      const inside = site.pos.x >= b.x0 && site.pos.x < b.x1 && site.pos.y >= b.y0 && site.pos.y < b.y1;
      if (inside && !w.player.discovered.includes(site.id)) chartSite(w, site);
    }
  });
}
