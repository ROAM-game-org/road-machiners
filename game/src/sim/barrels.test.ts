import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { unitOfCells, unitsOf } from './body';
import { barrelCells } from './barrels';
import { MOUNT_CELLS, baseGrid, itemCells, layoutError, mountSpots, placementError, type Cell } from './grid';
import type { GridItem, Rot } from './types';

let counter = 0;

function part(defId: string, x: number, y: number, rot: Rot): GridItem {
  counter++;
  return { id: `i${counter}`, kind: 'part', x, y, rot, part: { id: `p${counter}`, defId, hp: 10, wear: 0 } };
}

function good(x: number, y: number): GridItem {
  counter++;
  return { id: `i${counter}`, kind: 'good', x, y, rot: 0, good: 'electronics' };
}

const hauler = baseGrid('hauler');
const refused = (items: GridItem[], item: GridItem) => placementError(hauler, items, item, null);

describe('barrel lanes', () => {
  it('lists the lane cells ahead of a gun and none behind it', () => {
    const cells = barrelCells('hauler', part('slugCannon', 2, 6, 0));
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c.x === 2 && c.y < 6)).toBe(true);
  });

  it('refuses a gun behind another gun in its lane, whichever is placed second', () => {
    const shotgun = part('shotgun', 2, 1, 0);
    const slug = part('slugCannon', 2, 4, 0);
    expect(refused([shotgun], slug)).toEqual({ id: 'barrel' });
    expect(refused([slug], shotgun)).toEqual({ id: 'barrel' });
  });

  it('refuses two barrels that cross', () => {
    const forward = part('slugCannon', 2, 6, 0);
    const across = part('slugCannon', 5, 4, 3);
    expect(refused([forward], across)).toEqual({ id: 'barrel' });
    expect(refused([across], forward)).toEqual({ id: 'barrel' });
  });

  it('allows the reported pair in neighbouring lanes', () => {
    const shotgun = part('shotgun', 1, 3, 0);
    const slug = part('slugCannon', 2, 3, 2);
    expect(refused([shotgun], slug)).toBeNull();
    expect(layoutError(hauler, [shotgun, slug])).toBeNull();
  });

  it('allows cargo and a scanner under a barrel', () => {
    const slug = part('slugCannon', 2, 6, 0);
    expect(refused([slug], good(2, 4))).toBeNull();
    expect(refused([slug], part('scanner', 2, 3, 0))).toBeNull();
  });

  it('allows a spare gun on plain cells under a barrel', () => {
    const found = Object.keys(CHASSIS).flatMap((id) => {
      const g = baseGrid(id);
      const gun = part('slugCannon', 0, 0, 0);
      return mountSpots(g, [], gun, MOUNT_CELLS.weapon as Cell[]).flatMap((spot) => {
        const mounted = { ...gun, ...spot };
        const plain = barrelCells(id, mounted).find((c) => g.cells[c.y][c.x] === '.');
        return plain ? [{ id, mounted, plain }] : [];
      });
    })[0];
    expect(found).toBeDefined();
    const spare = part('mg', found.plain.x, found.plain.y, 0);
    const g = baseGrid(found.id);
    const cells = itemCells(spare);
    if (cells.every((c) => g.cells[c.y]?.[c.x] === '.')) expect(placementError(g, [found.mounted], spare, null)).toBeNull();
  });

  it('reports the clash in a layout', () => {
    expect(layoutError(hauler, [part('shotgun', 2, 1, 0), part('slugCannon', 2, 4, 0)])).toEqual({ id: 'barrel' });
  });

  it('never lists a mount spot that placement refuses, on every chassis', () => {
    const problems: string[] = [];
    for (const id of Object.keys(CHASSIS)) {
      const g = baseGrid(id);
      const items: GridItem[] = [];
      for (const defId of ['slugCannon', 'shotgun', 'mg']) {
        const probe = part(defId, 0, 0, 0);
        const spot = mountSpots(g, items, probe, MOUNT_CELLS.weapon as Cell[])[0];
        if (spot) items.push({ ...probe, ...spot });
      }
      const next = part('mg', 0, 0, 0);
      for (const spot of mountSpots(g, items, next, MOUNT_CELLS.weapon as Cell[])) {
        if (placementError(g, items, { ...next, ...spot }, null) !== null) problems.push(`${id} ${spot.x},${spot.y} r${spot.rot}`);
      }
      if (layoutError(g, items) !== null) problems.push(`${id} layout`);
    }
    expect(problems).toEqual([]);
  });

  it('keeps every barrel on the unit of its gun', () => {
    const rigs = Object.keys(CHASSIS).filter((id) => unitsOf(id).length > 1);
    expect(rigs.length).toBeGreaterThan(0);
    for (const id of rigs) {
      const gun = part('slugCannon', 0, 0, 0);
      for (const spot of mountSpots(baseGrid(id), [], gun, MOUNT_CELLS.weapon as Cell[])) {
        const mounted = { ...gun, ...spot };
        const unit = unitOfCells(id, itemCells(mounted)).index;
        for (const c of barrelCells(id, mounted)) expect(unitOfCells(id, [c]).index).toBe(unit);
      }
    }
  });
});
