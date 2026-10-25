import { describe, expect, it } from 'vitest';
import FORMAT_2_109 from './save-fixtures/format-2-109.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

type Saved = typeof FORMAT_2_109;
type Stepped = { crimes: (Saved['crimes'][number] & { posse: string })[] };

const step = (world: Saved): Stepped => TINY_STEPS[109 - TINY_FROM].step(structuredClone(world) as unknown as SavedJson) as unknown as Stepped;

describe('save migration 109 to 110, a case remembers its posse', () => {
  it('marks every saved case, open or closed, for one Marshall', () => {
    expect(step(FORMAT_2_109).crimes.map((c) => c.posse)).toEqual(['lone', 'lone']);
  });

  it('keeps every other fact of a case', () => {
    const next = step(FORMAT_2_109);
    next.crimes.forEach((c, i) => expect({ ...c, posse: undefined }).toEqual(FORMAT_2_109.crimes[i]));
  });

  it('changes nothing in a save with no case', () => {
    expect(step({ crimes: [] } as unknown as Saved)).toEqual({ crimes: [] });
  });
});
