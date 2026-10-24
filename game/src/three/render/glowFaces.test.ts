import { describe, expect, it } from 'vitest';
import { Mesh, type BufferGeometry, type Material } from 'three';
import { loadModels, model, NAMES, type ModelName } from './models';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const GLOWING = ['glass', 'light'];
const NORMAL_TOLERANCE = 0.0005;
const PLANE_TOLERANCE = 0.001;
const MAX_OVERLAP = 1e-4;

type Vec3 = [number, number, number];
type Face = { material: string; points: Vec3[]; normal: Vec3; offset: number };
type GlowPair = { glow: string; other: string; normal: Vec3; offset: number; area: number };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function facesOf(name: ModelName): Face[] {
  const faces: Face[] = [];
  const root = model(name);
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const geometry = (o.geometry as BufferGeometry).clone().applyMatrix4(o.matrixWorld);
    const material = ((Array.isArray(o.material) ? o.material[0] : o.material) as Material).name;
    const pos = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const count = index ? index.count : pos.count;
    const at = (i: number) => (index ? index.getX(i) : i);
    for (let t = 0; t < count; t += 3) {
      const points = [0, 1, 2].map((k): Vec3 => [pos.getX(at(t + k)), pos.getY(at(t + k)), pos.getZ(at(t + k))]);
      const n = cross(sub(points[1], points[0]), sub(points[2], points[0]));
      const len = Math.hypot(...n);
      if (len === 0) continue;
      const normal: Vec3 = [n[0] / len, n[1] / len, n[2] / len];
      faces.push({ material, points, normal, offset: dot(normal, points[0]) });
    }
  });
  return faces;
}

function planeBasis(normal: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = cross(normal, helper);
  const ulen = Math.hypot(...u);
  const unit: Vec3 = [u[0] / ulen, u[1] / ulen, u[2] / ulen];
  return [unit, cross(normal, unit)];
}

type Point2 = [number, number];

const area2 = (poly: Point2[]) => {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [a, b] = [poly[i], poly[(i + 1) % poly.length]];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
};

function clipToEdge(poly: Point2[], a: Point2, b: Point2): Point2[] {
  const side = (p: Point2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const out: Point2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [p, q] = [poly[i], poly[(i + 1) % poly.length]];
    const [sp, sq] = [side(p), side(q)];
    if (sp >= 0) out.push(p);
    if (sp >= 0 !== sq >= 0) out.push([p[0] + (sp / (sp - sq)) * (q[0] - p[0]), p[1] + (sp / (sp - sq)) * (q[1] - p[1])]);
  }
  return out;
}

function overlapArea(a: Face, b: Face): number {
  const [u, v] = planeBasis(a.normal);
  const flat = (f: Face): Point2[] => {
    const poly = f.points.map((p): Point2 => [dot(p, u), dot(p, v)]);
    return area2(poly) < 0 ? poly.reverse() : poly;
  };
  const clipper = flat(b);
  let poly = flat(a);
  for (let i = 0; i < clipper.length && poly.length > 2; i++) poly = clipToEdge(poly, clipper[i], clipper[(i + 1) % clipper.length]);
  return poly.length > 2 ? Math.abs(area2(poly)) : 0;
}

const sharesPlane = (a: Face, b: Face) =>
  Math.abs(a.normal[0] - b.normal[0]) < NORMAL_TOLERANCE &&
  Math.abs(a.normal[1] - b.normal[1]) < NORMAL_TOLERANCE &&
  Math.abs(a.normal[2] - b.normal[2]) < NORMAL_TOLERANCE &&
  Math.abs(a.offset - b.offset) < PLANE_TOLERANCE;

function glowPairs(name: ModelName): GlowPair[] {
  const faces = facesOf(name);
  const glowing = faces.filter((f) => GLOWING.includes(f.material));
  const pairs = new Map<string, GlowPair>();
  for (const glow of glowing) {
    for (const other of faces) {
      if (other.material === glow.material || !sharesPlane(glow, other)) continue;
      const area = overlapArea(glow, other);
      if (area === 0) continue;
      const key = `${glow.material}|${other.material}|${glow.normal.map((c) => c.toFixed(3))}|${glow.offset.toFixed(3)}`;
      const found = pairs.get(key);
      if (found) found.area += area;
      else pairs.set(key, { glow: glow.material, other: other.material, normal: glow.normal, offset: glow.offset, area });
    }
  }
  return [...pairs.values()].filter((p) => p.area > MAX_OVERLAP);
}

const describePair = (p: GlowPair) =>
  `${p.glow} on ${p.other}, normal ${p.normal.map((c) => c.toFixed(3)).join(',')}, offset ${p.offset.toFixed(3)}, ${(p.area * 1e4).toFixed(0)} cm2`;

const BASES = NAMES.filter((n) => n.startsWith('base_'));

describe('no glowing face of a truck base lies on a face of another material', () => {
  it.each(BASES)('%s', (name) => {
    expect(glowPairs(name).map(describePair)).toEqual([]);
  });

  it('still sees glass on the scout and lamps on the Niva', () => {
    expect(facesOf('base_scout').some((f) => f.material === 'glass')).toBe(true);
    expect(facesOf('base_niva').some((f) => f.material === 'light')).toBe(true);
  });
});
