import * as THREE from 'three';
import { TRUCK_LOOK } from '../../render/partLooks';
import { CLIP_TOLERANCE } from '../../sim/body';
import type { SideLetter } from '../../sim/grid';
import { cutHeightAt, STEEPEST_LEAN, TOP_MARGIN, type TopCut } from './armorTop';
import { bodyFace, FACE_COLUMN, type FaceProfile } from './gunStand';

export type Placement = { pos: THREE.Vector3; yaw: number; lean: number; scale: THREE.Vector3 };

export function armorMatrix(at: Placement): THREE.Matrix4 {
  return new THREE.Matrix4().compose(at.pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, at.yaw, at.lean)), at.scale);
}

export function poseArmor(obj: THREE.Object3D, at: Placement): void {
  obj.position.copy(at.pos);
  obj.rotation.set(0, at.yaw, at.lean);
  obj.scale.copy(at.scale);
}

export const SIDE_FACE: Record<SideLetter, { axis: 'x' | 'z'; outward: 1 | -1 }> = {
  F: { axis: 'x', outward: 1 },
  B: { axis: 'x', outward: -1 },
  R: { axis: 'z', outward: 1 },
  L: { axis: 'z', outward: -1 },
};

export function placedBounds(at: Placement, box: THREE.Box3): THREE.Box3 {
  return box.clone().applyMatrix4(armorMatrix(at));
}

export function fitToBody(at: Placement, box: THREE.Box3, cut: TopCut, side: SideLetter): void {
  if (at.lean === 0) growToCut(at, box, cut, side);
}

export function fitRamToBumper(at: Placement, box: THREE.Box3, body: THREE.Object3D, side: SideLetter, hubY: number): void {
  if (SIDE_FACE[side].axis !== 'x') throw new Error(`Ram on side ${side}: rams mount only on the front and back`);
  const placed = placedBounds(at, box);
  const underside = new THREE.Box3().setFromObject(body).min.y;
  const bottom = Math.max(underside, hubY - (placed.max.y - placed.min.y) / 2);
  at.pos.y += bottom - placed.min.y;
  pullToBody(at, box, body, side);
}

function cutAlong(placed: THREE.Box3, cut: TopCut, side: SideLetter): number[] {
  const mid = placed.getCenter(new THREE.Vector3());
  if (SIDE_FACE[side].axis === 'z') return [placed.min.x, mid.x, placed.max.x].map((x) => cutHeightAt(cut, x, mid.z));
  return [placed.min.z, mid.z, placed.max.z].map((z) => cutHeightAt(cut, mid.x, z));
}

function pullToBody(at: Placement, box: THREE.Box3, body: THREE.Object3D, side: SideLetter): void {
  const { axis, outward } = SIDE_FACE[side];
  const across = axis === 'x' ? 'z' : 'x';
  const placed = placedBounds(at, box);
  const face = bodyFace(body, axis, outward, [placed.min[across], placed.max[across]], [placed.min.y, placed.max.y]);
  if (face === null) throw new Error(`Ram on side ${side} finds no body face at its height to sit against`);
  const gap = outward * ((outward > 0 ? placed.min[axis] : placed.max[axis]) - face);
  if (gap > 0) at.pos[axis] -= outward * gap;
}

function growToCut(at: Placement, box: THREE.Box3, cut: TopCut, side: SideLetter): void {
  if (SIDE_FACE[side].axis !== 'z') return;
  const placed = placedBounds(at, box);
  const target = Math.max(...cutAlong(placed, cut, side));
  if (!(target > placed.max.y + TOP_MARGIN)) return;
  const k = (target - placed.min.y) / (placed.max.y - placed.min.y);
  at.scale.y *= k;
  at.pos.y = placed.min.y + (at.pos.y - placed.min.y) * k;
}

const HULL_SHARE = 0.5;

export type Slope = { lean: number; foot: number };

type Row = { y: number; reach: number };

export function hullSlope(profile: FaceProfile, bottom: number, height: number): Slope | null {
  const rows = profileRows(profile, bottom, bottom + height);
  if (rows.length === 0) return null;
  const widest = Math.max(...rows.map((r) => r.reach));
  const touch = rows.find((r) => r.reach === widest) as Row;
  const above = hullAbove(profile, touch.y, height);
  if (above.length * FACE_COLUMN < height * HULL_SHARE) return null;
  if ((above.at(-1) as Row).y < bottom + height - TRUCK_LOOK.armorRise - FACE_COLUMN) return null;
  const lean = Math.min(...above.map((r) => Math.atan2(touch.reach - r.reach, r.y - touch.y)));
  if (lean > STEEPEST_LEAN || height * Math.sin(lean) <= CLIP_TOLERANCE) return null;
  return { lean, foot: touch.y - FACE_COLUMN / 2 };
}

function hullAbove(profile: FaceProfile, from: number, height: number): Row[] {
  const above: Row[] = [];
  for (let row = rowAt(profile, from) + 1; row < profile.reach.length; row++) {
    const reach = profile.reach[row];
    const y = rowMiddle(profile, row);
    if (reach === null || y > from + height) break;
    above.push({ y, reach });
  }
  return above;
}

function rowAt(profile: FaceProfile, y: number): number {
  return Math.round((y - profile.bottom) / FACE_COLUMN - 0.5);
}

function rowMiddle(profile: FaceProfile, row: number): number {
  return profile.bottom + (row + 0.5) * FACE_COLUMN;
}

function profileRows(profile: FaceProfile, bottom: number, top: number): Row[] {
  return profile.reach.flatMap((reach, row) => {
    const y = rowMiddle(profile, row);
    return reach !== null && y >= bottom && y <= top ? [{ y, reach }] : [];
  });
}

export type Settle = { body: THREE.Object3D; profile: FaceProfile; axis: 'x' | 'z'; row: number; upright: () => void; fail: () => never };

export function settleOnBody(at: Placement, box: THREE.Box3, { body, profile, axis, row, upright, fail }: Settle): void {
  const placed = placedBounds(at, box);
  const slope = hullSlope(profile, placed.min.y, placed.max.y - placed.min.y);
  if (slope) return leanOnto(at, box, profile, slope, axis, fail);
  const foot = ledgeTop(profile, placed.min.y, placed.max.y, row);
  if (foot === null) return upright();
  standOnLedge(at, box, body, axis, profile.outward, foot, fail);
}

function ledgeTop(profile: FaceProfile, bottom: number, top: number, row: number): number | null {
  const rows = profileRows(profile, bottom, top);
  const faces = facesOf(rows);
  if (faces.length < 2) return null;
  const main = faces.reduce((most, face) => (face.length > most.length ? face : most));
  if (main === faces[0]) return null;
  const mainFace = Math.max(...main.map((r) => r.reach));
  if ((faces[0][0] as Row).reach - mainFace > row) return null;
  const lowest = Math.min(...main.map((r) => r.y));
  const proud = rows.filter((r) => r.reach > mainFace + CLIP_TOLERANCE);
  if (proud.some((r) => r.y > lowest)) return null;
  return Math.max(...proud.map((r) => r.y)) + FACE_COLUMN / 2;
}

function facesOf(rows: Row[]): Row[][] {
  const faces: Row[][] = [];
  for (const row of [...rows].sort((a, b) => b.reach - a.reach)) {
    const last = faces.at(-1);
    if (last && (last.at(-1) as Row).reach - row.reach <= FACE_COLUMN) last.push(row);
    else faces.push([row]);
  }
  return faces;
}

function standOnLedge(at: Placement, box: THREE.Box3, body: THREE.Object3D, axis: 'x' | 'z', outward: number, foot: number, fail: () => never): void {
  const placed = placedBounds(at, box);
  at.scale.y *= (placed.max.y - foot) / (placed.max.y - placed.min.y);
  at.pos.y += placed.max.y - placedBounds(at, box).max.y;
  const now = placedBounds(at, box);
  const across = axis === 'x' ? 'z' : 'x';
  const face = bodyFace(body, axis, outward, [now.min[across], now.max[across]], [now.min.y, now.max.y]);
  if (face === null) fail();
  at.pos[axis] -= outward * (outward * (outward > 0 ? now.min[axis] : now.max[axis]) - outward * (face as number));
}

export function leanOnto(at: Placement, box: THREE.Box3, profile: FaceProfile, slope: Slope, axis: 'x' | 'z', fail: () => never): void {
  const upright = placedBounds(at, box).max.y;
  at.lean = slope.lean;
  at.pos.y += slope.foot - placedBounds(at, box).min.y;
  reachTop(at, box, upright);
  const [foot, head] = innerEdge(at, box, axis, profile.outward);
  const rows = profileRows(profile, foot.y, head.y);
  if (rows.length === 0) fail();
  const innerAt = (y: number): number => foot.out + ((y - foot.y) / (head.y - foot.y)) * (head.out - foot.out);
  const gap = Math.min(...rows.map((r) => innerAt(r.y) - r.reach));
  at.pos[axis] -= profile.outward * gap;
}

function reachTop(at: Placement, box: THREE.Box3, top: number): void {
  const placed = placedBounds(at, box);
  const thickness = (box.max.x - box.min.x) * at.scale.x * Math.sin(at.lean);
  const length = placed.max.y - placed.min.y - thickness;
  at.scale.y *= (top - placed.min.y - thickness) / length;
  at.pos.y += placed.min.y - placedBounds(at, box).min.y;
}

function innerEdge(at: Placement, box: THREE.Box3, axis: 'x' | 'z', outward: number): { y: number; out: number }[] {
  const middle = (box.min.z + box.max.z) / 2;
  const matrix = armorMatrix(at);
  return [box.min.y, box.max.y].map((y) => {
    const p = new THREE.Vector3(box.min.x, y, middle).applyMatrix4(matrix);
    return { y: p.y, out: outward * p[axis] };
  });
}

