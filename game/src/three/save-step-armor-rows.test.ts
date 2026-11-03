import { describe, expect, it } from 'vitest';
import FORMAT_2_120 from './save-fixtures/format-2-120.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';
import { armorRowCell_127_128 } from './save-steps-late';

type Spot = { x: number; y: number; rot: number };
type Step = { moves: { itemId: string; from: Spot; to: Spot }[]; pickup: { itemId: string; to: Spot } | null };
type Saved = { vehicles: { id: string; chassisId: string; items: (Spot & { id: string })[]; job: (Step & { queue: Step[] }) | null }[] };

const step = TINY_STEPS.find((s) => s.name === 'withArmorRowsOutside')!;
const migrated = (): Saved => step.step(structuredClone(FORMAT_2_120) as SavedJson) as unknown as Saved;
const rowsOf = (world: Saved, vehicleId: string) => Object.fromEntries(world.vehicles.find((v) => v.id === vehicleId)!.items.map((it) => [it.id, it.y]));

describe('save migration 127 to 128, armor rows outside the truck', () => {
  it('is the tiny step from format 127', () => {
    expect(TINY_STEPS[127 - TINY_FROM]).toBe(step);
  });

  it('moves inner rows down one, keeps front armor on the front row and sends back armor to the new back row', () => {
    expect(rowsOf(migrated(), 's1')).toEqual({ ram: 0, plateL: 3, spike: 9, crateF: 1, spare: 1, mg: 4, crateIn: 6, crateB: 8 });
  });

  it('moves bed rows down two', () => {
    expect(rowsOf(migrated(), 'h1')).toEqual({ bedCrate: 11, bedBox: 12, front: 0, nose: 1 });
  });

  it('maps both units of a rig by the same rule', () => {
    expect(rowsOf(migrated(), 'm1')).toEqual({ tailPlate: 30, midPlate: 13, hood: 0, c1: 29 });
    expect(rowsOf(migrated(), 'o1')).toEqual({ f: 0, b: 17, g: 8, l: 2 });
  });

  it('leaves a truck of an unknown chassis as it is', () => {
    expect(migrated().vehicles.find((v) => v.id === 'r1')).toEqual(FORMAT_2_120.vehicles.find((v) => v.id === 'r1'));
  });

  it('maps refit moves, the pickup and queued steps by the item or part they carry', () => {
    const job = migrated().vehicles[0].job!;
    expect(job.moves[0]).toEqual({ itemId: 'plateL', from: { x: 0, y: 3, rot: 0 }, to: { x: 0, y: 4, rot: 0 } });
    expect(job.pickup!.to.y).toBe(9);
    expect(job.queue[0].moves[0]).toEqual({ itemId: 'crateF', from: { x: 3, y: 1, rot: 0 }, to: { x: 3, y: 7, rot: 0 } });
    expect(job.queue[0].pickup!.to.y).toBe(0);
  });

  it('keeps every item and changes nothing but rows', () => {
    const before = FORMAT_2_120.vehicles.map((v) => v.items.map((it) => ({ ...it, y: 0 })));
    const after = migrated().vehicles.map((v) => v.items.map((it) => ({ ...it, y: 0 })));
    expect(after).toEqual(before);
  });

  it('is a bijection onto the new grid, so no two items can land on one cell', () => {
    for (const rows of [8, 9, 16, 29]) {
      const plain = Array.from({ length: rows + 3 }, (_, y) => armorRowCell_127_128(rows, y, false));
      expect(new Set(plain).size).toBe(plain.length);
      const shields = [0, rows - 1].map((y) => armorRowCell_127_128(rows, y, true));
      expect(shields).toEqual([0, rows + 1]);
      expect(shields.some((y) => plain.includes(y))).toBe(false);
    }
  });

  it('refuses a row that is not a whole number of zero or more', () => {
    expect(() => armorRowCell_127_128(8, -1, false)).toThrow();
    expect(() => armorRowCell_127_128(8, 1.5, false)).toThrow();
  });
});
