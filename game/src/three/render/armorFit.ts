import * as THREE from 'three';
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
  if (SIDE_FACE[side].axis !== 'z') return;
  const placed = placedBounds(at, box);
  const target = Math.max(...cutAlong(placed, cut, side));
  if (!(target > placed.max.y + TOP_MARGIN)) return;
  const k = (target - placed.min.y) / (placed.max.y - placed.min.y);
  at.scale.y *= k;
  at.pos.y = placed.min.y + (at.pos.y - placed.min.y) * k;
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

type Row = { index: number; y: number; reach: number };
type Span = { bottom: number; top: number };

export type Settle = { profile: FaceProfile; axis: 'x' | 'z'; toBodyTop: boolean; upright: () => void; fail: () => never };

export function settleOnBody(at: Placement, box: THREE.Box3, { profile, axis, toBodyTop, upright, fail }: Settle): void {
  const placed = placedBounds(at, box);
  const top = toBodyTop ? bodyTop(profile) : placed.max.y;
  const face = top === null ? null : tallestFace(profileRows(profile, placed.min.y, top));
  if (top === null || face === null) return upright();
  const span = { bottom: Math.max(placed.min.y, face[0].y - FACE_COLUMN / 2), top: Math.min(top, (face.at(-1) as Row).y + FACE_COLUMN / 2) };
  coverFace(at, box, face, span, fail);
  touchFace(at, box, face, axis, profile.outward);
}

function bodyTop(profile: FaceProfile): number | null {
  const highest = profileRows(profile, -Infinity, Infinity).at(-1);
  return highest === undefined ? null : highest.y + FACE_COLUMN / 2;
}

const FACE_FILL = 0.5;

function profileRows(profile: FaceProfile, bottom: number, top: number): Row[] {
  return profile.reach.flatMap((reach, index) => {
    const y = profile.bottom + (index + 0.5) * FACE_COLUMN;
    return reach !== null && profile.fill[index] >= FACE_FILL && y >= bottom && y <= top ? [{ index, y, reach }] : [];
  });
}

function tallestFace(rows: Row[]): Row[] | null {
  const faces = facesOf(rows);
  if (faces.length === 0) return null;
  const outer = (face: Row[]): number => Math.max(...face.map((r) => r.reach));
  return faces.reduce((best, face) => (face.length > best.length || (face.length === best.length && outer(face) > outer(best)) ? face : best));
}

function facesOf(rows: Row[]): Row[][] {
  const faces: Row[][] = [];
  for (const row of rows) {
    const last = faces.at(-1)?.at(-1);
    if (last && row.index === last.index + 1 && Math.abs(row.reach - last.reach) <= FACE_COLUMN) (faces.at(-1) as Row[]).push(row);
    else faces.push([row]);
  }
  return faces;
}

function coverFace(at: Placement, box: THREE.Box3, face: Row[], span: Span, fail: () => never): void {
  at.lean = leanOf(face, span);
  const thickness = (box.max.x - box.min.x) * at.scale.x;
  const length = box.max.y - box.min.y;
  at.scale.y = (span.top - span.bottom - thickness * Math.sin(at.lean)) / (length * Math.cos(at.lean));
  if (!(at.scale.y > 0)) return fail();
  at.pos.y += span.bottom - placedBounds(at, box).min.y;
}

function leanOf(face: Row[], span: Span): number {
  const low = face[0];
  const high = face.at(-1) as Row;
  const lean = Math.atan2(low.reach - high.reach, high.y - low.y);
  return lean > 0 && (span.top - span.bottom) * Math.sin(lean) > CLIP_TOLERANCE ? Math.min(lean, STEEPEST_LEAN) : 0;
}

function touchFace(at: Placement, box: THREE.Box3, face: Row[], axis: 'x' | 'z', outward: number): void {
  const [foot, head] = innerEdge(at, box, axis, outward);
  const innerAt = (y: number): number => foot.out + ((y - foot.y) / (head.y - foot.y)) * (head.out - foot.out);
  const gap = Math.min(...face.map((r) => innerAt(r.y) - r.reach));
  at.pos[axis] -= outward * gap;
}

function innerEdge(at: Placement, box: THREE.Box3, axis: 'x' | 'z', outward: number): { y: number; out: number }[] {
  const middle = (box.min.z + box.max.z) / 2;
  const matrix = armorMatrix(at);
  return [box.min.y, box.max.y].map((y) => {
    const p = new THREE.Vector3(box.min.x, y, middle).applyMatrix4(matrix);
    return { y: p.y, out: outward * p[axis] };
  });
}
