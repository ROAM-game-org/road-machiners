import { describe, expect, it } from 'vitest';
import FORMAT_2_104 from './save-fixtures/format-2-104.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

const step = (world: unknown): SavedJson => TINY_STEPS[104 - TINY_FROM](structuredClone(world) as SavedJson);
const fixture = () => structuredClone(FORMAT_2_104);
const jobOf = (world: SavedJson, id: string) => (world.vehicles as SavedJson[]).find((v) => v.id === id)?.job;

describe('save migration 104 to 105, refit jobs hold a queue', () => {
  it('gives every running refit, of the player and of an NPC, an empty queue and keeps the step in progress', () => {
    const next = step(fixture());
    expect(jobOf(next, 'v-player')).toEqual({ ...fixture().vehicles[0].job, queue: [] });
    expect(jobOf(next, 'v-looter')).toEqual({ ...fixture().vehicles[1].job, queue: [] });
  });

  it('leaves other jobs and idle trucks as they were', () => {
    const next = step(fixture());
    expect(jobOf(next, 'v-searcher')).toEqual(fixture().vehicles[2].job);
    expect(jobOf(next, 'v-raider')).toBeNull();
  });

  it('keeps a queue a save already holds', () => {
    const saved = fixture() as unknown as SavedJson;
    const queued = [{ moves: [], pickup: null }];
    ((saved.vehicles as SavedJson[])[0].job as SavedJson).queue = queued;
    expect(jobOf(step(saved), 'v-player')).toMatchObject({ queue: queued });
  });
});
