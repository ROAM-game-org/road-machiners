import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { faultsOfGunLook, gunCasesOfFile } from '../../test/truck-support-guns';
import { SURFACE_ATLAS } from './models';
import type * as TruckMesh from './truckMesh';

vi.mock('./truckMesh', async (load) => (await import('../../test/truck-support-stills')).keepingStills(await load<typeof TruckMesh>()));

SURFACE_ATLAS.value = new THREE.Texture();

describe('guns on every deck cell', () => {
  it.each(gunCasesOfFile(18))('the $name builds and stands on the truck on any legal cell and rotation', (gun) => {
    expect(faultsOfGunLook(gun)).toEqual([]);
  });
});
