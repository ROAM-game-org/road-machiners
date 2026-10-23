import { describe, expect, it } from 'vitest';
import FORMAT_2_102 from './save-fixtures/format-2-102.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

type Part = { id: string; defId: string; hp: number; wear: number };
type Item = { id: string; x: number; y: number; rot: number; kind: string; part?: Part };
type Saved = { player: { vehicleId: string; storage: Part[] }; salvage: { parts: Part[] }[]; vehicles: { id: string; chassisId: string; items: Item[] }[] };

const step = (world: Saved): Saved => TINY_STEPS[102 - TINY_FROM](structuredClone(world) as unknown as SavedJson) as unknown as Saved;
const fixture = () => structuredClone(FORMAT_2_102) as Saved;
const vehicle = (world: Saved, id: string) => world.vehicles.find((v) => v.id === id)!;
const item = (world: Saved, vehicleId: string, itemId: string) => vehicle(world, vehicleId).items.find((it) => it.id === itemId)!;
const spot = (it: Item) => ({ x: it.x, y: it.y, rot: it.rot });

describe('save migration 102 to 103, odd fronts', () => {
  it('shifts every item right of the inserted column of a widened truck by one cell, and moves a built-in part into that column', () => {
    const next = step(fixture());
    expect(spot(item(next, 'p1', 'i3'))).toEqual({ x: 4, y: 3, rot: 0 });
    expect(spot(item(next, 'p1', 'i5'))).toEqual({ x: 5, y: 1, rot: 0 });
    expect(spot(item(next, 'p1', 'i10'))).toEqual({ x: 5, y: 8, rot: 0 });
    expect(spot(item(next, 'p1', 'i1'))).toEqual({ x: 3, y: 3, rot: 0 });
    expect(spot(item(next, 'p1', 'i8'))).toEqual({ x: 1, y: 3, rot: 0 });
    expect(spot(item(next, 'c1', 'm1'))).toEqual({ x: 3, y: 1, rot: 0 });
    expect(spot(item(next, 'c1', 'm2'))).toEqual({ x: 5, y: 3, rot: 0 });
    expect(spot(item(next, 'c1', 'm3'))).toEqual({ x: 5, y: 1, rot: 0 });
  });

  it('scales the hp of resized armor by the cell ratio wherever the part lies', () => {
    const next = step(fixture());
    expect(item(next, 'p1', 'i9').part!.hp).toBe(Math.round((60 * 53) / 80));
    expect(next.player.storage[0].hp).toBe(53);
    expect(next.salvage[0].parts[0].hp).toBe(55);
  });

  it('seats an old wagon on its new grid, with a closed cab, and keeps every part of the NPC', () => {
    const next = step(fixture());
    const wagon = vehicle(next, 'n1');
    expect(wagon.items.map((it) => it.part!.id).sort()).toEqual(vehicle(fixture(), 'n1').items.map((it) => it.part!.id).sort());
    expect(item(next, 'n1', 'j1').part!.defId).toBe('cabPickup');
    expect(spot(item(next, 'n1', 'j1'))).toEqual({ x: 3, y: 1, rot: 0 });
    expect(['j4', 'j5', 'j6', 'j7'].map((id) => spot(item(next, 'n1', id)))).toEqual([
      { x: 1, y: 1, rot: 0 }, { x: 7, y: 1, rot: 0 }, { x: 1, y: 6, rot: 0 }, { x: 7, y: 6, rot: 0 },
    ]);
    expect(spot(item(next, 'n1', 'j3'))).toEqual({ x: 6, y: 3, rot: 0 });
    expect(spot(item(next, 'n1', 'j9'))).toEqual({ x: 2, y: 3, rot: 0 });
    expect(spot(item(next, 'n1', 'j10'))).toEqual({ x: 1, y: 0, rot: 0 });
    expect(spot(item(next, 'n1', 'j11'))).toEqual({ x: 1, y: 0, rot: 1 });
  });

  it("moves a player wagon's part that finds no spot to storage", () => {
    const world = fixture();
    world.player.vehicleId = 'n1';
    vehicle(world, 'n1').items.push({ id: 'extra', x: 2, y: 2, rot: 0, kind: 'part', part: { id: 'second-engine', defId: 'stockEngine', hp: 50, wear: 0 } });
    const next = step(world);
    expect(vehicle(next, 'n1').items.some((it) => it.id === 'extra')).toBe(false);
    expect(next.player.storage.map((p) => p.id)).toContain('second-engine');
  });

  it('leaves a truck that keeps its grid as it is', () => {
    expect(vehicle(step(fixture()), 's1')).toEqual(vehicle(fixture(), 's1'));
  });
});
