import { partDef } from '../data/parts';
import { cellRect, unitOfCells } from './body';
import { baseGrid, cellKey, facingOf, isMounted, itemCells } from './grid';
import type { GridItem } from './types';

export const BARREL_ENTRY = 0.02;

type Cell = { x: number; y: number };
type Heading = { x: number; z: number };

const HEADINGS: readonly Heading[] = [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }];
const lanes = new Map<string, readonly Cell[]>();

type DeckGun = Extract<GridItem, { kind: 'part' }>;

function isDeckGun(chassisId: string, item: GridItem): item is DeckGun {
  return item.kind === 'part' && partDef(item.part.defId).kind === 'weapon' && isMounted(chassisId, item);
}

function reachOf(defId: string): number {
  const def = partDef(defId);
  if (def.kind !== 'weapon' || !(def.reach > 0)) throw new Error(`Weapon ${defId} has no reach`);
  return def.reach;
}

export function barrelCells(chassisId: string, item: GridItem): readonly Cell[] {
  if (item.kind !== 'part') return [];
  const key = `${chassisId}|${item.part.defId}|${item.x},${item.y},${item.rot}`;
  const known = lanes.get(key);
  if (known) return known;
  const made = laneAhead(chassisId, item, reachOf(item.part.defId));
  lanes.set(key, made);
  return made;
}

function laneAhead(chassisId: string, item: DeckGun, reach: number): Cell[] {
  const heading = HEADINGS[(facingOf(item) / 90) % 4];
  const feet = itemCells(item);
  const own = new Set(feet.map((c) => cellKey(c.x, c.y)));
  const rect = cellRect(chassisId, feet);
  const sideways = heading.x === 0;
  const start = sideways ? (rect.z0 + rect.z1) / 2 : (rect.x0 + rect.x1) / 2;
  const end = start + (sideways ? heading.z : heading.x) * reach;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const unit = unitOfCells(chassisId, feet);
  const grid = baseGrid(chassisId);
  const [x0, x1] = [Math.min(...feet.map((c) => c.x)), Math.max(...feet.map((c) => c.x))];
  const [y0, y1] = [Math.min(...feet.map((c) => c.y)), Math.max(...feet.map((c) => c.y))];
  const cells: Cell[] = [];
  for (let y = unit.rows[0]; y < Math.min(unit.rows[1], grid.h); y++) {
    for (let x = 0; x < grid.w; x++) {
      const inLane = sideways ? y >= y0 && y <= y1 : x >= x0 && x <= x1;
      if (!inLane || own.has(cellKey(x, y))) continue;
      const r = cellRect(chassisId, [{ x, y }]);
      const [a, b] = sideways ? [r.z0, r.z1] : [r.x0, r.x1];
      if (Math.min(hi, b) - Math.max(lo, a) > BARREL_ENTRY) cells.push({ x, y });
    }
  }
  return cells;
}

export type BarrelField = { clashes: (item: GridItem) => boolean };

const NO_FIELD: BarrelField = { clashes: () => false };

export function barrelField(chassisId: string, items: readonly GridItem[], ignoreId: string | null): BarrelField {
  const guns = items.filter((it): it is DeckGun => it.id !== ignoreId && isDeckGun(chassisId, it));
  if (guns.length === 0) return NO_FIELD;
  const feet = new Set<number>();
  const barrels = new Set<number>();
  for (const gun of guns) {
    for (const c of itemCells(gun)) feet.add(cellKey(c.x, c.y));
    for (const c of barrelCells(chassisId, gun)) barrels.add(cellKey(c.x, c.y));
  }
  return {
    clashes(item) {
      if (!isDeckGun(chassisId, item)) return false;
      const mine = barrelCells(chassisId, item);
      if (mine.some((c) => feet.has(cellKey(c.x, c.y)) || barrels.has(cellKey(c.x, c.y)))) return true;
      return itemCells(item).some((c) => barrels.has(cellKey(c.x, c.y)));
    },
  };
}

export function barrelClash(chassisId: string, items: readonly GridItem[], item: GridItem): boolean {
  return barrelField(chassisId, items, item.id).clashes(item);
}
