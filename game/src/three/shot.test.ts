import { describe, expect, it } from 'vitest';
import type { CoreDef } from '../data/parts';
import { partDef } from '../data/parts';
import { mountedParts } from '../sim/grid';
import { vehicleOn, world } from './shot';

describe('vehicleOn', () => {
  it('draws the stock truck on a chassis the new world has no truck on', () => {
    expect(world().vehicles.some((v) => v.chassisId === 'niva')).toBe(false);
    const niva = vehicleOn('niva');
    expect(niva.chassisId).toBe('niva');
    expect(mountedParts(niva, 'core').filter((p) => (partDef(p.defId) as CoreDef).role === 'wheel')).toHaveLength(4);
  });

  it('throws on an unknown chassis', () => {
    expect(() => vehicleOn('nope')).toThrow();
  });
});
