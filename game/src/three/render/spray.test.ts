import { describe, expect, it } from 'vitest';
import { TERRAIN_TYPES } from '../../data/terrain';
import { sprayLook, sprayPuffsPerMeter, sprayShare } from './fx';
import { TUNING } from './inkTuning';
import { EMISSION_LOOK } from './particles/emissions';
import { inkSizeOf } from './particles/particles';

describe('wheel spray by surface', () => {
  it('throws almost nothing on roads and the most on loose sand', () => {
    expect(sprayShare(TERRAIN_TYPES.road)).toBeLessThan(0.1);
    expect(sprayShare(TERRAIN_TYPES.asphalt)).toBeLessThan(0.1);
    expect(sprayShare(TERRAIN_TYPES.hardpan)).toBe(1);
    expect(sprayShare(TERRAIN_TYPES.sand)).toBeGreaterThan(1.5);
  });

  it('keeps the order of the ground dust values the sim uses for sighting', () => {
    const types = Object.values(TERRAIN_TYPES).sort((a, b) => a.dust - b.dust);
    const shares = types.map(sprayShare);
    expect(shares).toEqual([...shares].sort((a, b) => a - b));
  });
});

describe('wheel spray and the smoke size knob', () => {
  it('keeps wheel dust out of the smoke size knob while exhaust shrinks with it', () => {
    const spray = { perMeter: 6, minPerMeter: 2, life: 1, size: { from: 0.5, to: 1 }, alpha: { peak: 0.5, fadeIn: 0.1 }, drag: 1, gravity: 0 };
    expect(inkSizeOf(sprayLook(spray, TERRAIN_TYPES.sand, [0]), 1)).toBe(1);
    expect(inkSizeOf(EMISSION_LOOK.exhaust, 1)).toBeCloseTo(TUNING.smokeSize.value);
  });
});

describe('wheel spray on thin ground', () => {
  const spray = { perMeter: 6, minPerMeter: 2, life: 1, size: { from: 0.5, to: 1 }, alpha: { peak: 0.5, fadeIn: 0.1 }, drag: 1, gravity: 0, groundShare: 0.5 } as const;
  const opacityPerMeter = (ground: typeof TERRAIN_TYPES.road) => sprayPuffsPerMeter(spray, ground) * sprayLook(spray, ground, [0]).alpha.peak;

  it('makes more, fainter, softer puffs on a road and lays the same dust as before', () => {
    const road = TERRAIN_TYPES.road;
    expect(sprayPuffsPerMeter(spray, road)).toBe(spray.minPerMeter);
    expect(sprayLook(spray, road, [0]).alpha.peak).toBeLessThan(spray.alpha.peak);
    expect(sprayLook(spray, road, [0]).form).toBe('cloud');
    expect(opacityPerMeter(road)).toBeCloseTo(spray.perMeter * sprayShare(road) * spray.alpha.peak, 9);
  });

  it('leaves thick ground as it was', () => {
    const sand = TERRAIN_TYPES.sand;
    expect(sprayPuffsPerMeter(spray, sand)).toBe(spray.perMeter * sprayShare(sand));
    expect(sprayLook(spray, sand, [0]).alpha.peak).toBe(spray.alpha.peak);
    expect(sprayLook(spray, sand, [0]).form).toBe('clump');
  });
});
