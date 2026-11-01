import { describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from '../sim/damage';
import { makePart, newId } from '../sim/factory';
import { bareGrid, findSpot, gridOf, mountSpots, placementError, type Cell } from '../sim/grid';
import { defaultSetup } from '../sim/settings';
import { addVehicle } from '../sim/testkit';
import type { GridItem } from '../sim/types';
import { newWorld } from '../sim/world';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

describe('armor on all four edges across a save', () => {
  it.each(['scout', 'hauler', 'semi'])('loads a %s to the same items and grid, and the load awards nothing', (chassisId) => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const first = playerVehicle(w);
    const me = addVehicle(w, 'player', chassisId, ['stockEngine'], first.pos);
    w.vehicles = w.vehicles.filter((v) => v !== first);
    w.player.vehicleId = me.id;
    const g = bareGrid(chassisId);
    const plate = (side: string): GridItem => {
      const probe: GridItem = { id: newId(w, 'i'), x: 0, y: 0, rot: 0, kind: 'part', part: makePart(w, 'plates', 0) };
      const spot = mountSpots(gridOf(me), me.items, probe, [side as Cell])[0];
      if (!spot) throw new Error(`${chassisId} has no ${side} armor spot`);
      return { ...probe, ...spot };
    };
    const crate = (x: number, y: number): GridItem => ({ id: newId(w, 'i'), x, y, rot: 0, kind: 'good', good: 'scrap' });
    const tail = g.cells.slice(1, g.chassisH - 1).flatMap((row, i) => row.slice(1, -1).flatMap((cell, x) => (cell === 'C' || cell === 'D' ? [{ x: x + 1, y: i + 1 }] : []))).pop()!;
    const head = findSpot(gridOf(me), me.items, crate(0, 0), null, null)!;
    const place = (item: GridItem) => {
      expect(placementError(gridOf(me), me.items, item, null)).toBeNull();
      me.items = [...me.items, item];
    };
    for (const side of ['F', 'B', 'L', 'R']) place(plate(side));
    place(crate(head.x, head.y));
    place(crate(tail.x, tail.y));
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    const mine = playerVehicle(loaded);

    expect(mine.items).toEqual(me.items);
    expect(gridOf(mine).h).toBe(gridOf(me).h);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
