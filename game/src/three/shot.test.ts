import { describe, expect, it } from 'vitest';
import type { CoreDef } from '../data/parts';
import { partDef } from '../data/parts';
import { CHASSIS } from '../data/chassis';
import { unitsOf } from '../sim/body';
import { mountedParts } from '../sim/grid';
import { vehicleOn, world } from './shot';

describe('vehicleOn', () => {
  it('draws the stock truck on a chassis the new world has no truck on', () => {
    const missing = Object.keys(CHASSIS).find((id) => !unitsOf(id)[1] && !world().vehicles.some((v) => v.chassisId === id));
    expect(missing).toBeDefined();
    const stock = vehicleOn(missing!);
    expect(stock.chassisId).toBe(missing);
    expect(mountedParts(stock, 'core').filter((p) => (partDef(p.defId) as CoreDef).role === 'wheel')).toHaveLength(4);
  });

  it('throws on an unknown chassis', () => {
    expect(() => vehicleOn('nope')).toThrow();
  });
});
