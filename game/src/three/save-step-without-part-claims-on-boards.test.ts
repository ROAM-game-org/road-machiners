import { describe, expect, it } from 'vitest';
import FORMAT_2_138 from './save-fixtures/format-2-138.json';
import { TINY_STEPS, type SavedJson } from './save-migrations';

const step = TINY_STEPS.find((s) => s.name === 'withoutPartClaimsOnBoards')!;

const contract = (id: string, kind: string) => ({ id, kind, shop: 'bowl' });

function oldSave(): SavedJson {
  const saved = structuredClone(FORMAT_2_138) as unknown as SavedJson;
  const shops = { bowl: { restockAt: 9, contracts: [contract('posted', 'claim'), contract('haul', 'deliver')] }, nose: { restockAt: 4, contracts: [contract('other', 'claim')] } };
  const player = saved.player as SavedJson;
  return { ...saved, shops, player: { ...player, contracts: [contract('held', 'claim')] } };
}

describe('save migration withoutPartClaimsOnBoards, claims ask for relics', () => {
  it('takes part claims off the boards so they post again as relic claims, and keeps the held claim', () => {
    const next = step.step(structuredClone(oldSave()));
    const shops = next.shops as Record<string, SavedJson>;
    expect(shops.bowl.contracts).toEqual([contract('haul', 'deliver')]);
    expect(shops.nose.contracts).toEqual([]);
    expect((next.player as SavedJson).contracts).toEqual([contract('held', 'claim')]);
  });

  it('leaves the rest of the world as it was', () => {
    const before = oldSave();
    const next = step.step(structuredClone(before));
    expect({ ...next, shops: undefined }).toEqual({ ...before, shops: undefined });
    expect((next.shops as Record<string, SavedJson>).bowl.restockAt).toBe(9);
  });
});
