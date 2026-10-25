import { describe, expect, it } from 'vitest';
import FORMAT_2_109 from './save-fixtures/format-2-109.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

type Saved = typeof FORMAT_2_109;
type Stepped = { crimes: SavedJson[]; vehicles: { id: string; brain: { memories: { fact: SavedJson }[] } | null }[] };

const step = (world: Saved): Stepped => TINY_STEPS[109 - TINY_FROM].step(structuredClone(world) as unknown as SavedJson) as unknown as Stepped;

describe('save migration 109 to 110, cases carry restitution and whether the target knows', () => {
  it('names the step withCaseRestitution', () => {
    expect(TINY_STEPS[109 - TINY_FROM].name).toBe('withCaseRestitution');
  });

  it('gives every case no restitution and marks it known, since the old log already told the player', () => {
    const next = step(FORMAT_2_109);
    expect(next.crimes[0]).toEqual({ ...FORMAT_2_109.crimes[0], restitution: 0, known: true });
  });

  it('gives every witnessed memory no restitution and leaves other memories and brainless trucks alone', () => {
    const next = step(FORMAT_2_109);
    const [witnessed, sighting] = next.vehicles[0].brain!.memories;
    expect(witnessed.fact).toEqual({ ...FORMAT_2_109.vehicles[0].brain!.memories[0].fact, restitution: 0 });
    expect(sighting).toEqual(FORMAT_2_109.vehicles[0].brain!.memories[1]);
    expect(next.vehicles[1]).toEqual(FORMAT_2_109.vehicles[1]);
  });

  it('changes nothing in a save with no cases and no memories', () => {
    expect(step({ crimes: [], vehicles: [] } as unknown as Saved)).toEqual({ crimes: [], vehicles: [] });
  });
});
