import { describe, expect, it } from 'vitest';
import FORMAT_2_104 from './save-fixtures/format-2-104.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

describe('save migration 104 to 105, the failed contract deed', () => {
  it('changes no data and keeps the failedContract deed as saved', () => {
    const next = TINY_STEPS[104 - TINY_FROM].step(structuredClone(FORMAT_2_104) as unknown as SavedJson);
    expect(next).toEqual(FORMAT_2_104);
    expect((next.player as SavedJson).deeds).toEqual([{ subject: 'ct-board-haul', faction: 'bowl', deed: 'failedContract', delta: -5, turn: 100 }]);
  });
});
