
import { gridOf, holdIndex, holdOwners, isDeadCell, itemCells, type Grid } from './grid';
import { claimSpill } from './parley';
import { spillOnPile } from './salvage';
import { modeRules } from './settings';
import type { GridItem, Vehicle, World } from './types';

export function spillDeadCells(world: World): void {
  for (const v of world.vehicles) spillVehicle(world, v);
}

function spillVehicle(world: World, v: Vehicle): void {
  const g = gridOf(v);
  if (!g.hold.includes('x')) return;
  for (const [part, items] of spilledByPart(g, v)) {
    if (modeRules(world).looting) spillOnGround(world, v, part, items);
    else loseCargo(world, v, part, items);
  }
}

function spilledByPart(g: Grid, v: Vehicle): Map<string, GridItem[]> {
  const owners = holdOwners(v);
  const spilled = new Map<string, GridItem[]>();
  for (const it of v.items) {
    const part = it.kind === 'parcel' ? null : deadOwner(g, owners, it);
    if (part) spilled.set(part, [...(spilled.get(part) ?? []), it]);
  }
  return spilled;
}

function deadOwner(g: Grid, owners: readonly (string | null)[], item: GridItem): string | null {
  const dead = itemCells(item).find((c) => isDeadCell(g, c.x, c.y));
  if (!dead) return null;
  const owner = owners[holdIndex(g, dead.x, dead.y) ?? -1];
  if (!owner) throw new Error(`dead hold cell ${dead.x},${dead.y} has no cargo part`);
  return owner;
}

function spillOnGround(world: World, v: Vehicle, part: string, items: GridItem[]): void {
  const stock = spillOnPile(world, v, items);
  world.events.push({ t: 'cargoSpilled', vehicle: v.id, part, pile: stock.id, units: items.length });
  claimSpill(world, v, stock);
}

function loseCargo(world: World, v: Vehicle, part: string, items: GridItem[]): void {
  const lost = new Set(items.map((it) => it.id));
  v.items = v.items.filter((it) => !lost.has(it.id));
  world.events.push({ t: 'cargoSpilled', vehicle: v.id, part, pile: null, units: items.length });
}
