import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { cellsTurned, poseTurnedLike, turnsOf } from './grid';
import { planItemMove } from './inventory';
import { emptyWorld } from './testkit';
import type { GridItem, Rot, Vehicle } from './types';

let counter = 0;

function part(defId: string, x: number, y: number, rot: Rot): GridItem {
  counter++;
  return { id: `i${counter}`, kind: 'part', x, y, rot, part: { id: `p${counter}`, defId, hp: 10, wear: 0 } };
}

function scoutWith(...extra: GridItem[]): Vehicle {
  const core = CHASSIS.scout.core.map((c) => part(c.defId, c.x, c.y, c.rot ?? 0));
  return { ...emptyWorld().vehicles[0], chassisId: 'scout', items: [...core, ...extra] };
}

function movesOf(v: Vehicle, itemId: string, to: { x: number; y: number; rot: Rot }) {
  const result = planItemMove(v, itemId, to);
  return result.plan?.moves ?? [];
}

describe('swapped items take a pose of their own', () => {
  it('plans the reported swap of a lying shotgun with the diesel', () => {
    const shotgun = part('shotgun', 1, 1, 4);
    const diesel = part('workhorseDiesel', 2, 2, 0);
    const v = scoutWith(shotgun, diesel);
    let result: ReturnType<typeof planItemMove> | undefined;
    expect(() => (result = planItemMove(v, shotgun.id, { x: 2, y: 2, rot: 4 }))).not.toThrow();
    const move = result?.plan?.moves.find((m) => m.itemId === diesel.id);
    if (move) {
      expect(move.to).toEqual({ x: 1, y: 1, rot: 1 });
    } else {
      expect(result?.error).not.toBeNull();
    }
  });

  it.each([2, 3, 4, 5, 6, 7] as Rot[])('gives an engine or armor plate a pose of its own from a gun in pose %i', (rot) => {
    let swaps = 0;
    for (const defId of ['workhorseDiesel', 'scrapPanels']) {
      for (let x = 1; x <= 4; x++) {
        for (let y = 1; y <= 5; y++) {
          const gun = part('shotgun', 1, 1, rot);
          const other = part(defId, x, y, 0);
          const v = scoutWith(gun, other);
          const plan = movesOf(v, gun.id, { x, y, rot });
          for (const move of plan) {
            const item = v.items.find((it) => it.id === move.itemId)!;
            expect(turnsOf(item)).toContain(move.to.rot);
          }
          const moved = plan.find((m) => m.itemId === other.id);
          if (moved) {
            swaps++;
            expect(cellsTurned(moved.to)).toBe(cellsTurned({ rot }));
          }
        }
      }
    }
    expect(swaps).toBeGreaterThan(0);
  });

  it('keeps the exact pose between two guns', () => {
    let swaps = 0;
    for (let x = 0; x <= 4; x++) {
      for (let y = 0; y <= 5; y++) {
        const a = part('shotgun', 1, 1, 4);
        const b = part('shotgun', x, y, 0);
        const move = movesOf(scoutWith(a, b), a.id, { x, y, rot: 4 }).find((m) => m.itemId === b.id);
        if (!move) continue;
        swaps++;
        expect(move.to.rot).toBe(4);
      }
    }
    expect(swaps).toBeGreaterThan(0);
  });

  it('turns a pose to the receiver by how the cells lie', () => {
    const gun = part('shotgun', 0, 0, 0);
    const other = part('workhorseDiesel', 0, 0, 0);
    expect(([0, 1, 2, 3, 4, 5, 6, 7] as Rot[]).map((rot) => poseTurnedLike(gun, rot))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(([0, 1, 2, 3, 4, 5, 6, 7] as Rot[]).map((rot) => poseTurnedLike(other, rot))).toEqual([0, 1, 0, 1, 1, 0, 1, 0]);
  });
});
