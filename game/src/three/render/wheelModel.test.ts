// The shared wheel model reads as one tire: mirror-symmetric tread, a 1 m frame, and a round side outline.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadModels, model } from './models';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

function worldVertices(root: THREE.Object3D): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const out: THREE.Vector3[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
  });
  return out;
}

const key = (x: number, y: number, z: number) => [x, y, z].map((v) => (Math.round(v * 1e4) / 1e4 || 0).toFixed(4)).join(',');

describe('wheel model', () => {
  const verts = worldVertices(model('wheel'));

  it('is mirror-symmetric across the plane normal to the axle', () => {
    const keys = new Set(verts.map((v) => key(v.x, v.y, v.z)));
    const missing = verts.filter((v) => !keys.has(key(v.x, v.y, -v.z))).slice(0, 5).map((v) => key(v.x, v.y, v.z));
    expect(missing).toEqual([]);
  });

  it('keeps the 1 m frame centred on the hub', () => {
    const reach = Math.max(...verts.map((v) => Math.hypot(v.x, v.y)));
    expect(reach).toBeGreaterThanOrEqual(0.99);
    expect(reach).toBeLessThanOrEqual(1.01);
    expect(Math.max(...verts.map((v) => Math.abs(v.z)))).toBeLessThanOrEqual(0.5);
    const box = new THREE.Box3().setFromPoints(verts);
    const c = box.getCenter(new THREE.Vector3());
    expect(Math.hypot(c.x, c.y, c.z)).toBeLessThan(0.01);
  });

  function wheelMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    model('wheel').traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    for (const m of meshes) (m.material as THREE.Material).side = THREE.DoubleSide;
    return meshes;
  }

  function outlineAt(meshes: THREE.Mesh[], depths: readonly number[], rays: number): number[] {
    const ray = new THREE.Raycaster();
    const outline: number[] = [];
    for (let i = 0; i < rays; i++) {
      const a = (Math.PI * 2 * (i + 0.5)) / rays;
      let best = 0;
      for (const z of depths) {
        ray.set(new THREE.Vector3(Math.cos(a) * 2, Math.sin(a) * 2, z), new THREE.Vector3(-Math.cos(a), -Math.sin(a), 0));
        const hit = ray.intersectObjects(meshes, false)[0];
        if (hit) best = Math.max(best, 2 - hit.distance);
      }
      outline.push(best);
    }
    return outline;
  }

  const roundness = (outline: number[]) => Math.min(...outline) / Math.max(...outline);

  it('reads round from the side', () => {
    const depths = Array.from({ length: 9 }, (_, s) => (s - 4) * 0.1);
    expect(roundness(outlineAt(wheelMeshes(), depths, 72))).toBeGreaterThanOrEqual(0.92);
  });

  it('draws its rim and hub as circles, not as an octagon and a hexagon', () => {
    const meshes = wheelMeshes();
    const rim = outlineAt(meshes, [0.48], 360);
    const hub = outlineAt(meshes, [0.495], 360);
    expect(Math.max(...rim)).toBeGreaterThan(0.5);
    expect(Math.max(...hub)).toBeLessThan(0.25);
    expect(roundness(rim)).toBeGreaterThanOrEqual(0.98);
    expect(roundness(hub)).toBeGreaterThanOrEqual(0.98);
  });
});
