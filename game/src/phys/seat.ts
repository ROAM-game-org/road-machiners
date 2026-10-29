import { PHYSICS } from '../data/physics';
import { couplingOf, rideOf, unitBody, type Body } from '../sim/body';
import { heightAt } from '../sim/terrain';
import type { UnitPose } from '../sim/rig';
import type { Vehicle, World } from '../sim/types';
import { wheelMounts } from './body';
import type { Quat, V3 } from './frames';

const S = PHYSICS.metersPerTile;
const REFINE_PASSES = 3;

export type Seat = { pos: V3; rot: Quat; forward: V3 };

type Basis = { x: V3; y: V3; z: V3 };

export function seatUnits(w: World, v: Vehicle, poses: UnitPose[]): Seat[] {
  const front = seatFront(w, v, poses[0]);
  if (poses.length === 1) return [front];
  return [front, seatRear(w, v, poses[1], front)];
}

function seatFront(w: World, v: Vehicle, pose: UnitPose): Seat {
  const b = unitBody(v.chassisId, 0);
  const origin = { x: pose.pos.x * S, y: 0, z: pose.pos.y * S };
  let basis = yawBasis(pose.heading);
  let at = origin;
  for (let pass = 0; pass < REFINE_PASSES; pass++) {
    const normal = groundNormal(w, b, 0, at, basis);
    basis = tiltedBasis(pose.heading, normal);
    at = { x: origin.x, y: groundMean(w, b, 0, at, basis) + rideOf(b) / normal.y, z: origin.z };
  }
  return seatOf(v, pose, at, basis);
}

function seatRear(w: World, v: Vehicle, pose: UnitPose, front: Seat): Seat {
  const coupling = couplingOf(v.chassisId);
  if (!coupling) throw new Error(`Rig ${v.chassisId} has no coupling`);
  const f = unitBody(v.chassisId, 0);
  const b = unitBody(v.chassisId, 1);
  const anchor = add(front.pos, rotate(basisOf(front.rot), { x: coupling.pivotFront, y: f.wheelY, z: 0 }));
  let basis = yawBasis(pose.heading);
  let at = { x: pose.pos.x * S, y: anchor.y, z: pose.pos.y * S };
  for (let pass = 0; pass < REFINE_PASSES; pass++) {
    basis = rearBasis(w, b, pose.heading, at, basis, anchor, coupling.pivotRear, f.wheelY);
    at = sub(anchor, rotate(basis, { x: coupling.pivotRear, y: f.wheelY, z: 0 }));
  }
  return seatOf(v, pose, at, basis);
}

function rearBasis(w: World, b: Body, heading: number, at: V3, basis: Basis, anchor: V3, pivotRear: number, low: number): Basis {
  const axle = groundUnder(w, add(at, rotate(basis, { x: -b.wheelX, y: 0, z: 0 })));
  const drop = axle.y - anchor.y;
  const dx = pivotRear + b.wheelX;
  const dy = low + rideOf(b);
  const reach = Math.hypot(dx, dy);
  const pitch = Math.asin(clampUnit(-drop / reach)) - Math.atan2(dy, dx);
  const pitched = pitchedBasis(heading, pitch);
  const left = groundUnder(w, add(at, rotate(pitched, { x: -b.wheelX, y: 0, z: -b.wheelZ }))).y;
  const right = groundUnder(w, add(at, rotate(pitched, { x: -b.wheelX, y: 0, z: b.wheelZ }))).y;
  return rolledBasis(pitched, -Math.atan2(right - left, 2 * b.wheelZ));
}

function seatOf(v: Vehicle, pose: UnitPose, at: V3, basis: Basis): Seat {
  const numbers = [at, basis.x, basis.y, basis.z].flatMap((p) => [p.x, p.y, p.z]);
  if (!numbers.every(Number.isFinite)) throw new Error(`Cannot seat ${v.id} unit ${pose.unit}: the ground under it gave a non-finite pose`);
  return { pos: at, rot: quatOf(basis), forward: basis.x };
}

function groundUnder(w: World, p: V3): V3 {
  return { x: p.x, y: heightAt(w.terrain, p.x / S, p.z / S) * S, z: p.z };
}

function contacts(w: World, b: Body, unit: number, at: V3, basis: Basis): V3[] {
  return wheelMounts(b, unit).map((m) => groundUnder(w, add(at, rotate(basis, { x: m.x, y: 0, z: m.z }))));
}

function groundMean(w: World, b: Body, unit: number, at: V3, basis: Basis): number {
  const points = contacts(w, b, unit, at, basis);
  return points.reduce((sum, p) => sum + p.y, 0) / points.length;
}

function groundNormal(w: World, b: Body, unit: number, at: V3, basis: Basis): V3 {
  const mounts = wheelMounts(b, unit);
  const points = contacts(w, b, unit, at, basis);
  const half = (pick: (m: V3) => boolean) => {
    const ys = points.filter((_, n) => pick(mounts[n])).map((p) => p.y);
    return ys.reduce((a, c) => a + c, 0) / ys.length;
  };
  const alongX = (half((m) => m.x > 0) - half((m) => m.x < 0)) / (2 * b.wheelX);
  const alongZ = (half((m) => m.z > 0) - half((m) => m.z < 0)) / (2 * b.wheelZ);
  const gradient = solveGradient(basis, alongX, alongZ);
  return unit3({ x: -gradient.x, y: 1, z: -gradient.z });
}

function solveGradient(basis: Basis, alongX: number, alongZ: number): V3 {
  const det = basis.x.x * basis.z.z - basis.x.z * basis.z.x;
  if (Math.abs(det) < 1e-9) throw new Error('Cannot seat a unit whose axes are parallel on the ground');
  return { x: (alongX * basis.z.z - alongZ * basis.x.z) / det, y: 0, z: (basis.x.x * alongZ - basis.z.x * alongX) / det };
}

function yawBasis(heading: number): Basis {
  return { x: { x: Math.cos(heading), y: 0, z: Math.sin(heading) }, y: { x: 0, y: 1, z: 0 }, z: { x: -Math.sin(heading), y: 0, z: Math.cos(heading) } };
}

function tiltedBasis(heading: number, up: V3): Basis {
  const flat = yawBasis(heading).x;
  const x = unit3(sub(flat, scale(up, dot(flat, up))));
  return { x, y: up, z: cross(x, up) };
}

function pitchedBasis(heading: number, pitch: number): Basis {
  const yaw = yawBasis(heading);
  const x = add(scale(yaw.x, Math.cos(pitch)), { x: 0, y: Math.sin(pitch), z: 0 });
  const y = add(scale(yaw.x, -Math.sin(pitch)), { x: 0, y: Math.cos(pitch), z: 0 });
  return { x, y, z: yaw.z };
}

function rolledBasis(b: Basis, roll: number): Basis {
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  return { x: b.x, y: add(scale(b.y, c), scale(b.z, s)), z: add(scale(b.z, c), scale(b.y, -s)) };
}

function rotate(b: Basis, p: V3): V3 {
  return add(scale(b.x, p.x), scale(b.y, p.y), scale(b.z, p.z));
}

function basisOf(q: Quat): Basis {
  const col = (v: V3): V3 => {
    const tx = 2 * (q.y * v.z - q.z * v.y);
    const ty = 2 * (q.z * v.x - q.x * v.z);
    const tz = 2 * (q.x * v.y - q.y * v.x);
    return { x: v.x + q.w * tx + (q.y * tz - q.z * ty), y: v.y + q.w * ty + (q.z * tx - q.x * tz), z: v.z + q.w * tz + (q.x * ty - q.y * tx) };
  };
  return { x: col({ x: 1, y: 0, z: 0 }), y: col({ x: 0, y: 1, z: 0 }), z: col({ x: 0, y: 0, z: 1 }) };
}

function quatOf(b: Basis): Quat {
  const m00 = b.x.x, m10 = b.x.y, m20 = b.x.z;
  const m01 = b.y.x, m11 = b.y.y, m21 = b.y.z;
  const m02 = b.z.x, m12 = b.z.y, m22 = b.z.z;
  const trace = m00 + m11 + m22;
  const q = quatByLargest(trace, m00, m11, m22, m01, m10, m02, m20, m12, m21);
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

function quatByLargest(trace: number, m00: number, m11: number, m22: number, m01: number, m10: number, m02: number, m20: number, m12: number, m21: number): Quat {
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    return { w: s / 4, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s };
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return { w: (m21 - m12) / s, x: s / 4, y: (m01 + m10) / s, z: (m02 + m20) / s };
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return { w: (m02 - m20) / s, x: (m01 + m10) / s, y: s / 4, z: (m12 + m21) / s };
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: s / 4 };
}

function clampUnit(x: number): number {
  return Math.max(-1, Math.min(1, x));
}

function add(...vs: V3[]): V3 {
  return vs.reduce((a, c) => ({ x: a.x + c.x, y: a.y + c.y, z: a.z + c.z }), { x: 0, y: 0, z: 0 });
}

function sub(a: V3, b: V3): V3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a: V3, k: number): V3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: V3, b: V3): V3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function unit3(a: V3): V3 {
  return scale(a, 1 / Math.hypot(a.x, a.y, a.z));
}
