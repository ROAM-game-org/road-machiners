import { describe, expect, it } from 'vitest';
import { Mesh, type Material } from 'three';
import { loadModels, model } from './models';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

type Ring = { piece: string; material: string; face: number; stray: number };

const RINGS: Ring[] = [
  { piece: 'tire body', material: 'wheel', face: 0.47, stray: 0.005 },
  { piece: 'rim', material: 'metal_light', face: 0.49, stray: 0.005 },
  { piece: 'hub', material: 'rust', face: 0.5, stray: 0.02 },
];

const FACE_TOLERANCE = 1e-3;
const ANGLE_STEP = 1e-3;

function materialName(material: Material | Material[]): string {
  return (Array.isArray(material) ? material[0] : material).name;
}

function outerRingAngles(material: string, face: number): number[] {
  const points: { radius: number; angle: number }[] = [];
  model('wheel').traverse((o) => {
    if (!(o instanceof Mesh) || materialName(o.material) !== material) return;
    const position = o.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
      if (Math.abs(Math.abs(z) - face) < FACE_TOLERANCE) points.push({ radius: Math.hypot(x, y), angle: Math.atan2(y, x) });
    }
  });
  const outer = Math.max(...points.map((p) => p.radius));
  const ring = points.filter((p) => outer - p.radius < FACE_TOLERANCE);
  return [...new Set(ring.map((p) => Math.round(p.angle / ANGLE_STEP)))];
}

describe('the shared wheel reads as a circle', () => {
  it.each(RINGS)('$piece strays from its true circle by at most $stray of its radius', ({ material, face, stray }) => {
    const sides = outerRingAngles(material, face).length;
    expect(sides).toBeGreaterThan(2);
    expect(1 - Math.cos(Math.PI / sides)).toBeLessThanOrEqual(stray);
  });
});
