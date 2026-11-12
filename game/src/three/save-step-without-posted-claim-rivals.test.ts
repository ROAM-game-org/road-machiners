import { describe, expect, it } from 'vitest';
import FORMAT_2_138 from './save-fixtures/format-2-138.json';
import { TINY_STEPS, type SavedJson } from './save-migrations';

const step = TINY_STEPS.find((s) => s.name === 'withoutPostedClaimRivals')!;

const claim = (id: string, rival: string | null) => ({ id, kind: 'claim', shop: 'bowl', rival, rivalAt: 50 });

function oldSave(): SavedJson {
  const saved = structuredClone(FORMAT_2_138) as unknown as SavedJson;
  const shops = { bowl: { restockAt: 9, contracts: [claim('posted', 'v-9'), claim('quiet', null)] } };
  const player = saved.player as SavedJson;
  return { ...saved, shops, player: { ...player, contracts: [claim('held', 'v-8')] } };
}

describe('save migration withoutPostedClaimRivals, a posted claim has no rival', () => {
  it('clears the rival on board claims and keeps the held claim', () => {
    const before = oldSave();
    const next = step.step(structuredClone(before));
    expect(((next.shops as Record<string, SavedJson>).bowl.contracts as SavedJson[]).map((c) => c.rival)).toEqual([null, null]);
    expect((next.player as SavedJson).contracts).toEqual([claim('held', 'v-8')]);
  });

  it('leaves the rest of the world as it was', () => {
    const before = oldSave();
    const next = step.step(structuredClone(before));
    expect({ ...next, shops: undefined }).toEqual({ ...before, shops: undefined });
  });
});
