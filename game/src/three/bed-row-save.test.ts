import { describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from '../sim/damage';
import { bareGrid, freeCells, gridOf } from '../sim/grid';
import { addGoods } from '../sim/inventory';
import { addVehicle } from '../sim/testkit';

import { defaultSetup } from '../sim/settings';
import { newWorld } from '../sim/world';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

describe('crates on a bed row across a save', () => {
  it.each(['scout', 'hauler', 'longbed'])('loads a %s to the same items and grid, and the load awards nothing', (chassisId) => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const first = playerVehicle(w);
    const me = addVehicle(w, 'player', chassisId, ['stockEngine', 'rack'], first.pos);
    w.vehicles = w.vehicles.filter((v) => v !== first);
    w.player.vehicleId = me.id;
    const bed = bareGrid(chassisId);
    addGoods(w, me, 'salt', freeCells(me));
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    const mine = playerVehicle(loaded);

    expect(mine.items).toEqual(me.items);
    expect(gridOf(mine).h).toBe(gridOf(me).h);
    expect(mine.items.filter((it) => it.kind === 'good' && it.y >= bed.chassisH).length).toBe(bed.w * (gridOf(me).h - bed.chassisH));
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
