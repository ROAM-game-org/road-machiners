import { describe, expect, it } from 'vitest';
import FORMAT_2_105 from './save-fixtures/format-2-105.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';
import { chaosHighwayMode_105_106 } from './save-steps-late';

const step = (world: SavedJson): SavedJson => TINY_STEPS[105 - TINY_FROM].step(structuredClone(world));

describe('save migration 105 to 106, Chaos Highway takes its new name', () => {
  it('moves the run to the new key and keeps it as it was', () => {
    const next = step(FORMAT_2_105.world);
    expect(next.chaosHighway).toEqual(FORMAT_2_105.world.furyRoad);
    expect('furyRoad' in next).toBe(false);
    expect(next.setup).toEqual({ mode: 'chaosHighway', settings: {} });
    expect(next.turn).toBe(40);
  });

  it('keeps a Roaming save with no run, and its mode', () => {
    const next = step({ turn: 3, setup: { mode: 'roaming' }, furyRoad: null });
    expect(next).toEqual({ turn: 3, setup: { mode: 'roaming' }, chaosHighway: null });
  });

  it('passes a mode it does not know through', () => {
    expect(step({ setup: { mode: 'other' }, furyRoad: null }).setup).toEqual({ mode: 'other' });
    expect(chaosHighwayMode_105_106('furyRoad')).toBe('chaosHighway');
    expect(chaosHighwayMode_105_106('roaming')).toBe('roaming');
  });

  it('throws on a world with no run key', () => {
    expect(() => step({ setup: { mode: 'roaming' } })).toThrow();
  });
});
