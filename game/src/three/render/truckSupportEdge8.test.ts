import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EDGE_PART_IDS, faultsOnEveryEdgeCell } from '../../test/truck-support-edge';
import { SURFACE_ATLAS } from './models';
import type * as TruckMesh from './truckMesh';

vi.mock('./truckMesh', async (load) => (await import('../../test/truck-support-stills')).keepingStills(await load<typeof TruckMesh>()));

SURFACE_ATLAS.value = new THREE.Texture();

describe.each(['loader', 'bukhanka'])('mounted small parts on every edge cell of the %s', (chassisId) => {
  it.each(EDGE_PART_IDS)('a %s on every legal edge cell and turn stands on the truck', (defId) => {
    const { faults, known } = faultsOnEveryEdgeCell(chassisId, defId);
    expect(faults).toEqual(known);
  });
});
