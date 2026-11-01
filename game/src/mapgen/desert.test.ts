import { describe, expect, it } from 'vitest';
import { DESERT, TERRAIN } from '../data/terrain';
import { scalePoint } from '../data/region';
import { ridgeShape, sandSupply } from './desert';

describe('desert dunes', () => {
  it('rises gently on the windward side and drops steeply on the slip face', () => {
    const cover = 0.8;
    const rise = cover * (1 - DESERT.leeShare);
    const windward = (ridgeShape(rise * 0.6, cover) - ridgeShape(rise * 0.4, cover)) / (rise * 0.2);
    const lee = (ridgeShape(rise + (cover - rise) * 0.4, cover) - ridgeShape(rise + (cover - rise) * 0.6, cover)) / ((cover - rise) * 0.2);
    expect(lee).toBeGreaterThan(windward * 4);
  });

  it('leaves a flat lane between ridges', () => {
    expect(ridgeShape(0.9, 0.7)).toBe(0);
  });

  it('has sand only in the desert, not on the plain by Bowl', () => {
    const bowl = scalePoint({ x: 16, y: 94 });
    expect(sandSupply(bowl.x, bowl.y)).toBe(0);
    const deep = scalePoint({ x: 110, y: 80 });
    expect(sandSupply(deep.x, deep.y)).toBeGreaterThan(0.5);
  });

  it('makes its slip faces steeper than a truck climbs where the dune is tallest', () => {
    const cover = DESERT.cover[1];
    const length = DESERT.wavelength;
    const leeWidth = cover * DESERT.leeShare * length;
    expect(DESERT.height[1] / leeWidth).toBeGreaterThan(TERRAIN.drive.maxSlope);
  });
});
