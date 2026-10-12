import { describe, expect, it } from 'vitest';
import { baseGrid, itemCells } from '../../sim/grid';
import { addVehicle, emptyWorld } from '../../sim/testkit';
import type { GridItem, Vehicle } from '../../sim/types';
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
  rack.y = 1;
  rack.rot = 0;
  const crate: GridItem = { id: 'crate', x: 3, y: 1, rot: 0, kind: 'good', good: 'scrap' };
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
    const view = new VehicleView(v, true);
    expect(view.hasPart(rack.part.id)).toBe(true);
  });

  it('still draws the engine in its hood hole and the armor on the ring', () => {
    const { v } = semiWithCargo();
    expect(hidesInside(v, partOf(v, 'workhorseDiesel'))).toBe(false);
    expect(hidesInside(v, partOf(v, 'plates'))).toBe(false);
  });
});
