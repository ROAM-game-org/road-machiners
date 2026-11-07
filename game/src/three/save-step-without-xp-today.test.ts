import { describe, expect, it } from 'vitest';
import FORMAT_2_124 from './save-fixtures/format-2-124.json';
import { TINY_STEPS, type SavedJson } from './save-migrations';

const withoutXpToday = TINY_STEPS.find((s) => s.name === 'withoutXpToday')!;

function oldSave(): SavedJson {
  const saved = structuredClone(FORMAT_2_124) as unknown as SavedJson;
  const player = saved.player as SavedJson;
  return { ...saved, player: { ...player, xp: 420, xpWindow: 3, xpToday: { driving: 12, perception: 0, machining: 40, toughness: 0, social: 3 } } };
}

describe('save migration withoutXpToday, the daily XP counter leaves the player', () => {
  it('drops the counter and keeps the XP, its sources, the window and the repeats', () => {
    const before = oldSave();
    const next = withoutXpToday.step(structuredClone(before)).player as SavedJson;
    const player = before.player as SavedJson;
    expect(next).not.toHaveProperty('xpToday');
    expect(next).toEqual({ ...player, xpToday: undefined });
    expect(next.xp).toBe(420);
    expect(next.xpWindow).toBe(3);
    expect(next.repeats).toEqual(player.repeats);
    expect(next.xpBySource).toEqual(player.xpBySource);
  });

  it('leaves the rest of the world as it was', () => {
    const before = oldSave();
    const next = withoutXpToday.step(structuredClone(before));
    expect({ ...next, player: undefined }).toEqual({ ...before, player: undefined });
  });
});
