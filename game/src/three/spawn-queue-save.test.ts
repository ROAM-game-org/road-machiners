import { expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { defaultSetup } from '../sim/settings';
import { newWorld } from '../sim/world';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

it('loads a world with a start roster still queued as it was saved and spawns nobody', () => {
  const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

  expect(w.spawnQueue.length).toBeGreaterThan(0);
  expect(loaded.spawnQueue).toEqual(w.spawnQueue);
  expect(loaded.vehicles.map((v) => v.id)).toEqual(w.vehicles.map((v) => v.id));
  expect(loaded.events).toEqual([]);
  expect(loaded.player.money).toBe(w.player.money);
}, 60000);
