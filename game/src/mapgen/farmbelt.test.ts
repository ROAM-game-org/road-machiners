import { describe, expect, it } from 'vitest';
import { FARM_BELT, TERRAIN } from '../data/terrain';
import { ditchProfile } from './farmbelt';

const C = FARM_BELT.canal;

describe('farm belt ditches', () => {
  it('sinks the bed and raises a bank beside it', () => {
    expect(ditchProfile(0, C.width, C.depth)).toBe(-C.depth);
    expect(ditchProfile(C.width + 2, C.width, C.depth)).toBeGreaterThan(0);
    expect(ditchProfile(C.width + C.bankWidth, C.width, C.depth)).toBeCloseTo(0, 9);
  });

  it('cuts a canal wall steeper than a truck climbs, so a canal is crossed only at a track', () => {
    const wall = ditchProfile(C.width + 1, C.width, C.depth) - ditchProfile(C.width, C.width, C.depth);
    expect(wall).toBeGreaterThan(TERRAIN.drive.maxSlope);
  });
});
