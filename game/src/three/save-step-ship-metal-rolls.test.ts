import { describe, expect, it } from 'vitest';
import FORMAT_2_124 from './save-fixtures/format-2-124.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

const shipMetalStep = TINY_STEPS.find((s) => s.name === 'withShipMetalRolls')!;
const step = (world: unknown): unknown => shipMetalStep.step(structuredClone(world) as SavedJson);

describe('save migration withShipMetalRolls, wrecks and old places may hold Ship Metal', () => {
  it('is the tiny step from format 126', () => {
    expect(TINY_STEPS[126 - TINY_FROM]).toBe(shipMetalStep);
  });

  it('leaves the world as it was', () => {
    expect(step(FORMAT_2_124)).toEqual(FORMAT_2_124);
  });
});
