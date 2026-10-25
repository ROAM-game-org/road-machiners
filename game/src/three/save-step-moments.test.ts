import { describe, expect, it } from 'vitest';
import FORMAT_2_115 from './save-fixtures/format-2-115.json';
import { START_KITS } from '../data/start';
import { defaultSetup } from '../sim/settings';
import type { World } from '../sim/types';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

const step = (world: unknown): SavedJson => TINY_STEPS[115 - TINY_FROM].step(structuredClone(world) as SavedJson);
const fixture = () => structuredClone(FORMAT_2_115);

function roundTrip(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

describe('moments in a save', () => {
  it('load gives back the same holders and heard moments and awards nothing', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    expect(Object.values(w.moments!).some((m) => m.driver !== null)).toBe(true);
    w.moments!.crucible.heard = true;
    const loaded = roundTrip(w);
    expect(loaded.moments).toEqual(w.moments);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toEqual(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});

describe('save migration 115 to 116, the basin keeps its moments', () => {
  it('gives a Roaming save every moment unheard and unheld', () => {
    expect(step(fixture()).moments).toEqual({
      fromTheWest: { driver: null, heard: false },
      eightToNine: { driver: null, heard: false },
      crucible: { driver: null, heard: false },
    });
  });

  it('gives a Chaos Highway save no moments', () => {
    const highway = { ...fixture(), setup: { mode: 'chaosHighway' } };
    expect(step(highway).moments).toBeNull();
  });

  it('keeps the rest of the save as it was', () => {
    const next = step(fixture());
    expect(next.turn).toBe(1800);
    expect(next.player).toEqual({ money: 900 });
  });
});
