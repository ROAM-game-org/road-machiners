import { describe, expect, it } from 'vitest';
import { Mesh, type BufferGeometry, type Material } from 'three';
import { loadModels, model, NAMES, type ModelName } from './models';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const TIRE_SIDES = 48;
const RIM_SIDES = 32;
const HUB_SIDES = 16;
const TIRE_SHARE = 0.935;
const RIM_SHARE = 0.55;
const HUB_SHARE = 0.22;
const SHARE_SLACK = 0.05;
const ROUND_SLACK = 0.01;
const MIN_SIDES = 5;
const KEY = 1e4;

type Circle = { material: string; axis: number; plane: number; center: [number, number]; radius: number; sides: number };

const keyOf = (v: number) => Math.round(v * KEY);

function capCircles(geometry: BufferGeometry, material: string): Circle[] {
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const count = index ? index.count : pos.count;
  const at = (i: number) => (index ? index.getX(i) : i);
  const caps = new Map<string, number[][]>();
  for (let t = 0; t < count; t += 3) {
    const p = [0, 1, 2].map((k) => [pos.getX(at(t + k)), pos.getY(at(t + k)), pos.getZ(at(t + k))]);
    const u = p[1].map((v, k) => v - p[0][k]);
    const w = p[2].map((v, k) => v - p[0][k]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const len = Math.hypot(...n);
    if (len === 0) continue;
    const axis = n.findIndex((c) => Math.abs(c) / len > 0.999);
    if (axis < 0) continue;
    const plane = `${axis}:${keyOf(p[0][axis])}`;
    caps.set(plane, [...(caps.get(plane) ?? []), ...p]);
  }
  const out: Circle[] = [];
  for (const [plane, points] of caps) {
    const axis = Number(plane.split(':')[0]);
    const flat = points.map((p) => p.filter((_, k) => k !== axis) as [number, number]);
    for (const group of connected(flat)) out.push(...circleOf(group, material, axis, points[0][axis]));
  }
  return out;
}

function connected(points: [number, number][]): [number, number][][] {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    const p = parent.get(k) ?? k;
    if (p === k) return k;
    const root = find(p);
    parent.set(k, root);
    return root;
  };
  const keys = points.map(([a, b]) => `${keyOf(a)},${keyOf(b)}`);
  for (let t = 0; t < keys.length; t += 3) {
    for (const k of keys.slice(t + 1, t + 3)) parent.set(find(k), find(keys[t]));
  }
  const groups = new Map<string, Map<string, [number, number]>>();
  keys.forEach((k, i) => {
    const root = find(k);
    const group = groups.get(root) ?? new Map<string, [number, number]>();
    group.set(k, points[i]);
    groups.set(root, group);
  });
  return [...groups.values()].map((g) => [...g.values()]);
}

function circleOf(points: [number, number][], material: string, axis: number, plane: number): Circle[] {
  if (points.length < MIN_SIDES) return [];
  const center: [number, number] = [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
  const radii = points.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1]));
  const radius = Math.max(...radii);
  if (radius - Math.min(...radii) > ROUND_SLACK * radius) return [];
  return [{ material, axis, plane, center, radius, sides: points.length }];
}

function circlesOf(name: ModelName): Circle[] {
  const out: Circle[] = [];
  const root = model(name);
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const geometry = (o.geometry as BufferGeometry).clone().applyMatrix4(o.matrixWorld);
    const material = (Array.isArray(o.material) ? o.material[0] : o.material) as Material;
    out.push(...capCircles(geometry, material.name));
  });
  return out;
}

type DrawnWheel = { tire: Circle; rim?: Circle; hub?: Circle };

function wheelsOf(name: ModelName): DrawnWheel[] {
  const circles = circlesOf(name);
  const near = (a: Circle, b: Circle, share: number) =>
    a.axis === b.axis && Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) < 0.01 && Math.abs(b.radius / a.radius - share / TIRE_SHARE) < SHARE_SLACK;
  return circles
    .filter((c) => c.material === 'wheel')
    .map((tire) => ({
      tire,
      rim: circles.find((c) => c.material === 'metal_light' && near(tire, c, RIM_SHARE)),
      hub: circles.find((c) => c.material === 'rust' && near(tire, c, HUB_SHARE)),
    }));
}

const DRAWN = NAMES.filter((n) => n === 'wheel' || n.startsWith('base_'));
const MUST_DRAW: readonly ModelName[] = ['wheel', 'base_semi', 'base_semi_rear', 'base_sorokonoga', 'base_sorokonoga_rear', 'base_wagon'];

describe('every wheel drawn on a truck is round', () => {
  it.each(DRAWN)('%s', (name) => {
    const wheels = wheelsOf(name);
    if (MUST_DRAW.includes(name)) expect(wheels.length).toBeGreaterThan(0);
    const faults = wheels.flatMap(({ tire, rim, hub }) => {
      const at = `tire at ${tire.center.map((v) => v.toFixed(2)).join(',')}`;
      return [
        tire.sides < TIRE_SIDES ? `${at} has ${tire.sides} sides` : null,
        !rim ? `${at} has no round rim` : rim.sides < RIM_SIDES ? `${at} rim has ${rim.sides} sides` : null,
        !hub ? `${at} has no round hub` : hub.sides < HUB_SIDES ? `${at} hub has ${hub.sides} sides` : null,
      ].filter((f): f is string => f !== null);
    });
    expect(faults).toEqual([]);
  });
});
