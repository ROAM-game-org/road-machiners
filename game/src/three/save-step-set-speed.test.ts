import { describe, expect, it } from 'vitest';
import FORMAT_2_115 from './save-fixtures/format-2-115.json';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from '../sim/damage';
import { defaultSetup } from '../sim/settings';
import { newWorld } from '../sim/world';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

const step = (world: unknown): unknown => TINY_STEPS[116 - TINY_FROM].step(structuredClone(world) as SavedJson);

describe('save migration 116 to 117, a manual driver may hold a set speed', () => {
  it('names the step after the set speed', () => {
    expect(TINY_STEPS[116 - TINY_FROM].name).toBe('withSetSpeed');
  });

  it('leaves the world as it was', () => {
    expect(step(FORMAT_2_115)).toEqual(FORMAT_2_115);
  });
});

describe('set speed across a save', () => {
  it('load gives back the same set speed and awards nothing', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const me = playerVehicle(w);
    me.direct = true;
    me.setSpeed = 7.5;
    w.events = [];
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(playerVehicle(loaded).setSpeed).toBe(7.5);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
