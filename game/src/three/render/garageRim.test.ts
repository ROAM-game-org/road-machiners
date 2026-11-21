import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PAINT, PLAYER_CHASSIS } from '../../data/chassis';
import { bareVehicle } from '../../sim/factory';
import type { Vehicle } from '../../sim/types';
import { loadModels } from './models';
import { VehicleView, type ViewScene } from './vehicle';
import { BODY_PARTS } from '../../render/partLooks';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

function wornTruck(chassisId: string, hpShare: number): Vehicle {
  const v = bareVehicle({ nextId: 1 }, { faction: 'player', chassisId, pos: { x: 0, y: 0 }, heading: 0, brain: null });
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
  const cases = PLAYER_CHASSIS.flatMap((id) => (['portrait', 'xray'] as const).map((scene) => [id, scene] as const));
  it.each(cases)('keeps the hull rim of a worn %s where the plates stand in the %s view', (id, scene) => {
    const fresh = hullSpan(wornTruck(id, 1), scene);
    const worn = hullSpan(wornTruck(id, 0.1), scene);
    expect(worn.min.x).toBeCloseTo(fresh.min.x, 2);
    expect(worn.max.x).toBeCloseTo(fresh.max.x, 2);
    expect(worn.min.z).toBeCloseTo(fresh.min.z, 2);
    expect(worn.max.z).toBeCloseTo(fresh.max.z, 2);
  });
});
