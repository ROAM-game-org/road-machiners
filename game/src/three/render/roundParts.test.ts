import { describe, expect, it } from 'vitest';
import { Mesh, Vector3, type BufferGeometry, type Material, type Object3D } from 'three';
import { loadModels, model, type ModelName } from './models';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const ROUND_SIDES = 32;
const TIRE_SIDES = 48;
const TIRE_SHARE = 0.935;
const RING_TOLERANCE = 0.005;
const DENT_SLACK_DEGREES = 10;
const NEAR_AXIS = 0.01;
const WHEEL_AXIS = new Vector3(0, 0, 1);
const UPRIGHT = new Vector3(0, 1, 0);
const ALONG = new Vector3(1, 0, 0);

type Ring = { material: string; axis: Vector3; sides: number; radius?: [number, number]; dentSlack?: number };

function pointsOf(root: Object3D, material: string): Vector3[] {
  const points: Vector3[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const geometry = o.geometry as BufferGeometry;
    const materials = (Array.isArray(o.material) ? o.material : [o.material]) as Material[];
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: index ? index.count : position.count, materialIndex: 0 }];
    for (const group of groups) {
      if (materials[group.materialIndex ?? 0]?.name !== material) continue;
      for (let i = group.start; i < group.start + group.count; i++) {
        const vertex = index ? index.getX(i) : i;
        points.push(new Vector3().fromBufferAttribute(position, vertex).applyMatrix4(o.matrixWorld));
      }
    }
  });
  if (points.length === 0) throw new Error(`No ${material} vertices`);
  return points;
}

function radiusOf(point: Vector3, axis: Vector3): number {
  return point.clone().addScaledVector(axis, -point.dot(axis)).length();
}

function anglesAround(points: Vector3[], axis: Vector3): number[] {
  const u = new Vector3(axis.y, axis.z, axis.x);
  const v = axis.clone().cross(u);
  return points
    .filter((p) => radiusOf(p, axis) > NEAR_AXIS)
    .map((p) => (Math.atan2(p.dot(v), p.dot(u)) * 180) / Math.PI)
    .sort((a, b) => a - b);
}

function widestGap(angles: number[]): number {
  if (angles.length === 0) return 360;
  const gaps = angles.slice(1).map((a, i) => a - angles[i]);
  return Math.max(...gaps, angles[0] + 360 - angles[angles.length - 1]);
}

function ringGap(name: ModelName, ring: Ring): number {
  const points = pointsOf(model(name), ring.material).filter((p) => {
    if (!ring.radius) return true;
    const r = radiusOf(p, ring.axis);
    return r >= ring.radius[0] && r <= ring.radius[1];
  });
  return widestGap(anglesAround(points, ring.axis));
}

const RINGS: [ModelName, string, Ring][] = [
  ['wheel', 'tire', { material: 'wheel', axis: WHEEL_AXIS, sides: TIRE_SIDES, radius: [TIRE_SHARE - RING_TOLERANCE, TIRE_SHARE + RING_TOLERANCE] }],
  ['wheel', 'rim', { material: 'metal_light', axis: WHEEL_AXIS, sides: ROUND_SIDES }],
  ['wheel', 'hub', { material: 'rust', axis: WHEEL_AXIS, sides: ROUND_SIDES }],
  ['coilover', 'shock and eyes', { material: 'metal_dark', axis: UPRIGHT, sides: ROUND_SIDES }],
  ['coilover', 'rod', { material: 'metal_light', axis: UPRIGHT, sides: ROUND_SIDES }],
  ['coilover', 'spring seats', { material: 'metal', axis: UPRIGHT, sides: ROUND_SIDES }],
  ['coilover', 'coil', { material: 'paint', axis: UPRIGHT, sides: ROUND_SIDES }],
  ['axle', 'tube', { material: 'metal_dark', axis: UPRIGHT, sides: ROUND_SIDES, dentSlack: DENT_SLACK_DEGREES }],
  ['axle', 'differential', { material: 'rust_dark', axis: UPRIGHT, sides: ROUND_SIDES, dentSlack: DENT_SLACK_DEGREES }],
  ['axle', 'differential cover', { material: 'metal', axis: ALONG, sides: ROUND_SIDES }],
];

describe('round parts', () => {
  it.each(RINGS)('the %s %s has no facet wider than its round side count allows', (name, _piece, ring) => {
    expect(ringGap(name, ring)).toBeLessThanOrEqual(360 / ring.sides + (ring.dentSlack ?? 0.5));
  });
});
