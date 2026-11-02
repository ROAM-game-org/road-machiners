import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CHASSIS } from '../../data/chassis';
import { boxFaultsOnEveryDeckCell } from '../../test/truck-support-faults';
import { SURFACE_ATLAS } from './models';
import type * as TruckMesh from './truckMesh';

vi.mock('./truckMesh', async (load) => {
  const real = await load<typeof TruckMesh>();
  const { stills } = await import('../../test/truck-support-stills');
  return {
    ...real,
    mergeParts: (group: THREE.Group, ...rest: [ReadonlySet<string>, 'armor' | 'parts']) => {
      stills.push(group.clone(true));
      return real.mergeParts(group, ...rest);
    },
  };
});

SURFACE_ATLAS.value = new THREE.Texture();

const CHASSIS_IDS = Object.keys(CHASSIS).filter((_, i) => i % 2 === 0);

describe('small parts on every deck cell', () => {
  it.each(CHASSIS_IDS)('a caltrops box on any deck cell of the %s stands on the truck', (chassisId) => {
    const { faults, known } = boxFaultsOnEveryDeckCell(chassisId);
    expect(faults).toEqual(known);
  });
});
