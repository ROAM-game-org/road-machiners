import * as THREE from 'three';
import type { SideLetter } from '../../sim/grid';
import { cutHeightAt, TOP_MARGIN, type TopCut } from './armorTop';
import { bodyFace } from './gunStand';

export type Placement = { pos: THREE.Vector3; yaw: number; scale: THREE.Vector3 };

export const SIDE_FACE: Record<SideLetter, { axis: 'x' | 'z'; outward: 1 | -1 }> = {
  F: { axis: 'x', outward: 1 },
  B: { axis: 'x', outward: -1 },
  R: { axis: 'z', outward: 1 },
  L: { axis: 'z', outward: -1 },
};

const GAP_BAND = 0.15;
const GAP_SLICES = 5;
const GAP_MOST = 0.6;
const SINK_SHARE = 0.5;

export function placedBounds(at: Placement, box: THREE.Box3): THREE.Box3 {
  const m = new THREE.Matrix4().compose(at.pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, at.yaw, 0)), at.scale);
  return box.clone().applyMatrix4(m);
}

export function fitToBody(at: Placement, box: THREE.Box3, body: THREE.Object3D, cut: TopCut, side: SideLetter, ram: boolean): void {
  if (ram) {
    sinkUnderCut(at, box, cut, side);
    return;
  }
  growToCut(at, box, cut, side);
  closeGap(at, box, body, side);
  sinkHalfway(at, box, side);
}

function cutAlong(placed: THREE.Box3, cut: TopCut, side: SideLetter): number[] {
  const mid = placed.getCenter(new THREE.Vector3());
  if (SIDE_FACE[side].axis === 'z') return [placed.min.x, mid.x, placed.max.x].map((x) => cutHeightAt(cut, x, mid.z));
  return [placed.min.z, mid.z, placed.max.z].map((z) => cutHeightAt(cut, mid.x, z));
}

function sinkUnderCut(at: Placement, box: THREE.Box3, cut: TopCut, side: SideLetter): void {
  const placed = placedBounds(at, box);
  const under = Math.min(...cutAlong(placed, cut, side)) + TOP_MARGIN;
  if (placed.max.y > under) at.pos.y -= placed.max.y - under;
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

function closeGap(at: Placement, box: THREE.Box3, body: THREE.Object3D, side: SideLetter): void {
  const { axis, outward } = SIDE_FACE[side];
  if (axis !== 'z') return;
  const placed = placedBounds(at, box);
  const outer = outward > 0 ? placed.max.z : placed.min.z;
  const depth = placed.max.z - placed.min.z;
  const step = (placed.max.x - placed.min.x) / GAP_SLICES;
  const band: [number, number] = [placed.max.y - GAP_BAND, placed.max.y];
  const faces = Array.from({ length: GAP_SLICES }, (_, k) => bodyFace(body, axis, outward, [placed.min.x + k * step, placed.min.x + (k + 1) * step], band));
  const found = faces.filter((f): f is number => f !== null).map((f) => outward * f);
  if (found.length === 0) return;
  const reach = outward * outer - depth - Math.min(...found);
  if (!(reach > 0)) return;
  const k = Math.min(GAP_MOST, depth + reach) / depth;
  at.scale.x *= k;
  at.pos.z = outer + (at.pos.z - outer) * k;
}

function sinkHalfway(at: Placement, box: THREE.Box3, side: SideLetter): void {
  const { axis, outward } = SIDE_FACE[side];
  const placed = placedBounds(at, box);
  at.pos[axis] -= outward * (placed.max[axis] - placed.min[axis]) * SINK_SHARE;
}
