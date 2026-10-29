import { describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from '../sim/damage';
import { makePart, newId } from '../sim/factory';
import { bareGrid, gridOf, placementError } from '../sim/grid';
import { defaultSetup } from '../sim/settings';
import { addVehicle } from '../sim/testkit';
import type { GridItem, Rot } from '../sim/types';
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
    const plate = (x: number, y: number, rot: Rot): GridItem => ({ id: newId(w, 'i'), x, y, rot, kind: 'part', part: makePart(w, 'plates', 0) });
    const crate = (x: number, y: number): GridItem => ({ id: newId(w, 'i'), x, y, rot: 0, kind: 'good', good: 'scrap' });
    const armor = [plate(2, 0, 1), plate(2, g.chassisH - 1, 1), plate(0, 3, 0), plate(g.w - 1, 3, 0)];
    const tail = g.cells.slice(1, g.chassisH - 1).flatMap((row, i) => row.slice(1, -1).flatMap((cell, x) => (cell === '.' || cell === 'D' ? [{ x: x + 1, y: i + 1 }] : []))).pop()!;
    const goods = [crate(2, 1), crate(tail.x, tail.y)];
    for (const item of [...armor, ...goods]) {
      expect(placementError(gridOf(me), me.items, item, null)).toBeNull();
      me.items = [...me.items, item];
    }
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
