import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PAINT } from '../../data/chassis';
import { playerVehicle } from '../../sim/damage';
import { PLAIN_KIT } from '../../sim/testkit';
import { defaultSetup } from '../../sim/settings';
import type { Vehicle } from '../../sim/types';
import { newWorld } from '../../sim/world';
import { TEST_MAP } from '../../test/map';
import { loadModels } from './models';
import { VehicleView, type ViewScene } from './vehicle';
import { BODY_PARTS } from '../../render/partLooks';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

function wornTruck(hpShare: number): Vehicle {
  const v = playerVehicle(newWorld(1337, PLAIN_KIT, TEST_MAP, defaultSetup('roaming')));
  const cab = v.items.find((it) => it.kind === 'part' && BODY_PARTS.has(it.part.defId));
  if (cab && cab.kind === 'part') cab.part.hp = Math.max(0, Math.floor(cab.part.hp * hpShare));
  return v;
}

function hullSpan(v: Vehicle, scene: ViewScene): THREE.Box3 {
  const view = new VehicleView(null, false, PAINT.standard, scene);
  let guard = 0;
  while (!view.built && guard++ < 400) view.update(v, false, PAINT.standard, { take: () => true, ready: () => true });
  view.root.updateMatrixWorld(true);
  let hull = new THREE.Box3();
  let biggest = 0;
  view.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    const volume = size.x * size.z;
    if (volume > biggest) [biggest, hull] = [volume, box];
  });
  view.dispose();
  return hull;
}

describe('garage body outline', () => {
  it.each(['portrait', 'xray'] as const)('keeps the hull rim of a worn truck where the plates stand in the %s view', (scene) => {
    const fresh = hullSpan(wornTruck(1), scene);
    const worn = hullSpan(wornTruck(0.1), scene);
    expect(worn.min.x).toBeCloseTo(fresh.min.x, 2);
    expect(worn.max.x).toBeCloseTo(fresh.max.x, 2);
    expect(worn.min.z).toBeCloseTo(fresh.min.z, 2);
    expect(worn.max.z).toBeCloseTo(fresh.max.z, 2);
  });
});
