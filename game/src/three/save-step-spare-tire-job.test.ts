import { describe, expect, it } from 'vitest';
import FORMAT_2_138 from './save-fixtures/format-2-138.json';
import { coreParts } from '../sim/grid';
import { makePart } from '../sim/factory';
import { stowPart } from '../sim/inventory';
import { startFitSpare } from '../sim/jobs';
import { emptyWorld } from '../sim/testkit';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_STEPS, type SavedJson } from './save-migrations';

const step = TINY_STEPS.find((s) => s.name === 'withSpareTireJob')!;

function fittingWorld() {
  const w = emptyWorld();
  stowPart(w, w.vehicles[0], makePart(w, 'spareTire', 0));
  coreParts(w.vehicles[0], 'wheel')[0].hp = 1;
  return startFitSpare(w);
}

describe('save migration withSpareTireJob, trucks can fit a spare tire', () => {
  it('leaves an older save as it was, since no older truck held the job', () => {
    const old = structuredClone(FORMAT_2_138) as unknown as SavedJson;
    expect(step.step(structuredClone(old))).toEqual(old);
  });

  it('saves and loads a running tire fit as the same job, awarding nothing', () => {
    const w = fittingWorld();
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', { ...JSON.parse(JSON.stringify(saveOf(w))), savedAt: 1000, runId: 'run-1' });

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(loaded.vehicles[0].job).toEqual(w.vehicles[0].job);
    expect(loaded.vehicles[0].job?.kind).toBe('fitSpare');
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toEqual(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
