import * as THREE from 'three';
import { CLIP_TOLERANCE, MIN_SUPPORT } from '../sim/body';

export type Stand = 'underside' | 'corners' | 'tip' | 'brace';

export type Piece = { name: string; obj: THREE.Object3D; stand: Stand };

export type SupportFault = { name: string; share: number; air: number; at: THREE.Vector3 };

const DOWN = new THREE.Vector3(0, -1, 0);
const EDGE = 1e-6;
const CORNER_SIDE = 2 * CLIP_TOLERANCE;

export function supportFaults(pieces: Piece[], ground: THREE.Object3D[]): SupportFault[] {
  const faults: SupportFault[] = [];
  for (const piece of pieces) {
    const others = solids([...ground, ...pieces.filter((p) => p !== piece).map((p) => p.obj)]);
    const own = solids([piece.obj]);
    const under = bottomPoints(piece.obj).filter((p) => new THREE.Raycaster(p.clone().setY(p.y - CLIP_TOLERANCE / 2), DOWN).intersectObjects(own, false).length === 0);
    if (under.length === 0) throw new Error(`Piece ${piece.name} has no mesh`);
    const groups = { underside: under.map((p) => [p]), corners: cornersOf(under), tip: [[centerOf(under)]], brace: [[centerOf(under)]] }[piece.stand];
    const down = piece.stand === 'brace' ? DOWN.clone().applyQuaternion(piece.obj.getWorldQuaternion(new THREE.Quaternion())) : DOWN;
    const gaps = groups.map((group) => Math.min(...group.map((p) => gapUnder(p, others, down))));
    const share = gaps.filter((g) => g <= CLIP_TOLERANCE).length / groups.length;
    const air = Math.max(...gaps);
    if (share < MIN_SUPPORT) faults.push({ name: piece.name, share, air, at: groups[gaps.indexOf(air)][0] });
  }
  return faults;
}

function gapUnder(p: THREE.Vector3, solids: THREE.Mesh[], down: THREE.Vector3): number {
  const hit = new THREE.Raycaster(p.clone().addScaledVector(down, -CLIP_TOLERANCE), down).intersectObjects(solids, false)[0];
  return hit ? hit.distance - CLIP_TOLERANCE : Infinity;
}

function solids(objs: THREE.Object3D[]): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const both = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const obj of objs) {
    obj.updateWorldMatrix(true, true);
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mesh = new THREE.Mesh(o.geometry, both);
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorld.copy(o.matrixWorld);
      out.push(mesh);
    });
  }
  return out;
}

function bottomPoints(obj: THREE.Object3D): THREE.Vector3[] {
  obj.updateWorldMatrix(true, true);
  const turn = new THREE.Quaternion();
  obj.matrixWorld.decompose(new THREE.Vector3(), turn, new THREE.Vector3());
  const toLevel = new THREE.Matrix4().makeRotationFromQuaternion(turn).invert();
  const fromLevel = toLevel.clone().invert();
  const tris: THREE.Vector3[][] = [];
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute('position');
    const index = o.geometry.getIndex();
    const toObj = toLevel.clone().multiply(o.matrixWorld);
    const at = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(toObj);
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) tris.push([at(i), at(i + 1), at(i + 2)]);
  });
  if (tris.length === 0) return [];
  const floor = Math.min(...tris.flat().map((v) => v.y));
  const low = tris.filter((t) => t.every((v) => v.y <= floor + CLIP_TOLERANCE) && new THREE.Triangle(t[0], t[1], t[2]).getNormal(new THREE.Vector3()).y < 0);
  return areaPoints(low).map((v) => v.applyMatrix4(fromLevel));
}

function areaPoints(tris: THREE.Vector3[][]): THREE.Vector3[] {
  const box = new THREE.Box3().setFromPoints(tris.flat());
  const out: THREE.Vector3[] = [];
  const nx = Math.max(1, Math.ceil((box.max.x - box.min.x) / CLIP_TOLERANCE));
  const nz = Math.max(1, Math.ceil((box.max.z - box.min.z) / CLIP_TOLERANCE));
  for (let i = 0; i <= nx; i++) {
    const x = box.min.x + ((box.max.x - box.min.x) * i) / nx;
    for (let j = 0; j <= nz; j++) {
      const z = box.min.z + ((box.max.z - box.min.z) * j) / nz;
      const ys = tris.map((t) => heightIn(t, x, z)).filter((h): h is number => h !== null);
      if (ys.length > 0) out.push(new THREE.Vector3(x, Math.min(...ys), z));
    }
  }
  return out.length > 0 ? out : tris.flat();
}

function heightIn([a, b, c]: THREE.Vector3[], x: number, z: number): number | null {
  const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  if (Math.abs(d) < 1e-9) return null;
  const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
  const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
  if (u < -EDGE || v < -EDGE || u + v > 1 + EDGE) return null;
  return u * a.y + v * b.y + (1 - u - v) * c.y;
}

function cornersOf(points: THREE.Vector3[]): THREE.Vector3[][] {
  const box = new THREE.Box3().setFromPoints(points);
  const reach = CORNER_SIDE;
  const near = (x: number, z: number) => points.filter((p) => Math.abs(p.x - x) <= reach && Math.abs(p.z - z) <= reach);
  return [[box.min.x, box.min.z], [box.min.x, box.max.z], [box.max.x, box.min.z], [box.max.x, box.max.z]].map(([x, z]) => near(x, z)).filter((group) => group.length > 0);
}

function centerOf(points: THREE.Vector3[]): THREE.Vector3 {
  return points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(points.length);
}
