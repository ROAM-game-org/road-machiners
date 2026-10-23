import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadModels, model } from '../three/render/models';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});
const ROUND_SMALL = 18;
const PIECES = [
  { piece: 'tire', material: 'wheel', radius: 0.935 },
  { piece: 'rim', material: 'metal_light', radius: 0.55 },
  { piece: 'hub', material: 'rust', radius: 0.22 },
] as const;

function sidesAt(scene: THREE.Object3D, material: string, radius: number): number {
  const angles = new Set<number>();
  const p = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || (o.material as THREE.Material).name !== material) return;
    const position = o.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
      if (Math.abs(Math.hypot(p.x, p.y) - radius) < 0.005) angles.add(Math.round(((Math.atan2(p.y, p.x) + Math.PI * 2) % (Math.PI * 2)) * 1000) % 6283);
    }
  });
  return angles.size;
}

describe('the shared wheel model', () => {
  it.each(PIECES)('draws its $piece with at least 18 sides, so it reads round', ({ material, radius }) => {
    expect(sidesAt(model('wheel'), material, radius)).toBeGreaterThanOrEqual(ROUND_SMALL);
  });
});
