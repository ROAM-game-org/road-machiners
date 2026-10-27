import { describe, expect, it } from 'vitest';
import { SWAMP } from '../data/terrain';
import { BUILT_BLACK_MUD, BUILT_DIRTY_WATER, BUILT_SCRUB } from './newworld';
import { swampGround } from './swamp';

describe('swamp ground', () => {
  it('floods ground well below the water table', () => {
    expect(swampGround(SWAMP.water + 0.1, 0)).toBe(BUILT_DIRTY_WATER);
  });

  it('turns ground near the water table to black mud', () => {
    expect(swampGround((SWAMP.water + SWAMP.mud) / 2, 0)).toBe(BUILT_BLACK_MUD);
  });

  it('grows scrub on islands just above the mud and leaves high ground alone', () => {
    expect(swampGround(SWAMP.mud - SWAMP.water / 2, 0)).toBe(BUILT_SCRUB);
    expect(swampGround(SWAMP.mud - SWAMP.water / 2, 0.99)).toBe(BUILT_BLACK_MUD);
    expect(swampGround(SWAMP.mud - SWAMP.water * 2, 0)).toBeNull();
  });
});
