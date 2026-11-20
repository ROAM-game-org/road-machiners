import { describe, expect, it } from 'vitest';
import FORMAT_2_124 from './save-fixtures/format-2-124.json';
import { TINY_STEPS, type SavedJson } from './save-migrations';

const withBowlRelics = TINY_STEPS.find((s) => s.name === 'withBowlRelics')!;

function oldSave(): SavedJson {
  const saved = structuredClone(FORMAT_2_124) as unknown as SavedJson;
  return { ...saved, shops: { bowl: { goods: { salt: 7, scrap: 3 }, stock: [] }, nose: { goods: { salt: 5, relics: 2 } } } };
}

describe('save migration withBowlRelics, Bowl starts to trade Ship Metal', () => {
  it('gives Bowl an empty Ship Metal stock and keeps every other good', () => {
    const next = withBowlRelics.step(structuredClone(oldSave())).shops as Record<string, SavedJson>;
    expect(next.bowl.goods).toEqual({ relics: 0, salt: 7, scrap: 3 });
    expect(next.bowl.stock).toEqual([]);
  });

  it('leaves Nose and the rest of the world as it was', () => {
    const before = oldSave();
    const next = withBowlRelics.step(structuredClone(before));
    expect((next.shops as Record<string, SavedJson>).nose).toEqual((before.shops as Record<string, SavedJson>).nose);
    expect({ ...next, shops: undefined }).toEqual({ ...before, shops: undefined });
  });

  it('keeps a Ship Metal stock Bowl already holds', () => {
    const before = oldSave();
    ((before.shops as Record<string, SavedJson>).bowl.goods as Record<string, number>).relics = 4;
    const next = withBowlRelics.step(structuredClone(before)).shops as Record<string, SavedJson>;
    expect((next.bowl.goods as Record<string, number>).relics).toBe(4);
  });
});
