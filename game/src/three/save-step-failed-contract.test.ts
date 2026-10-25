import { describe, expect, it } from 'vitest';
import FORMAT_2_105 from './save-fixtures/format-2-105.json';
import FORMAT_2_106 from './save-fixtures/format-2-106.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

describe('save migration 105 to 106, the failed contract deed', () => {
  it('changes no data and keeps the failedContract deed as saved', () => {
    const next = TINY_STEPS[105 - TINY_FROM].step(structuredClone(FORMAT_2_105) as unknown as SavedJson);
    expect(next).toEqual(FORMAT_2_105);
    expect((next.player as SavedJson).deeds).toEqual([{ subject: 'ct-board-haul', faction: 'bowl', deed: 'failedContract', delta: -5, turn: 100 }]);
  });
});

describe('save migration 106 to 107, the late haul and the embezzlement case', () => {
  it('changes no data and keeps a late ending, a held haul and a shop-issued case as saved', () => {
    const next = TINY_STEPS[106 - TINY_FROM].step(structuredClone(FORMAT_2_106) as unknown as SavedJson);
    expect(next).toEqual(FORMAT_2_106);
    expect((next.crimes as SavedJson[])[0].issuer).toEqual({ kind: 'shop', shop: 'granary' });
    expect(((next.player as SavedJson).pastContracts as SavedJson[])[0].outcome).toBe('late');
  });
});
