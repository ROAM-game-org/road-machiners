import { describe, expect, it } from 'vitest';
import FORMAT_2_138 from './save-fixtures/format-2-138.json';
import { FOLDED_AND_TINY_STEPS as TINY_STEPS, type SavedJson } from './save-migrations';

const step = TINY_STEPS.find((s) => s.name === 'withClaimBids')!;

describe('save migration withClaimBids, a claim rival can bid on the relic', () => {
  it('is the newest tiny step', () => {
    expect(TINY_STEPS.at(-1)).toBe(step);
  });

  it('leaves an older save as it was, since no old save holds a bid', () => {
    const old = structuredClone(FORMAT_2_138) as unknown as SavedJson;
    expect(step.step(structuredClone(old))).toEqual(old);
  });
});
