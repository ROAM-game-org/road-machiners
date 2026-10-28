import { describe, expect, it } from 'vitest';
import FORMAT_2_115 from './save-fixtures/format-2-115.json';
import { START_KITS } from '../data/start';
import { defaultSetup } from '../sim/settings';
import type { World } from '../sim/types';
import { playerVehicle } from '../sim/damage';
import { newWorld, setMoveOrder } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

const step = TINY_STEPS.find((s) => s.name === 'marksStopPace')!;

function roundTrip(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

describe('stop order pace in a save', () => {
  it('load gives back a paced stop order and awards nothing', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const at = playerVehicle(w).pos;
    const paced = setMoveOrder(w, { kind: 'stopAt', dest: { x: at.x + 8, y: at.y }, pace: 1 });
    const loaded = roundTrip(paced);
    expect(playerVehicle(loaded).order).toEqual(playerVehicle(paced).order);
    expect(loaded.player.money).toBe(paced.player.money);
    expect(loaded.player.xp).toEqual(paced.player.xp);
    expect(loaded.events).toEqual([]);
  });
});

describe('save migration 118 to 119, stop orders may hold a pace', () => {
  it('sits after the Lena glare step and changes no data', () => {
    expect(TINY_STEPS[118 - TINY_FROM]).toBe(step);
    const old = structuredClone(FORMAT_2_115) as SavedJson;
    expect(step.step(structuredClone(old))).toEqual(old);
  });
});
