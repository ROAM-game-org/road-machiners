import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CHASSIS } from '../../data/chassis';
import { baseModels } from '../../render/partLooks';
import { bodyRays } from './bodyRays';
import { loadModels, model } from './models';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const BASES = [...new Set(Object.keys(CHASSIS).flatMap((id) => baseModels(id)))];
const lamp = (mesh: THREE.Mesh) => mesh.userData.lamp === true || (mesh.material as THREE.Material).name.includes('glass');

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function raysAround(body: THREE.Object3D, count: number): THREE.Ray[] {
  const box = new THREE.Box3().setFromObject(body).expandByScalar(0.2);
  const rand = seeded(7);
  const at = (lo: number, hi: number) => lo + (hi - lo) * rand();
  const rays: THREE.Ray[] = [];
  for (let k = 0; k < count; k++) {
    const from = new THREE.Vector3(at(box.min.x, box.max.x), at(box.min.y, box.max.y), at(box.min.z, box.max.z));
    const dir = new THREE.Vector3(at(-1, 1), at(-1, 0.3), at(-1, 1)).normalize();
    rays.push(new THREE.Ray(from, dir));
  }
  return rays;
}

describe('body rays', () => {
  it.each(BASES)('%s: every ray hits the same point and the same see-through flag as a three.js raycast', (name) => {
    const body = model(name);
    body.updateWorldMatrix(true, true);
    const cast = bodyRays(body, lamp);
    const misses: string[] = [];
    let hits = 0;
    for (const ray of raysAround(body, 400)) {
      const old = new THREE.Raycaster(ray.origin, ray.direction).intersectObject(body, true)[0];
      if (old) hits++;
      const hit = cast(ray.origin, ray.direction);
      const same = old ? hit !== null && hit.point.distanceTo(old.point) < 1e-6 && hit.seeThrough === lamp(old.object as THREE.Mesh) : hit === null;
      if (!same) misses.push(`${ray.origin.toArray().map((n) => n.toFixed(3))} toward ${ray.direction.toArray().map((n) => n.toFixed(3))}`);
    }
    expect(misses).toEqual([]);
    expect(hits).toBeGreaterThan(100);
  });
});
