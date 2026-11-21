import { describe, expect, it } from 'vitest';
import FORMAT_2_138 from './save-fixtures/format-2-138.json';
import { PARTS } from '../data/parts';
import { makePart } from '../sim/factory';
import { findSpot, gridOf, placementError } from '../sim/grid';
import { repairContent } from '../sim/save-repair';
import { addVehicle, emptyWorld } from '../sim/testkit';
import type { GridItem, Vehicle } from '../sim/types';
import { FOLDED_AND_TINY_STEPS, type SavedJson } from './save-migrations';

const step = FOLDED_AND_TINY_STEPS.find((s) => s.name === 'withCargoCells')!;

type SavedItem = { id: string; kind: string; x: number; y: number; rot: number; part?: { id: string; defId: string } };
type SavedTruck = { id: string; chassisId: string; items: SavedItem[]; job?: SavedJson | null };
type Migrated = { vehicles: SavedTruck[]; sheltered: { vehicle: SavedTruck }[]; player: { storage: { defId: string }[] } };

const RETIRED = ['flatbed', 'trailerBox', 'lightFrame', 'enclosedFrame', 'heavyFrame'];
const part = (id: string, defId: string, x: number, y: number, rot = 0): SavedItem => ({ id, kind: 'part', x, y, rot, part: { id: `p-${id}`, defId } });

function oldSave(vehicles: SavedTruck[], storage: string[] = [], sheltered: SavedTruck[] = []): SavedJson {
  const base = structuredClone(FORMAT_2_138) as unknown as SavedJson & { player: SavedJson };
  return { ...base, vehicles, sheltered: sheltered.map((vehicle) => ({ vehicle })), player: { ...base.player, storage: storage.map((defId, i) => ({ id: `s${i}`, defId, hp: 10, wear: 0 })) } };
}

const run = (world: SavedJson) => step.step(structuredClone(world)) as unknown as Migrated;
const defsOf = (truck: SavedTruck) => truck.items.map((it) => it.part?.defId);

describe('save migration withCargoCells, the hold counts cells', () => {
  it('turns every retired cargo part into the rack or the hauling rack, on trucks, in shelter and in storage', () => {
    const items = RETIRED.map((defId, i) => part(`c${i}`, defId, 1, 20 + 2 * i));
    const out = run(oldSave([{ id: 'v', chassisId: 'hauler', items }], RETIRED, [{ id: 'w', chassisId: 'hauler', items: [part('t', 'trailerBox', 1, 20)] }]));
    expect(defsOf(out.vehicles[0])).toEqual(['rack', 'haulingRack', 'haulingRack', 'haulingRack', 'haulingRack']);
    expect(out.player.storage.map((p) => p.defId)).toEqual(['rack', 'haulingRack', 'haulingRack', 'haulingRack', 'haulingRack']);
    expect(defsOf(out.sheltered[0].vehicle)).toEqual(['haulingRack']);
    expect(JSON.stringify(out)).not.toMatch(new RegExp(`"(${RETIRED.join('|')})"`));
  });

  it('turns a lying rack or flatbed so the long part keeps its old cells', () => {
    const out = run(oldSave([{ id: 'v', chassisId: 'scout', items: [part('r', 'rack', 1, 15, 0), part('f', 'flatbed', 2, 16, 1)] }]));
    expect(out.vehicles[0].items.map((it) => [it.id, it.rot])).toEqual([['r', 1], ['f', 0]]);
  });

  it('turns the rack in a queued refit move with the part', () => {
    const move = { itemId: 'r', from: { x: 1, y: 15, rot: 0 }, to: { x: 2, y: 15, rot: 0 } };
    const job = { kind: 'refit', moves: [move], pickup: null, queue: [{ moves: [move], pickup: null }] };
    const out = run(oldSave([{ id: 'v', chassisId: 'scout', items: [part('r', 'rack', 1, 15)], job }]));
    const turned = out.vehicles[0].job as unknown as typeof job;
    expect([turned.moves[0].from.rot, turned.moves[0].to.rot, turned.queue[0].moves[0].to.rot]).toEqual([1, 1, 1]);
  });

  it('changes nothing else in the world', () => {
    const before = oldSave([{ id: 'v', chassisId: 'scout', items: [part('g', 'mg', 1, 5)] }]);
    expect(step.step(structuredClone(before))).toEqual(before);
  });
});

type PartItem = Extract<GridItem, { kind: 'part' }>;

function loaded(w: ReturnType<typeof emptyWorld>, v: Vehicle): void {
  const next = step.step(structuredClone({ vehicles: [v], sheltered: [] }) as unknown as SavedJson) as unknown as { vehicles: Vehicle[] };
  Object.assign(v, next.vehicles[0]);
  repairContent(w);
}

describe('an old save with a trailer box carried through load repair', () => {
  it('keeps the hauling rack mounted and awards nothing', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'player', 'hauler', [], { x: 40, y: 40 });
    w.player.vehicleId = v.id;
    const box = { id: 'box', kind: 'part', part: makePart(w, 'haulingRack', 0), x: 0, y: 0, rot: 0 } as PartItem;
    Object.assign(box, findSpot(gridOf(v), v.items, box, ['D'], null));
    box.part.defId = 'trailerBox';
    v.items.push(box);
    const money = w.player.money;
    loaded(w, v);
    const g = gridOf(v);
    for (const it of v.items) expect(placementError(g, v.items, it, it.id), it.id).toBeNull();
    expect(v.items.find((it) => it.id === 'box')).toMatchObject({ part: { defId: 'haulingRack' } });
    expect(w.player.storage).toEqual([]);
    expect(w.player.money).toBe(money);
    expect(PARTS.haulingRack.kind).toBe('cargo');
  });
});
