import { describe, expect, it } from 'vitest';
import FORMAT_2_107 from './save-fixtures/format-2-107.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

type Saved = typeof FORMAT_2_107 & { sheltered?: unknown[] };

const HOLLOW_PAD = { x: 308.2397464837026, y: 513.8133571499616 };
const SHELTER_FORMAT = TINY_STEPS.findIndex((named) => named.name === 'withShelteredHollow') + TINY_FROM;

const stepAt = (format: number, world: SavedJson): SavedJson => TINY_STEPS[format - TINY_FROM].step(structuredClone(world));
const beforeShelter = (): Saved => stepAt(108, stepAt(107, structuredClone(FORMAT_2_107) as unknown as SavedJson)) as unknown as Saved;
const sheltered = (world: Saved): Saved => stepAt(SHELTER_FORMAT, world as unknown as SavedJson) as unknown as Saved;
const car = (w: Saved, id: string) => w.vehicles.find((v) => v.id === id)!;

describe('save migration to the Sunward resting inside the Hollow', () => {
  it('runs right after the meeting roles step', () => {
    expect(TINY_STEPS[SHELTER_FORMAT - TINY_FROM - 1].name).toBe('withMeetingRoles');
  });

  it('sends every Sunward home from its laager bay to the Hollow pad and moves no car', () => {
    const before = beforeShelter();
    const next = sheltered(before);
    for (const id of ['v31', 'v32', 'v33']) expect(car(next, id).brain!.home).toEqual(HOLLOW_PAD);
    expect(next.vehicles.map((v) => v.pos)).toEqual(before.vehicles.map((v) => v.pos));
  });

  it('points a goal that aims at a bay to the pad and leaves other goals alone', () => {
    const next = sheltered(beforeShelter());
    expect(car(next, 'v31').brain!.goals[0].destination).toEqual(HOLLOW_PAD);
    expect(car(next, 'v32').brain!.goals[0].destination).toEqual(HOLLOW_PAD);
    expect(car(next, 'v33').brain!.goals[0].destination).toEqual({ x: 350, y: 320 });
  });

  it('leaves trucks of other homes untouched', () => {
    const before = beforeShelter();
    expect(car(sheltered(before), 'v50')).toEqual(car(before, 'v50'));
  });

  it('starts the world with nobody inside a site', () => {
    expect(sheltered(beforeShelter()).sheltered).toEqual([]);
  });
});
