import { describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from '../sim/damage';
import { bareGrid, gridOf } from '../sim/grid';
import { addGoods } from '../sim/inventory';
import { defaultSetup } from '../sim/settings';
import { newWorld } from '../sim/world';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

describe('crates on a bed row across a save', () => {
  it('loads to the same items and grid, and the load awards nothing', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const me = playerVehicle(w);
    me.items = me.items.filter((it) => it.kind !== 'good');
    const bed = bareGrid(me.chassisId);
    addGoods(w, me, 'salt', bed.w * (bed.h - bed.chassisH));
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    const mine = playerVehicle(loaded);

    expect(mine.items).toEqual(me.items);
    expect(gridOf(mine).h).toBe(gridOf(me).h);
    expect(mine.items.filter((it) => it.kind === 'good' && it.y >= bed.chassisH).length).toBe(bed.w);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
