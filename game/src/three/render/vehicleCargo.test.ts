import { PAINT } from '../../data/chassis';
import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../../data/chassis';
import { PARTS } from '../../data/parts';
import { wheelMounts } from '../../phys/body';
import { bodyOf, cellRect, highestUnder } from '../../sim/body';
import { makePart } from '../../sim/factory';
import { baseGrid, itemCells, placementError } from '../../sim/grid';
import { addVehicle, emptyWorld } from '../../sim/testkit';
import type { GridItem, Rot, Vehicle } from '../../sim/types';
import { loadModels } from './models';
import { hidesInside, VehicleView } from './vehicle';

type PartItem = Extract<GridItem, { kind: 'part' }>;

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

function semiWithCargo(): { v: Vehicle; rack: PartItem; crate: GridItem } {
  const w = emptyWorld();
  const v = addVehicle(w, 'player', 'semi', ['workhorseDiesel', 'rack', 'plates'], { x: 30, y: 30 });
  const rack = v.items.find((it): it is PartItem => it.kind === 'part' && it.part.defId === 'rack')!;
  rack.x = 1;
  rack.y = 2;
  rack.rot = 0;
  const crate: GridItem = { id: 'crate', x: 3, y: 2, rot: 0, kind: 'good', good: 'scrap' };
  v.items.push(crate);
  return { v, rack, crate };
}

function partOf(v: Vehicle, defId: string): PartItem {
  return v.items.find((it): it is PartItem => it.kind === 'part' && it.part.defId === defId)!;
}

describe('cargo inside the hauler trailer', () => {
  it('draws no part or good that lies on the trailer bay cells', () => {
    const { v, rack, crate } = semiWithCargo();
    const grid = baseGrid('semi');
    for (const item of [rack, crate]) {
      expect(itemCells(item).every((c) => grid.cells[c.y][c.x] === 'C')).toBe(true);
      expect(hidesInside(v, item)).toBe(true);
    }
  });

  it('keeps an anchor for a hidden cargo part, so hits on it still land on the truck', () => {
    const { v, rack } = semiWithCargo();
    const view = new VehicleView(v, true, PAINT.standard, 'world');
    expect(view.hasPart(rack.part.id)).toBe(true);
  });

  it('still draws the engine in its hood hole and the armor on the ring', () => {
    const { v } = semiWithCargo();
    expect(hidesInside(v, partOf(v, 'workhorseDiesel'))).toBe(false);
    expect(hidesInside(v, partOf(v, 'plates'))).toBe(false);
  });
});

describe('the engine under the buggy deck', () => {
  it('counts the buggy engine but does not draw it, and keeps an anchor for hits on it', () => {
    const v = addVehicle(emptyWorld(), 'player', 'buggy', ['stockEngine', 'mg'], { x: 30, y: 30 });
    const engine = partOf(v, 'stockEngine');
    expect(hidesInside(v, engine)).toBe(true);
    expect(hidesInside(v, partOf(v, 'mg'))).toBe(false);
    expect(new VehicleView(v, true, PAINT.standard, 'world').hasPart(engine.part.id)).toBe(true);
  });
});

function withCaltropsAt(chassisId: string, x: number, y: number): { v: Vehicle; caltrops: PartItem } {
  const w = emptyWorld();
  const v = addVehicle(w, 'scrapjaw', chassisId, [], { x: 30, y: 30 });
  const caltrops: PartItem = { id: 'i-caltrops', x, y, rot: 0, kind: 'part', part: makePart(w, 'caltrops', 0) };
  return { v, caltrops };
}

type Placed = { defId: string; x: number; y: number; rot: Rot };

function withParts(chassisId: string, placed: Placed[]): { v: Vehicle; items: PartItem[] } {
  const w = emptyWorld();
  const v = addVehicle(w, 'scrapjaw', chassisId, [], { x: 30, y: 30 });
  const items = placed.map((p, i): PartItem => ({ id: `i-${p.defId}-${i}`, x: p.x, y: p.y, rot: p.rot, kind: 'part', part: makePart(w, p.defId, 0) }));
  return { v, items };
}

const REPORTED_BUGGY: Placed[] = [
  { defId: 'panniers', x: 2, y: 5, rot: 0 },
  { defId: 'caltrops', x: 2, y: 6, rot: 0 },
  { defId: 'mg', x: 1, y: 5, rot: 0 },
  { defId: 'plowRam', x: 1, y: 10, rot: 0 },
  { defId: 'plowRam', x: 1, y: 0, rot: 0 },
  { defId: 'ceramicPlates', x: 0, y: 4, rot: 0 },
  { defId: 'ceramicPlates', x: 5, y: 4, rot: 0 },
  { defId: 'ceramicPlates', x: 0, y: 1, rot: 0 },
  { defId: 'ceramicPlates', x: 5, y: 1, rot: 0 },
  { defId: 'workhorseDiesel', x: 2, y: 2, rot: 0 },
  { defId: 'ceramicTile', x: 0, y: 7, rot: 0 },
  { defId: 'ceramicTile', x: 5, y: 7, rot: 0 },
  { defId: 'ceramicTile', x: 0, y: 8, rot: 0 },
  { defId: 'ceramicTile', x: 5, y: 8, rot: 0 },
  { defId: 'panniers', x: 4, y: 7, rot: 0 },
];

const ALWAYS_DRAWN_KINDS = new Set(['weapon', 'armor', 'engine', 'core']);

function hiddenSingleCellDefs(): string[] {
  return Object.values(PARTS)
    .filter((def) => def.w === 1 && def.h === 1 && !ALWAYS_DRAWN_KINDS.has(def.kind))
    .map((def) => def.id);
}

function rimCells(chassisId: string): { x: number; y: number }[] {
  const grid = baseGrid(chassisId);
  return grid.cells.flatMap((row, y) => row.flatMap((cell, x) => (cell === 'F' || cell === 'B' ? [{ x, y }] : [])));
}

describe('parts on bare nose and tail cells', () => {
  it('builds the buggy view with caltrops on the plain row behind its nose, and keeps an anchor for them', () => {
    const { v, caltrops } = withCaltropsAt('buggy', 4, 1);
    expect(baseGrid('buggy').cells[1][4]).toBe('.');
    expect(placementError(baseGrid('buggy'), v.items, caltrops, null)).toBeNull();
    v.items.push(caltrops);
    const view = new VehicleView(v, true, PAINT.standard, 'world');
    expect(view.hasPart(caltrops.part.id)).toBe(true);
  });

  it('builds the view for caltrops on every legal nose and tail cell of every chassis', () => {
    for (const chassisId of Object.keys(CHASSIS)) {
      for (const cell of rimCells(chassisId)) {
        const { v, caltrops } = withCaltropsAt(chassisId, cell.x, cell.y);
        if (placementError(baseGrid(chassisId), v.items, caltrops, null)) continue;
        v.items.push(caltrops);
        expect(() => new VehicleView(v, true, PAINT.standard, 'world'), `${chassisId} ${cell.x},${cell.y}`).not.toThrow();
      }
    }
  });

  it('refuses caltrops on the armor row of the nose', () => {
    const { v, caltrops } = withCaltropsAt('buggy', 4, 0);
    expect(baseGrid('buggy').cells[0][4]).toBe('F');
    expect(placementError(baseGrid('buggy'), v.items, caltrops, null)).toEqual({ id: 'armorOnly' });
  });

  it('builds the reported buggy with panniers on the plain row before its tail', () => {
    const { v, items } = withParts('buggy', REPORTED_BUGGY);
    const grid = baseGrid('buggy');
    for (const item of items) {
      expect(placementError(grid, v.items, item, null), `${item.part.defId} ${item.x},${item.y}`).toBeNull();
      v.items.push(item);
    }
    const tailPanniers = items[items.length - 1];
    expect(grid.cells[tailPanniers.y][tailPanniers.x]).toBe('.');
    let view: VehicleView | undefined;
    expect(() => { view = new VehicleView(v, true, PAINT.standard, 'world'); }).not.toThrow();
    expect(view!.hasPart(tailPanniers.part.id)).toBe(true);
  });

  it('builds the buggy view for every hidden 1x1 part kind on every legal nose and tail cell', () => {
    const defs = hiddenSingleCellDefs();
    expect(defs.length).toBeGreaterThan(0);
    for (const defId of defs) {
      for (const cell of rimCells('buggy')) {
        const { v, items: [item] } = withParts('buggy', [{ defId, x: cell.x, y: cell.y, rot: 0 }]);
        if (placementError(baseGrid('buggy'), v.items, item, null)) continue;
        v.items.push(item);
        let view: VehicleView | undefined;
        expect(() => { view = new VehicleView(v, true, PAINT.standard, 'world'); }, `${defId} ${cell.x},${cell.y}`).not.toThrow();
        expect(view!.hasPart(item.part.id), `${defId} ${cell.x},${cell.y}`).toBe(true);
      }
    }
  });

  it('keeps a hidden cab anchored on the highest model surface under its cells', () => {
    const w = emptyWorld();
    const v = addVehicle(w, 'scrapjaw', 'buggy', [], { x: 30, y: 30 });
    const cab = partOf(v, 'cab');
    const view = new VehicleView(v, true, PAINT.standard, 'world');
    view.pose({ pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, acc: { x: 0, y: 0, z: 0 }, wheels: wheelMounts(bodyOf(v.chassisId), 0).map(() => ({ suspension: 0, steer: 0, spin: 0, ground: true })) }, 0.016);
    const rect = cellRect('buggy', itemCells(cab));
    const at = view.partPoint(cab.part.id);
    expect(at.x).toBeCloseTo((rect.x0 + rect.x1) / 2);
    expect(at.y).toBeCloseTo(highestUnder('buggy', rect));
    expect(at.z).toBeCloseTo((rect.z0 + rect.z1) / 2);
  });
});
