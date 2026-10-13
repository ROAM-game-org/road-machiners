
import { PHYSICS } from "../data/physics";
import { heightAt, type Terrain } from "../sim/terrain";
import type { Vec } from "../sim/vec";

export type V3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };
export type WheelFrame = { steer: number; spin: number; suspension: number; ground: boolean };
export type VehicleFrame = { pos: V3; rot: Quat; acc: V3; wheels: WheelFrame[] };
export type TurnFrames = Record<string, VehicleFrame[]>;

export function computeRoundPoint(a: V3, b: V3, offset: number): V3 {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (!(len > 0)) throw new Error("Shot from its own target point");
  return { x: b.x - (dz / len) * offset, y: b.y, z: b.z + (dx / len) * offset };
}

const S = PHYSICS.metersPerTile;

export function toPhys(p: Vec, height: number): V3 {
  return { x: p.x * S, y: height * S, z: p.y * S };
}

export function toMap(p: V3): Vec {
  return { x: p.x / S, y: p.z / S };
}

export type Circle = { x: number; z: number; r: number };

export function toPhysCircle(p: Vec, r: number): Circle {
  return { x: p.x * S, z: p.y * S, r: r * S };
}

export function groundPoint(t: Terrain, p: Vec): V3 {
  return toPhys(p, heightAt(t, p.x, p.y));
}

export function headingQuat(heading: number): Quat {
  return { x: 0, y: Math.sin(-heading / 2), z: 0, w: Math.cos(-heading / 2) };
}

export function rotateBy(q: Quat, v: V3): V3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

export function noseRise(q: Quat): number {
  return 2 * (q.x * q.y + q.w * q.z);
}

export function upOf(q: Quat): number {
  return 1 - 2 * (q.x * q.x + q.z * q.z);
}

export function headingOf(q: Quat): number {
  const fx = 1 - 2 * (q.y * q.y + q.z * q.z);
  const fz = 2 * (q.x * q.z - q.w * q.y);
  return Math.atan2(fz, fx);
}

export function frameAt(frames: readonly VehicleFrame[] | undefined, at: number): VehicleFrame | undefined {
  if (!frames) return undefined;
  const i = Math.floor(at);
  const a = frames[i];
  const b = frames[i + 1];
  if (!a || !b) return a;
  return blendFrames(a, b, at - i);
}

export function blendFrames(a: VehicleFrame, b: VehicleFrame, t: number): VehicleFrame {
  if (!(t >= 0 && t <= 1)) throw new Error(`Frame blend share must be in 0..1, got ${t}`);
  if (a.wheels.length !== b.wheels.length) throw new Error(`Frames disagree on wheel count: ${a.wheels.length} and ${b.wheels.length}`);
  return {
    pos: lerpV3(a.pos, b.pos, t),
    rot: nlerpQuat(a.rot, b.rot, t),
    acc: lerpV3(a.acc, b.acc, t),
    wheels: a.wheels.map((w, i) => blendWheels(w, b.wheels[i], t)),
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpV3(a: V3, b: V3, t: number): V3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

function nlerpQuat(a: Quat, b: Quat, t: number): Quat {
  const sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
  const x = lerp(a.x, b.x * sign, t);
  const y = lerp(a.y, b.y * sign, t);
  const z = lerp(a.z, b.z * sign, t);
  const w = lerp(a.w, b.w * sign, t);
  const len = Math.hypot(x, y, z, w);
  return { x: x / len, y: y / len, z: z / len, w: w / len };
}

function blendWheels(a: WheelFrame, b: WheelFrame, t: number): WheelFrame {
  return {
    steer: lerp(a.steer, b.steer, t),
    spin: lerp(a.spin, b.spin, t),
    suspension: lerp(a.suspension, b.suspension, t),
    ground: t < 0.5 ? a.ground : b.ground,
  };
}
