import { describe, expect, it } from 'vitest';
import FORMAT_2_120 from './save-fixtures/format-2-120.json';
import { REGION } from '../data/region';
import { START_KITS } from '../data/start';
import { playerVehicle } from '../sim/damage';
import { startOddJobs } from '../sim/odd-jobs';
import { defaultSetup } from '../sim/settings';
import { sitePads } from '../sim/sites';
import type { World } from '../sim/types';
import { advanceJobs } from '../sim/jobs';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_STEPS, type SavedJson } from './save-migrations';

const step = TINY_STEPS.find((s) => s.name === 'withOddJobs')!;

function roundTrip(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

function shiftWorld(): World {
  const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
  const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
  const me = playerVehicle(w);
  me.pos = sitePads(bowl)[0];
  me.speed = 0;
  w.player.money = 1000;
  return startOddJobs(w);
}

describe('save migration for the odd jobs shift', () => {
  it('changes no data, since no old save holds a shift', () => {
    const old = structuredClone(FORMAT_2_120) as SavedJson;
    expect(step.step(structuredClone(old))).toEqual(old);
  });
});

describe('an odd jobs shift in a save', () => {
  it('load gives back the running shift and pays nothing', () => {
    const w = shiftWorld();
    for (let i = 0; i < 30; i++) advanceJobs(w);
    const loaded = roundTrip(w);
    expect(playerVehicle(loaded).job).toEqual(playerVehicle(w).job);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toEqual(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
