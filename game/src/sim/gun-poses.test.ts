import { describe, expect, it } from 'vitest';
import { barrelCells } from './barrels';
import { baseGrid, cellsTurned, facingOf, gridOf, itemCells, itemSize, mountSpots, nextTurn, placementError, turnsOf, MOUNT_CELLS } from './grid';
import { gunSpans } from './armor';
import { installSpot, planItemMove } from './inventory';
import { emptyWorld } from './testkit';
import type { GridItem, Rot, Vehicle } from './types';

let counter = 0;

function gun(defId: string, x: number, y: number, rot: Rot): GridItem {
  counter++;
  return { id: `g${counter}`, kind: 'part', x, y, rot, part: { id: `gp${counter}`, defId, hp: 10, wear: 0 } };
}

function crate(rot: Rot): GridItem {
  counter++;
  return { id: `c${counter}`, kind: 'part', x: 0, y: 0, rot, part: { id: `cp${counter}`, defId: 'wheelMid', hp: 10, wear: 0 } };
}

describe('gun poses', () => {
  it('lays the cells either way and points the barrel to any side', () => {
    const poses = ([0, 1, 2, 3, 4, 5, 6, 7] as Rot[]).map((rot) => {
      const item = gun('mg', 2, 5, rot);
      const size = itemSize(item);
      return `${rot}:${size.w}x${size.h}@${facingOf(item)}`;
    });
    expect(poses).toEqual(['0:1x3@0', '1:3x1@90', '2:1x3@180', '3:3x1@270', '4:3x1@0', '5:1x3@90', '6:3x1@180', '7:1x3@270']);
  });

  it('reports cells turned exactly when the footprint swaps', () => {
    expect(([0, 1, 2, 3, 4, 5, 6, 7] as Rot[]).filter((rot) => cellsTurned({ rot }))).toEqual([1, 3, 4, 6]);
  });

  it('refuses a pose outside the allowed ones', () => {
    expect(() => itemSize(gun('mg', 0, 0, 8 as Rot))).toThrow();
    expect(() => itemSize(gun('mg', 0, 0, -1 as Rot))).toThrow();
    expect(() => itemSize(crate(4))).toThrow();
  });

  it('turns a weapon through all eight poses and any other part through two', () => {
    const seen: Rot[] = [];
    let item = gun('mg', 0, 0, 0);
    do {
      seen.push(item.rot);
      item = { ...item, rot: nextTurn(item) };
    } while (item.rot !== 0);
    expect(seen).toEqual([0, 4, 1, 5, 2, 6, 3, 7]);
    expect(turnsOf(item)).toHaveLength(8);
    expect(nextTurn(crate(0))).toBe(1);
    expect(nextTurn(crate(1))).toBe(0);
    expect(nextTurn(crate(2))).toBe(0);
    expect(nextTurn(crate(3))).toBe(0);
    expect(turnsOf(crate(0))).toEqual([0, 1]);
  });

  it('opens the barrel lane across a lying gun to the front and to the rear', () => {
    const front = barrelCells('hauler', gun('mg', 2, 8, 4));
    const rear = barrelCells('hauler', gun('mg', 2, 8, 6));
    expect(front.length).toBeGreaterThan(0);
    expect(front.every((c) => c.y < 8 && c.x >= 2 && c.x <= 4)).toBe(true);
    expect(rear.length).toBeGreaterThan(0);
    expect(rear.every((c) => c.y > 8 && c.x >= 2 && c.x <= 4)).toBe(true);
  });

  it('centers the arc of a cross gun on its facing', () => {
    const arcCenter = (rot: Rot) => {
      const spans = gunSpans({ chassisId: 'hauler', items: [] } as never, gun('mg', 2, 8, rot));
      return spans.map((s) => (s.from + s.to) / 2);
    };
    expect(arcCenter(4)[0]).toBeCloseTo(arcCenter(0)[0], 5);
    expect(Math.abs(arcCenter(6)[0] - arcCenter(2)[0])).toBeLessThan(1e-6);
  });

  it('lists the poses along the cells before the ones across them', () => {
    const probe = gun('mg', 0, 0, 0);
    const spots = mountSpots(baseGrid('hauler'), [], probe, MOUNT_CELLS.weapon);
    const first = spots.findIndex((s) => s.rot >= 4);
    expect(first).toBeGreaterThan(0);
    expect(spots.slice(0, first).every((s) => s.rot < 4)).toBe(true);
    expect(spots.slice(first).every((s) => s.rot >= 4)).toBe(true);
  });

  it('refuses a gun standing in the lane of a cross gun, whichever is placed second', () => {
    const grid = baseGrid('hauler');
    const lying = gun('mg', 2, 11, 6);
    const ahead = gun('mg', 3, 12, 1);
    expect(placementError(grid, [lying], ahead, null)).toEqual({ id: 'barrel' });
    expect(placementError(grid, [ahead], lying, null)).toEqual({ id: 'barrel' });
    expect(itemCells(lying)).toHaveLength(3);
  });
});

describe('gun poses in a refit', () => {
  const weaponOf = (v: Vehicle) => v.items.find((it): it is GridItem & { kind: 'part' } => it.kind === 'part' && it.part.defId === 'mg')!;

  it('plans an in-place turn to a cross pose as one refit move', () => {
    const w = emptyWorld();
    const v = w.vehicles[0];
    const mg = weaponOf(v);
    const turn = mountSpots(gridOf(v), v.items, mg, MOUNT_CELLS.weapon).find((s) => s.rot >= 4 && s.x === mg.x && s.y === mg.y);
    const target = turn ?? mountSpots(gridOf(v), v.items, mg, MOUNT_CELLS.weapon).find((s) => s.rot >= 4)!;
    const result = planItemMove(v, mg.id, target);
    expect(result.error).toBeNull();
    expect(result.plan?.moves[0]).toMatchObject({ itemId: mg.id, to: target });
  });

  it('mounts a new gun along its cells and leaves cross poses to the Rotate control', () => {
    const w = emptyWorld();
    const v = w.vehicles[0];
    const mg = weaponOf(v);
    const others = { ...v, items: v.items.filter((it) => it.id !== mg.id) };
    const spot = installSpot(others, { ...mg, x: 0, y: 0, rot: 0 });
    expect(spot).not.toBeNull();
    expect(spot!.rot).toBeLessThan(4);
  });
});
