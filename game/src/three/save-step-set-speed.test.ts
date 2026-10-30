import { describe, expect, it } from 'vitest';
import FORMAT_2_117 from './save-fixtures/format-2-117.json';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from '../sim/damage';
import { defaultSetup } from '../sim/settings';
import { newWorld } from '../sim/world';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

const setSpeedStep = TINY_STEPS.find((s) => s.name === 'withSetSpeed')!;
const step = (world: unknown): unknown => setSpeedStep.step(structuredClone(world) as SavedJson);

describe('save migration withSetSpeed, a manual driver may hold a set speed', () => {
  it('is the tiny step from format 125', () => {
    expect(TINY_STEPS[125 - TINY_FROM]).toBe(setSpeedStep);
  });

  it('leaves the world as it was', () => {
    expect(step(FORMAT_2_117)).toEqual(FORMAT_2_117);
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
