import { describe, expect, it, vi } from 'vitest';
import FORMAT_2_138 from './save-fixtures/format-2-138.json';
import { CHASSIS } from '../data/chassis';
import { makePart } from '../sim/factory';
import { gridOf, placementError } from '../sim/grid';
import { repairContent } from '../sim/save-repair';
import { addVehicle, emptyWorld } from '../sim/testkit';
import type { GridItem, Vehicle, World } from '../sim/types';
import { TINY_STEPS, type SavedJson } from './save-migrations';

const step = TINY_STEPS.find((s) => s.name === 'withShortNivaHood')!;

type SavedItem = { id: string; kind: string; x: number; y: number; rot: number; good?: string; part?: { id: string; defId: string } };
type SavedTruck = { id: string; chassisId: string; job?: SavedJson | null; items: SavedItem[] };
type Moved = { vehicles: SavedTruck[]; sheltered: { vehicle: SavedTruck }[] };

const part = (id: string, defId: string, x: number, y: number, rot = 0): SavedItem => ({ id, kind: 'part', x, y, rot, part: { id: `p-${id}`, defId } });
const good = (id: string, x: number, y: number): SavedItem => ({ id, kind: 'good', good: 'scrap', x, y, rot: 0 });

const OLD_CORES = [part('cab', 'cab', 2, 6, 1), part('gear', 'transmissionMid', 2, 8), part('tank', 'tankMid', 4, 4), part('wFL', 'wheelMid', 1, 1), part('wFR', 'wheelMid', 4, 1), part('wRL', 'wheelMid', 1, 8), part('wRR', 'wheelMid', 4, 8)];

function oldSave(vehicles: SavedTruck[], sheltered: SavedTruck[] = []): SavedJson {
  return { ...(structuredClone(FORMAT_2_138) as unknown as SavedJson), vehicles, sheltered: sheltered.map((vehicle) => ({ vehicle })) };
}

const run = (world: SavedJson) => step.step(structuredClone(world)) as unknown as Moved;
const spotOf = (truck: SavedTruck, id: string) => {
  const item = truck.items.find((it) => it.id === id)!;
  return { x: item.x, y: item.y, rot: item.rot };
};

describe('save migration withShortNivaHood, the Niva loses its old second row', () => {
  it('moves every core to the new layout and keeps the tank and front wheels', () => {
    const out = run(oldSave([{ id: 'v', chassisId: 'niva', items: OLD_CORES }]));
    const seated = out.vehicles[0].items.filter((it) => it.kind === 'part').map((it) => `${it.part!.defId} ${it.x},${it.y},${it.rot}`).sort();
    const wanted = CHASSIS.niva.core.map((c) => `${c.defId} ${c.x},${c.y},${c.rot ?? 0}`).sort();
    expect(seated).toEqual(wanted);
  });

  it('moves the engine into the new bay and a roof gun one row forward with its turn', () => {
    const out = run(oldSave([{ id: 'v', chassisId: 'niva', items: [part('engine', 'stockEngine', 2, 2), part('gun', 'mg', 1, 7, 2)] }]));
    expect(spotOf(out.vehicles[0], 'engine')).toEqual({ x: 2, y: 1, rot: 0 });
    expect(spotOf(out.vehicles[0], 'gun')).toEqual({ x: 1, y: 6, rot: 2 });
  });

  it('keeps the front plate row and lists what sat on the old second row last', () => {
    const items = [part('ram', 'ram', 1, 0), part('side', 'plates', 0, 1), good('crate', 1, 12)];
    const out = run(oldSave([{ id: 'v', chassisId: 'niva', items }]));
    expect(out.vehicles[0].items.map((it) => [it.id, it.y])).toEqual([['ram', 0], ['crate', 11], ['side', 1]]);
  });

  it('moves a sheltered Niva too and leaves other trucks alone', () => {
    const scout = { id: 's', chassisId: 'scout', items: [part('gun', 'mg', 1, 7)] };
    const out = run(oldSave([scout], [{ id: 'v', chassisId: 'niva', items: [part('gun', 'mg', 1, 7)] }]));
    expect(out.vehicles[0]).toEqual(scout);
    expect(spotOf(out.sheltered[0].vehicle, 'gun').y).toBe(6);
  });

  it('drops a Niva refit job with a warning and keeps other jobs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const refit = { id: 'a', chassisId: 'niva', items: [], job: { kind: 'refit' } };
    const repair = { id: 'b', chassisId: 'niva', items: [], job: { kind: 'repair', partId: 'x' } };
    const out = run(oldSave([refit, repair]));
    expect(out.vehicles.map((v) => v.job)).toEqual([null, { kind: 'repair', partId: 'x' }]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('leaves the rest of the world as it was', () => {
    const before = oldSave([{ id: 'v', chassisId: 'niva', items: OLD_CORES }]);
    const next = step.step(structuredClone(before));
    expect({ ...next, vehicles: undefined }).toEqual({ ...before, vehicles: undefined });
  });
});

type PartItem = Extract<GridItem, { kind: 'part' }>;

const OLD_ROW: Record<string, number> = { cab: 6, transmissionMid: 8 };

function oldNiva(w: World, faction: 'player' | 'scrapjaw'): Vehicle {
  const v = addVehicle(w, faction, 'niva', [], { x: 40, y: 40 });
  v.items = v.items.filter((it) => it.kind === 'part' && it.part.defId !== 'stockEngine' && CHASSIS.niva.core.some((c) => c.defId === it.part.defId));
  for (const it of v.items as PartItem[]) it.y = OLD_ROW[it.part.defId] ?? (it.y === 7 ? 8 : it.y);
  return v;
}

function fitted(w: World, v: Vehicle, defId: string, x: number, y: number, rot: GridItem['rot'] = 0): PartItem {
  const item: PartItem = { id: `it-${defId}-${x}-${y}`, kind: 'part', part: makePart(w, defId, 0), x, y, rot };
  v.items.push(item);
  return item;
}

function loaded(w: World, v: Vehicle): void {
  const next = step.step(structuredClone({ vehicles: [v], sheltered: [] }) as unknown as SavedJson) as unknown as { vehicles: Vehicle[] };
  Object.assign(v, next.vehicles[0]);
  repairContent(w);
}

function spot(v: Vehicle, id: string): { x: number; y: number } | null {
  const item = v.items.find((it) => it.id === id);
  return item ? { x: item.x, y: item.y } : null;
}

function legal(v: Vehicle): void {
  const g = gridOf(v);
  for (const it of v.items) expect(placementError(g, v.items, it, it.id), it.id).toBeNull();
}

describe('an old Niva save carried through load repair', () => {
  it('keeps the engine mounted, stores a side plate that lost its row and keeps every core seated', () => {
    const w = emptyWorld();
    const v = oldNiva(w, 'player');
    w.player.vehicleId = v.id;
    const engine = fitted(w, v, 'stockEngine', 2, 2);
    const lower = fitted(w, v, 'plates', 0, 3);
    const upper = fitted(w, v, 'plates', 0, 1);
    loaded(w, v);
    legal(v);
    expect(spot(v, engine.id)).toEqual({ x: 2, y: 1 });
    expect(spot(v, lower.id)).toEqual({ x: 0, y: 2 });
    expect(w.player.storage.map((p) => p.id)).toEqual([upper.part.id]);
    const cores = v.items.filter((it): it is PartItem => it.kind === 'part' && CHASSIS.niva.core.some((c) => c.defId === it.part.defId));
    expect(cores.map((it) => `${it.part.defId} ${it.x},${it.y}`).sort()).toEqual(CHASSIS.niva.core.map((c) => `${c.defId} ${c.x},${c.y}`).sort());
  });

  it('reinstalls a gun that sat on the old second row', () => {
    const w = emptyWorld();
    const v = oldNiva(w, 'player');
    w.player.vehicleId = v.id;
    fitted(w, v, 'stockEngine', 2, 2);
    const blocker = fitted(w, v, 'jerrycans', 4, 3);
    const gun = fitted(w, v, 'mg', 4, 1);
    loaded(w, v);
    legal(v);
    expect(spot(v, blocker.id)).toEqual({ x: 4, y: 2 });
    expect(spot(v, gun.id)).not.toBeNull();
    expect(w.player.storage).toEqual([]);
  });

  it('drops the part of a Scrapjaw Niva that lost its row to the part behind it', () => {
    const w = emptyWorld();
    const v = oldNiva(w, 'scrapjaw');
    const kept = fitted(w, v, 'jerrycans', 4, 2);
    const misfit = fitted(w, v, 'jerrycans', 4, 1);
    loaded(w, v);
    legal(v);
    expect(spot(v, kept.id)).toEqual({ x: 4, y: 1 });
    expect(spot(v, misfit.id)).toBeNull();
    expect(w.player.storage).toEqual([]);
  });
});
