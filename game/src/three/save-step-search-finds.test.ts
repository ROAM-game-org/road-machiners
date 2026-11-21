import { describe, expect, it } from 'vitest';
import FORMAT_2_138 from './save-fixtures/format-2-138.json';
import { SALVAGE } from '../data/salvage';
import { emptyHidden } from '../sim/salvage';
import { beginSearch } from '../sim/search';
import { emptyWorld, testDrive } from '../sim/testkit';
import { endTurn } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { FOLDED_AND_TINY_STEPS as TINY_STEPS, type SavedJson } from './save-migrations';

const step = TINY_STEPS.find((s) => s.name === 'withSearchFinds')!;

describe('save migration withSearchFinds, a search holds its finds until it ends', () => {
  it('leaves an older save as it was, since an old search job holds no finds', () => {
    const old = structuredClone(FORMAT_2_138) as unknown as SavedJson;
    expect(step.step(structuredClone(old))).toEqual(old);
  });

  it('keeps pending finds through a save and load, awarding nothing', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.salvage.push({ id: 'rich', pos: { x: 30, y: 30 }, radius: 1, goods: {}, parts: [], hidden: { ...emptyHidden(), goods: { scrap: SALVAGE.unitsPerTurn * 40 } } });
    beginSearch(w, w.vehicles[0], 'rich');
    const now = endTurn(w, testDrive);
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', { ...JSON.parse(JSON.stringify(saveOf(now))), savedAt: 1000, runId: 'run-1' });
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    const job = (v: typeof now.vehicles[0]) => (v.job?.kind === 'search' ? v.job : null);
    expect(job(now.vehicles[0])?.found?.goods.scrap).toBeGreaterThan(0);
    expect(job(loaded.vehicles[0])?.found).toEqual(job(now.vehicles[0])?.found);
    expect(loaded.events).toEqual([]);
    expect(loaded.player.xp).toEqual(now.player.xp);
  });
});
