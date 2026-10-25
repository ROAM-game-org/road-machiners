import { describe, expect, it } from 'vitest';
import FORMAT_2_107 from './save-fixtures/format-2-107.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

type Saved = typeof FORMAT_2_107;

const step = (world: Saved): Saved => TINY_STEPS[107 - TINY_FROM].step(structuredClone(world) as unknown as SavedJson) as unknown as Saved;

describe('save migration 107 to 108, a live word is judged afresh by drive distance', () => {
  it('re-dates each offering to the saved turn and changes nothing else', () => {
    const next = step(FORMAT_2_107);
    expect(next.states[1]).toEqual({ ...FORMAT_2_107.states[1], born: FORMAT_2_107.turn });
    expect(next.states[0]).toEqual(FORMAT_2_107.states[0]);
    expect(next.turn).toBe(FORMAT_2_107.turn);
  });
});
