import { describe, expect, it, vi } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { repairContent } from '../sim/save-repair';
import { addVehicle, emptyWorld } from '../sim/testkit';
import { makePart } from '../sim/factory';
import { itemCells, gridOf, isMounted, placementError } from '../sim/grid';
import type { GridItem, Vehicle, World } from '../sim/types';
import type { SavedJson } from './save-migrations';
import { withTruckGrids } from './save-step-truck-grids';

type Saved = { id: string; chassisId: string; job?: SavedJson | null; items: { id: string; kind: string; x: number; y: number; rot: number; good?: string; part?: { id: string; defId: string; hp: number } }[] };

const part = (id: string, defId: string, x: number, y: number, hp = 50) => ({ id, kind: 'part', x, y, rot: 0, part: { id: `p-${id}`, defId, hp, wear: 0 } });
const saved = (vehicles: Saved[], sheltered: Saved[] = []) => ({ vehicles, sheltered: sheltered.map((vehicle) => ({ vehicle })) }) as unknown as SavedJson;
const run = (world: SavedJson) => withTruckGrids(world) as unknown as { vehicles: Saved[]; sheltered: { vehicle: Saved }[] };

describe('withTruckGrids', () => {
  it('renames the wide cab in place and keeps its id and health', () => {
    const out = run(saved([{ id: 'v', chassisId: 'hauler', items: [part('cab', 'cabPickup', 2, 6, 34)] }]));
    expect(out.vehicles[0].items[0]).toMatchObject({ id: 'cab', x: 2, y: 6, part: { id: 'p-cab', defId: 'cabBroad', hp: 34 } });
  });

  it('moves the scout tank one row back', () => {
    const out = run(saved([{ id: 'v', chassisId: 'scout', items: [part('tank', 'tank', 4, 8)] }]));
    expect(out.vehicles[0].items[0]).toMatchObject({ x: 4, y: 9 });
  });

  it('turns a small car seat sideways onto the centre', () => {
    const out = run(saved([{ id: 'v', chassisId: 'buggy', items: [part('seat', 'cab', 4, 3)] }]));
    expect(out.vehicles[0].items[0]).toMatchObject({ x: 2, y: 5, rot: 1 });
  });

  it('leaves a loose cab away from the old spot alone', () => {
    const out = run(saved([{ id: 'v', chassisId: 'hauler', items: [part('spare', 'cabPickup', 1, 14)] }]));
    expect(out.vehicles[0].items[0]).toMatchObject({ x: 1, y: 14, part: { defId: 'cabPickup' } });
  });

  it('moves a sheltered truck too', () => {
    const out = run(saved([], [{ id: 'v', chassisId: 'hauler', items: [part('cab', 'cabPickup', 2, 6)] }]));
    expect(out.sheltered[0].vehicle.items[0].part?.defId).toBe('cabBroad');
  });

  it('drops a refit job on a truck whose core moved, with a warning, and keeps other jobs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const refit = { id: 'a', chassisId: 'hauler', items: [], job: { kind: 'refit' } };
    const repair = { id: 'b', chassisId: 'hauler', items: [], job: { kind: 'repair', partId: 'x' } };
    const out = run(saved([refit, repair]));
    expect(out.vehicles[0].job).toBeNull();
    expect(out.vehicles[1].job).toEqual({ kind: 'repair', partId: 'x' });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('changes nothing on a chassis whose core stayed', () => {
    const items = [part('cab', 'cabPickup', 2, 1)];
    expect(run(saved([{ id: 'v', chassisId: 'bus', items }])).vehicles[0].items).toEqual(items);
  });
});

function coreSpec(chassisId: string, defId: string): { x: number; y: number } {
  const spec = CHASSIS[chassisId].core.find((c) => c.defId === defId);
  if (!spec) throw new Error(`${chassisId} has no ${defId}`);
  return { x: spec.x, y: spec.y };
}

function loadedScout(w: World): Vehicle {
  const v = addVehicle(w, 'player', 'scout', [], { x: 40, y: 40 });
  w.player.vehicleId = v.id;
  const cab = v.items.find((it) => it.kind === 'part' && it.part.defId === 'cabBroad') as Extract<GridItem, { kind: 'part' }>;
  cab.part.defId = 'cabPickup';
  const tank = v.items.find((it) => it.kind === 'part' && it.part.defId === 'tank')!;
  tank.y = 8;
  v.items.push({ id: 'crate', kind: 'good', good: 'scrap', x: 3, y: 12, rot: 0 });
  return v;
}

describe('a save from before the step, carried through load repair', () => {
  it('seats every core, keeps gear legal and puts nothing on the new cab', () => {
    const w = emptyWorld();
    const v = loadedScout(w);
    const next = withTruckGrids(structuredClone({ vehicles: [v], sheltered: [] }) as unknown as SavedJson) as unknown as { vehicles: Vehicle[] };
    Object.assign(v, next.vehicles[0]);
    const onCell = v.items.map((it) => it.id);
    repairContent(w);
    const g = gridOf(v);
    expect(v.items.map((it) => it.id).sort()).toEqual(onCell.sort());
    for (const it of v.items) expect(placementError(g, v.items, it, it.id), it.id).toBeNull();
    const cab = v.items.find((it) => it.kind === 'part' && it.part.defId === 'cabBroad')!;
    expect({ x: cab.x, y: cab.y }).toMatchObject(coreSpec('scout', 'cabBroad'));
    expect(isMounted('scout', cab)).toBe(true);
  });

  it('moves gear off the cells the new cab covers', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'player', 'scout', [], { x: 40, y: 40 });
    w.player.vehicleId = v.id;
    const covered = coreSpec('scout', 'cabBroad');
    const mg = makePart(w, 'mg', 0);
    v.items.push({ id: 'gun', kind: 'part', x: covered.x, y: covered.y, rot: 0, part: mg });
    repairContent(w);
    const gun = v.items.find((it) => it.id === 'gun');
    expect(Boolean(gun) || w.player.storage.some((p) => p.id === mg.id)).toBe(true);
    const cab = v.items.find((it) => it.kind === 'part' && it.part.defId === 'cabBroad')!;
    const onCab = (gun ? itemCells(gun) : []).filter((c) => itemCells(cab).some((d) => d.x === c.x && d.y === c.y));
    expect(onCab).toEqual([]);
  });
});
