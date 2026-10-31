import { chassisDef } from '../data/chassis';
import { PHYSICS } from '../data/physics';
import { cellCenter, couplingOf, frontBody, spanOf, unitOfCells, unitOfRow, unitsOf } from './body';
import type { Hulk, Pose, Vehicle, World } from './types';
import { angleDiff, bearing, dist, type Vec } from './vec';

const S = PHYSICS.metersPerTile;

export type Posed = Pick<Vehicle, 'chassisId' | 'pos' | 'heading' | 'bend'>;
export type UnitPose = { unit: number; pos: Vec; heading: number };
export type Local = { x: number; z: number };
export type RigBox = { center: Vec; axis: Vec; half: Vec };
export type Disc = { pos: Vec; r: number };

export function bendOf(v: Posed): number {
  const rig = couplingOf(v.chassisId) !== null;
  if (rig && v.bend === undefined) throw new Error(`Rig ${v.chassisId} has no bend`);
  if (!rig && v.bend !== undefined) throw new Error(`Rigid ${v.chassisId} has a bend`);
  return v.bend ?? 0;
}

export function bendLimit(chassisId: string): number {
  const coupling = couplingOf(chassisId);
  if (!coupling) throw new Error(`Chassis ${chassisId} has no coupling to bend`);
  return coupling.bendLimit;
}

export function checkBend(v: Posed): void {
  const bend = bendOf(v);
  const coupling = couplingOf(v.chassisId);
  if (coupling && !(Math.abs(bend) <= coupling.bendLimit + coupling.bendTolerance)) throw new Error(`Rig ${v.chassisId} bends ${bend.toFixed(3)}, past its limit ${coupling.bendLimit}`);
}

export function heldBend(chassisId: string, bend: number | undefined): number | undefined {
  const coupling = couplingOf(chassisId);
  if (!coupling || bend === undefined) return bend;
  return Math.max(-coupling.bendLimit, Math.min(coupling.bendLimit, bend));
}

export function restBend(chassisId: string): number | undefined {
  return couplingOf(chassisId) ? 0 : undefined;
}

export function straighten(v: Pick<Vehicle, 'chassisId' | 'bend'>): void {
  const bend = restBend(v.chassisId);
  if (bend === undefined) delete v.bend;
  else v.bend = bend;
}

export function unitPoses(v: Posed): UnitPose[] {
  const bend = bendOf(v);
  const all = unitsOf(v.chassisId);
  const front = { unit: 0, pos: { x: v.pos.x, y: v.pos.y }, heading: v.heading };
  if (all.length === 1) return [front];
  const rear = all[1];
  const pivot = along(front, (all[0].pivot ?? 0) / S);
  const heading = v.heading - bend;
  return [front, { unit: 1, pos: along({ unit: 1, pos: pivot, heading }, -(rear.pivot ?? 0) / S), heading }];
}

export function bendField(bend: number | undefined): { bend?: number } {
  return bend === undefined ? {} : { bend };
}

export function poseOf(v: Posed): Pose {
  return { x: v.pos.x, y: v.pos.y, heading: v.heading, ...bendField(v.bend) };
}

export function followPose(chassisId: string, prev: Pose, next: Pose): Pose {
  return prev.bend === undefined ? next : { ...next, bend: bendStep(chassisId, prev.bend, prev, next) };
}

export function trailUnits(chassisId: string, pose: Pose): UnitPose[] {
  return unitPoses({ chassisId, pos: { x: pose.x, y: pose.y }, heading: pose.heading, bend: pose.bend });
}

export function hitchPoint(chassisId: string, pose: Pose): Vec {
  const last = trailUnits(chassisId, pose).at(-1)!;
  const axle = unitsOf(chassisId)[last.unit].body.wheelX / S;
  return { x: last.pos.x - Math.cos(last.heading) * axle, y: last.pos.y - Math.sin(last.heading) * axle };
}

export function hitchAxle(chassisId: string): number {
  const all = unitsOf(chassisId);
  return all[all.length - 1].body.wheelX / S;
}

export function hitchOverhang(chassisId: string): number {
  const last = unitsOf(chassisId).at(-1)!.body;
  return (last.half.x - last.wheelX) / S;
}

export function noseOverhang(chassisId: string): number {
  const front = frontBody(chassisId);
  return (front.half.x - front.wheelX) / S;
}

export function frontAhead(chassisId: string): number {
  return -spanOf(chassisId).center / S;
}

export function rigMiddle(v: Posed): Vec {
  const ahead = frontAhead(v.chassisId);
  return { x: v.pos.x - Math.cos(v.heading) * ahead, y: v.pos.y - Math.sin(v.heading) * ahead };
}

export function tailReach(chassisId: string): number {
  const { center, half } = spanOf(chassisId);
  return (half.x - center) / S;
}

export function unitPose(v: Posed, unit: number): UnitPose {
  const pose = unitPoses(v)[unit];
  if (!pose) throw new Error(`Vehicle of ${v.chassisId} has no unit ${unit}`);
  return pose;
}

function along(p: UnitPose, tiles: number): Vec {
  return { x: p.pos.x + Math.cos(p.heading) * tiles, y: p.pos.y + Math.sin(p.heading) * tiles };
}

export function poseToWorld(p: UnitPose, local: Local): Vec {
  const x = local.x / S;
  const z = local.z / S;
  const c = Math.cos(p.heading);
  const s = Math.sin(p.heading);
  return { x: p.pos.x + c * x - s * z, y: p.pos.y + s * x + c * z };
}

export function worldToPose(p: UnitPose, at: Vec): Local {
  const dx = (at.x - p.pos.x) * S;
  const dy = (at.y - p.pos.y) * S;
  const c = Math.cos(p.heading);
  const s = Math.sin(p.heading);
  return { x: dx * c + dy * s, z: -dx * s + dy * c };
}

export function localToWorld(v: Posed, unit: number, local: Local): Vec {
  return poseToWorld(unitPose(v, unit), local);
}

export function worldToLocal(v: Posed, unit: number, at: Vec): Local {
  return worldToPose(unitPose(v, unit), at);
}

export function cellWorld(v: Posed, x: number, y: number): { unit: number; point: Vec; heading: number } {
  const at = cellCenter(v.chassisId, x, y);
  const pose = unitPose(v, at.unit);
  return { unit: at.unit, point: poseToWorld(pose, at), heading: pose.heading };
}

export function headingOfRow(v: Posed, y: number): number {
  return unitPose(v, unitOfRow(v.chassisId, y).index).heading;
}

export function headingOfCells(v: Posed, cells: readonly { y: number }[]): number {
  return unitPose(v, unitOfCells(v.chassisId, cells).index).heading;
}

export function nearestUnit(v: Posed, from: Vec): UnitPose {
  const poses = unitPoses(v);
  if (poses.length === 1) return poses[0];
  return poses.reduce((best, p) => (dist(p.pos, from) < dist(best.pos, from) ? p : best));
}

export function rigBoxes(v: Posed): RigBox[] {
  return unitPoses(v).map((p) => {
    const { half } = unitsOf(v.chassisId)[p.unit].body;
    return { center: { ...p.pos }, axis: { x: Math.cos(p.heading), y: Math.sin(p.heading) }, half: { x: half.x / S, y: half.z / S } };
  });
}

export function presentedSpan(v: Posed, from: Vec): number {
  const b = bearing(from, v.pos);
  const across = { x: -Math.sin(b), y: Math.cos(b) };
  const offsets = rigBoxes(v).flatMap(boxCorners).map((c) => (c.x - v.pos.x) * across.x + (c.y - v.pos.y) * across.y);
  return (Math.max(...offsets) - Math.min(...offsets)) * S;
}

export function reachMeters(chassisId: string): number {
  const all = unitsOf(chassisId);
  if (all.length === 1) return Math.hypot(all[0].body.half.x, all[0].body.half.z);
  const { center, half } = spanOf(chassisId);
  return Math.hypot(Math.abs(center) + half.x, half.z);
}

export function boxCorners(box: RigBox): Vec[] {
  const { center, axis, half } = box;
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => ({
    x: center.x + axis.x * half.x * a - axis.y * half.y * b,
    y: center.y + axis.y * half.x * a + axis.x * half.y * b,
  }));
}

export function rigDiscs(v: Posed): Disc[] {
  const r = chassisDef(v.chassisId).radius;
  if (unitsOf(v.chassisId).length === 1) return [{ pos: { x: v.pos.x, y: v.pos.y }, r }];
  return rigBoxes(v).flatMap((box) => {
    const n = Math.max(1, Math.ceil(box.half.x / r));
    const step = (2 * box.half.x) / n;
    const reach = Math.max(r, Math.hypot(box.half.y, step / 2));
    return Array.from({ length: n }, (_, i) => {
      const at = -box.half.x + step * (i + 0.5);
      return { pos: { x: box.center.x + box.axis.x * at, y: box.center.y + box.axis.y * at }, r: reach };
    });
  });
}

export function footprint(chassisId: string): number {
  const { center, half } = spanOf(chassisId);
  return Math.max(chassisDef(chassisId).radius, (Math.abs(center) + half.x) / S);
}

export function noseReach(chassisId: string): number {
  return frontBody(chassisId).half.x / S;
}

export function sideReach(chassisId: string): number {
  return spanOf(chassisId).half.z / S;
}

export function lengthOf(chassisId: string): number {
  return (2 * spanOf(chassisId).half.x) / S;
}

export function tractrix(lead: Vec, trail: Vec, length: number): Vec {
  const span = dist(trail, lead);
  if (span === 0) return trail;
  return { x: lead.x + ((trail.x - lead.x) / span) * length, y: lead.y + ((trail.y - lead.y) / span) * length };
}

export function bendStep(chassisId: string, bend: number, from: Pose, to: Pose): number {
  const coupling = couplingOf(chassisId);
  if (!coupling) throw new Error(`Chassis ${chassisId} has no coupling to bend`);
  const pivotFront = coupling.pivotFront / S;
  const reach = (coupling.pivotRear + coupling.rear.wheelX) / S;
  const pivotAt = (p: Pose) => ({ x: p.x + Math.cos(p.heading) * pivotFront, y: p.y + Math.sin(p.heading) * pivotFront });
  const before = pivotAt(from);
  const rearHeading = from.heading - bend;
  const axle = { x: before.x - Math.cos(rearHeading) * reach, y: before.y - Math.sin(rearHeading) * reach };
  const pivot = pivotAt(to);
  const next = tractrix(pivot, axle, reach);
  const turned = angleDiff(bearing(next, pivot), to.heading);
  return Math.max(-coupling.bendLimit, Math.min(coupling.bendLimit, turned));
}

export function checkRigs(world: Pick<World, 'vehicles' | 'obstacles'>): void {
  for (const v of world.vehicles) checkBend(v);
  for (const o of world.obstacles) if (o.kind !== 'landmark' && o.hulk) checkHulk(o.id, o.hulk);
}

function checkHulk(id: string, hulk: Hulk): void {
  if ((couplingOf(hulk.chassisId) !== null) === (hulk.bend !== undefined)) return;
  throw new Error(`Hulk ${id} of ${hulk.chassisId} ${hulk.bend === undefined ? 'has no bend' : 'has a bend but is no rig'}`);
}
