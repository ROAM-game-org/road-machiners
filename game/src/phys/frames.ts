
import RAPIER from "@dimforge/rapier3d-compat";
import { PHYSICS } from "../data/physics";
import { CRATER } from "../data/rules";
import { craterRimPoints } from "../sim/craters";
import { playerVehicle } from "../sim/damage";
import { LIVE_REACH } from "../sim/fidelity";
import { rideOf, unitBody, unitsOf } from "../sim/body";
import { unitPoses, type UnitPose } from "../sim/rig";
import { propBase } from "../sim/bridge";
import { propPose, RAMP_MODELS, rampSpan } from "../sim/mapgen";
import { groundAt, heightAt, type Terrain } from "../sim/terrain";
import type { Crater, Obstacle, Pose, Vehicle, World } from "../sim/types";
import { angleDiff, type Vec } from "../sim/vec";
import { wheelMounts } from "./body";

export type V3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };
export type WheelFrame = { steer: number; spin: number; suspension: number; ground: boolean };
export type UnitFrame = { pos: V3; rot: Quat; wheels: WheelFrame[] };
export type VehicleFrame = { pos: V3; rot: Quat; acc: V3; wheels: WheelFrame[]; rear?: UnitFrame };
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

export function frameAt(frames: readonly VehicleFrame[] | undefined, at: number, start?: VehicleFrame): VehicleFrame | undefined {
  if (!frames) return undefined;
  if (at < 0) return startBlend(frames[0], at + 1, start);
  const i = Math.floor(at);
  const a = frames[i];
  const b = frames[i + 1];
  if (!a || !b) return a;
  return blendFrames(a, b, at - i);
}

function startBlend(first: VehicleFrame | undefined, t: number, start: VehicleFrame | undefined): VehicleFrame | undefined {
  return start && first ? blendFrames(start, first, t) : first;
}

export function blendFrames(a: VehicleFrame, b: VehicleFrame, t: number): VehicleFrame {
  if (!(t >= 0 && t <= 1)) throw new Error(`Frame blend share must be in 0..1, got ${t}`);
  if (a.wheels.length !== b.wheels.length) throw new Error(`Frames disagree on wheel count: ${a.wheels.length} and ${b.wheels.length}`);
  const blended: VehicleFrame = {
    pos: lerpV3(a.pos, b.pos, t),
    rot: nlerpQuat(a.rot, b.rot, t),
    acc: lerpV3(a.acc, b.acc, t),
    wheels: a.wheels.map((w, i) => blendWheels(w, b.wheels[i], t)),
  };
  return blendRears(blended, a.rear, b.rear, t);
}

function blendRears(blended: VehicleFrame, a: UnitFrame | undefined, b: UnitFrame | undefined, t: number): VehicleFrame {
  if ((a === undefined) !== (b === undefined)) throw new Error('Frames disagree on a rear unit');
  if (a && b) blended.rear = blendUnits(a, b, t);
  return blended;
}

function blendUnits(a: UnitFrame, b: UnitFrame, t: number): UnitFrame {
  if (a.wheels.length !== b.wheels.length) throw new Error(`Rear frames disagree on wheel count: ${a.wheels.length} and ${b.wheels.length}`);
  return { pos: lerpV3(a.pos, b.pos, t), rot: nlerpQuat(a.rot, b.rot, t), wheels: a.wheels.map((w, i) => blendWheels(w, b.wheels[i], t)) };
}

const MOVED_BY_RULES = 0.5;

export function staleFrame(kept: VehicleFrame | undefined, v: Vehicle, playing: boolean): boolean {
  if (!kept) return false;
  if (Boolean(kept.rear) !== unitsOf(v.chassisId).length > 1) return true;
  return !playing && Math.hypot(kept.pos.x / S - v.pos.x, kept.pos.z / S - v.pos.y) > MOVED_BY_RULES;
}

export function framePoints(f: VehicleFrame): V3[] {
  return f.rear ? [f.pos, f.rear.pos] : [f.pos];
}

export function frameBend(f: VehicleFrame): number | undefined {
  if (!f.rear) return undefined;
  return angleDiff(headingOf(f.rear.rot), headingOf(f.rot));
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

export const TURN_STEPS = Math.round(PHYSICS.turnSeconds * PHYSICS.stepsPerSecond);
const T = PHYSICS.truck;
const ROLL_SIGN = 1;

export type UnitWheels = { front: WheelFrame[]; rear: WheelFrame[] | null };
type Roll = { mounts: { x: number; z: number }[]; radius: number; spin: number[]; prev: Vec[] };

export function restFrame(w: World, v: Vehicle): VehicleFrame {
  const poses = unitPoses(v);
  const wheels = restWheels(v.chassisId);
  const frame: VehicleFrame = { pos: posePoint(w, v, poses[0]), rot: headingQuat(v.heading), acc: { x: 0, y: 0, z: 0 }, wheels: wheels.front };
  if (poses[1] && wheels.rear) frame.rear = { pos: posePoint(w, v, poses[1]), rot: headingQuat(poses[1].heading), wheels: wheels.rear };
  return frame;
}

function posePoint(w: World, v: Vehicle, pose: UnitPose): V3 {
  return { x: pose.pos.x * S, y: rideHeightAt(w, v, pose), z: pose.pos.y * S };
}

function restUnitWheels(chassisId: string, unit: number): WheelFrame[] {
  return wheelMounts(unitBody(chassisId, unit), unit).map(() => ({ steer: 0, spin: 0, suspension: T.suspensionRest, ground: true }));
}

export function restWheels(chassisId: string): UnitWheels {
  return { front: restUnitWheels(chassisId, 0), rear: unitsOf(chassisId).length > 1 ? restUnitWheels(chassisId, 1) : null };
}

export function frameWheels(f: VehicleFrame): UnitWheels {
  return { front: f.wheels, rear: f.rear?.wheels ?? null };
}

export function restFrames(w: World, v: Vehicle): VehicleFrame[] {
  return Array.from({ length: TURN_STEPS }, () => restFrame(w, v));
}

export function trailFrames(w: World, v: Vehicle, start: UnitWheels): VehicleFrame[] {
  const last = v.trail.length - 1;
  if (last < 1) throw new Error(`Vehicle ${v.id} has no trail to frame`);
  const rolls = startRolls(v, start);
  const frames: VehicleFrame[] = [];
  for (let i = 1; i <= TURN_STEPS; i++) frames.push(rollFrame(w, v, trailPoseAt(v.trail, (i / TURN_STEPS) * last), rolls));
  return frames;
}

function startRolls(v: Vehicle, start: UnitWheels): Roll[] {
  const starts = [start.front, start.rear];
  const first = posesOf(v.chassisId, v.trail[0]);
  return unitsOf(v.chassisId).map((u) => {
    const mounts = wheelMounts(u.body, u.index);
    const begin = starts[u.index] ?? [];
    if (begin.length !== mounts.length) throw new Error(`Vehicle ${v.id} starts unit ${u.index} with ${begin.length} wheels, not ${mounts.length}`);
    return { mounts, radius: u.body.wheelRadius, spin: begin.map((wheel) => wheel.spin), prev: mounts.map((m) => mountPoint(first[u.index], m)) };
  });
}

function posesOf(chassisId: string, p: Pose): UnitPose[] {
  return unitPoses({ chassisId, pos: { x: p.x, y: p.y }, heading: p.heading, bend: p.bend });
}

function trailPoseAt(trail: readonly Pose[], t: number): Pose {
  const k = Math.min(Math.floor(t), trail.length - 2);
  const f = t - k;
  const a = trail[k];
  const c = trail[k + 1];
  const pose: Pose = { x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f, heading: a.heading + angleDiff(a.heading, c.heading) * f };
  if (a.bend !== undefined && c.bend !== undefined) pose.bend = a.bend + (c.bend - a.bend) * f;
  return pose;
}

function rollFrame(w: World, v: Vehicle, pose: Pose, rolls: Roll[]): VehicleFrame {
  const posed = posesOf(v.chassisId, pose);
  const frame = restFrame(w, { ...v, pos: { x: pose.x, y: pose.y }, heading: pose.heading, bend: pose.bend });
  const rolled = rolls.map((roll, unit) => rollWheels(roll, posed[unit]));
  frame.wheels = rolled[0];
  if (frame.rear) frame.rear.wheels = rolled[1];
  return frame;
}

function rollWheels(roll: Roll, pose: UnitPose): WheelFrame[] {
  const at = roll.mounts.map((m) => mountPoint(pose, m));
  const wheels = at.map((p, n) => {
    roll.spin[n] += (((p.x - roll.prev[n].x) * Math.cos(pose.heading) + (p.y - roll.prev[n].y) * Math.sin(pose.heading)) * S * ROLL_SIGN) / roll.radius;
    return { steer: 0, spin: roll.spin[n], suspension: T.suspensionRest, ground: true };
  });
  roll.prev = at;
  return wheels;
}

function mountPoint(p: UnitPose, m: { x: number; z: number }): Vec {
  const x = m.x / S;
  const z = m.z / S;
  return { x: p.pos.x + Math.cos(p.heading) * x - Math.sin(p.heading) * z, y: p.pos.y + Math.sin(p.heading) * x + Math.cos(p.heading) * z };
}

export function rideHeightAt(w: World, v: Pick<Vehicle, 'chassisId'>, pose: UnitPose): number {
  const b = unitBody(v.chassisId, pose.unit);
  return heightAt(w.terrain, pose.pos.x, pose.pos.y) * S + rideOf(b);
}

export type GroundPatch = { handle: number; x0: number; z0: number };

export const LIVE_RANGE = LIVE_REACH + PHYSICS.propLiveMargin;

const PATCH_HALF = Math.ceil(LIVE_RANGE + PHYSICS.groundPatchSlack);
const PATCH_SHIFT = PHYSICS.groundPatchSlack / 2;

function patchOrigin(n: number, center: Vec): { x0: number; z0: number } {
  const side = Math.min(n, 2 * PATCH_HALF);
  const at = (c: number) => Math.min(Math.max(0, Math.round(c) - PATCH_HALF), n - side);
  return { x0: at(center.x), z0: at(center.y) };
}

export function addGround(world: RAPIER.World, t: Terrain, center: Vec): GroundPatch {
  const n = t.size;
  const m = Math.min(n, 2 * PATCH_HALF);
  const { x0, z0 } = patchOrigin(n, center);
  const heights = new Float32Array((m + 1) * (m + 1));
  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= m; j++) heights[i * (m + 1) + j] = t.heights[(z0 + j) * (n + 1) + x0 + i];
  }
  const size = m * S;
  const field = RAPIER.ColliderDesc.heightfield(m, m, heights, { x: size, y: S, z: size }).setTranslation((x0 + m / 2) * S, 0, (z0 + m / 2) * S);
  return { handle: world.createCollider(field).handle, x0, z0 };
}

export function movedGround(world: RAPIER.World, patch: GroundPatch, w: World): GroundPatch {
  const center = playerVehicle(w).pos;
  const want = patchOrigin(w.terrain.size, center);
  if (Math.abs(want.x0 - patch.x0) <= PATCH_SHIFT && Math.abs(want.z0 - patch.z0) <= PATCH_SHIFT) return patch;
  world.removeCollider(world.getCollider(patch.handle), true);
  return addGround(world, w.terrain, center);
}

export function craterColliders(t: Terrain, c: Crater): RAPIER.ColliderDesc[] {
  const rim = craterRimPoints(c).map((p) => toPhys(p, groundAt(t, p.x, p.y)));
  const radius = (CRATER.rimWidthRatio * c.radius) / 2;
  const lift = CRATER.rimRatio * c.radius - radius;
  return rim.map((a, k) => capsuleBetween(a, rim[(k + 1) % rim.length], radius, lift));
}

function capsuleBetween(a: V3, b: V3, radius: number, lift: number): RAPIER.ColliderDesc {
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len = Math.hypot(u.x, u.y, u.z);
  if (!(len > 0)) throw new Error("Capsule between one point");
  const desc = RAPIER.ColliderDesc.capsule(len / 2, radius).setTranslation((a.x + b.x) / 2, (a.y + b.y) / 2 + lift, (a.z + b.z) / 2);
  return desc.setRotation(upOnto({ x: u.x / len, y: u.y / len, z: u.z / len }));
}

function upOnto(u: V3): Quat {
  const w = 1 + u.y;
  const n = Math.hypot(u.z, u.x, w);
  return { x: u.z / n, y: 0, z: -u.x / n, w: w / n };
}

const BRIDGE = PHYSICS.bridge;
const EDGE_DROP = 0.1;
const SKIRT_SAMPLES_PER_TILE = 1;

export type RampParts = { plates: RAPIER.ColliderDesc[]; walls: RAPIER.ColliderDesc[] };

type RampFrame = { origin: V3; cos: number; sin: number };
type Section = { x: number; z: number };

export function rampParts(t: Terrain, o: Obstacle): RampParts | null {
  if (o.kind !== "landmark") return null;
  const pose = propPose(o);
  const model = RAMP_MODELS[pose.model];
  if (model === undefined) return null;
  const scale = pose.scale.x;
  const base = propBase(t, o) * S;
  const frame: RampFrame = { origin: { x: pose.pos.x * S, y: base, z: pose.pos.y * S }, cos: Math.cos(pose.yaw), sin: Math.sin(pose.yaw) };
  const { toe, tip, slope, half, underside, closedTo } = rampSpan(model, scale);
  const surface = (x: number) => tip.z + (x - tip.x) * slope;
  const down = (s: Section): Section => ({ x: s.x + Math.sin(model.pitch) * BRIDGE.deckThickness, z: s.z - Math.cos(model.pitch) * BRIDGE.deckThickness });
  const deepest = lowestGround(t, frame, toe.x, closedTo, half, base);
  const edgeTop = (x: number) => surface(x) - EDGE_DROP;
  const skirts = [-1, 1].map((side) => rampPrism(frame, [{ x: toe.x, z: deepest }, { x: closedTo, z: deepest }, { x: closedTo, z: edgeTop(closedTo) }, { x: toe.x, z: edgeTop(toe.x) }], side > 0 ? half - BRIDGE.railThickness : -half, side > 0 ? half : -half + BRIDGE.railThickness));
  const wallTop = surface(closedTo) - underside;
  const wall = rampPrism(frame, [{ x: closedTo - BRIDGE.railThickness, z: deepest }, { x: closedTo, z: deepest }, { x: closedTo, z: wallTop }, { x: closedTo - BRIDGE.railThickness, z: wallTop }], -half, half);
  return { plates: [rampPrism(frame, [toe, tip, down(tip), down(toe)], -half, half)], walls: [...skirts, wall] };
}

function lowestGround(t: Terrain, frame: RampFrame, from: number, to: number, half: number, base: number): number {
  const steps = Math.max(1, Math.ceil(((to - from) / S) * SKIRT_SAMPLES_PER_TILE));
  let low = 0;
  for (let k = 0; k <= steps; k++) {
    for (const side of [-1, 1]) {
      const x = from + ((to - from) * k) / steps;
      const p = { x: (frame.origin.x + x * frame.cos + side * half * frame.sin) / S, y: (frame.origin.z + x * frame.sin - side * half * frame.cos) / S };
      low = Math.min(low, groundAt(t, p.x, p.y) * S - base);
    }
  }
  return low - PHYSICS.rockSink;
}

function rampPrism(frame: RampFrame, section: Section[], across0: number, across1: number): RAPIER.ColliderDesc {
  const points = section.flatMap((s) => [across0, across1].flatMap((y) => [
    frame.origin.x + s.x * frame.cos + y * frame.sin,
    frame.origin.y + s.z,
    frame.origin.z + s.x * frame.sin - y * frame.cos,
  ]));
  const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(points));
  if (desc === null) throw new Error("A ramp prop piece has no volume");
  return desc;
}
