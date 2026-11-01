import { describe, expect, it } from 'vitest';
import { FARM_BELT, TERRAIN } from '../data/terrain';
import { ditchHeight } from './farmbelt';

const C = FARM_BELT.canal;
const GROUND = 5;
const BED = GROUND - C.depth;

describe('farm belt ditches', () => {
  it('lays the bed at its graded level and raises a bank beside it', () => {
    expect(ditchHeight(GROUND, 0, BED, C.width)).toBe(BED);
    expect(ditchHeight(GROUND, C.width + 2, BED, C.width)).toBeGreaterThan(GROUND);
    expect(ditchHeight(GROUND, C.width + C.bankWidth, BED, C.width)).toBeCloseTo(GROUND, 9);
  });

  it('never raises ground that already lies below the graded bed', () => {
    expect(ditchHeight(BED - 1, 0, BED, C.width)).toBe(BED - 1);
  });

  it('cuts a canal wall steeper than a truck climbs, so a canal is crossed only at a track', () => {
    const wall = ditchHeight(GROUND, C.width + 1, BED, C.width) - ditchHeight(GROUND, C.width, BED, C.width);
    expect(wall).toBeGreaterThan(TERRAIN.drive.maxSlope);
  });
});
