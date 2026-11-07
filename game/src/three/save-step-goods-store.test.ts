import { describe, expect, it } from 'vitest';
import FORMAT_2_124 from './save-fixtures/format-2-124.json';
import { FOLDED_AND_TINY_STEPS as TINY_STEPS, type SavedJson } from './save-migrations';

const goodsStoreStep = TINY_STEPS.find((s) => s.name === 'goodsStore')!;

describe('save migration goodsStore, the player gets an empty crate store per shop', () => {
  it('runs after the work day XP step', () => {
    expect(TINY_STEPS.findIndex((s) => s.name === 'xpByWorkDay')).toBeLessThan(TINY_STEPS.indexOf(goodsStoreStep));
  });

  it('adds only an empty store to the player', () => {
    const before = structuredClone(FORMAT_2_124) as unknown as SavedJson;
    const next = goodsStoreStep.step(structuredClone(before));
    expect(next).toEqual({ ...before, player: { ...(before.player as SavedJson), storedGoods: {} } });
  });
});
