import * as THREE from 'three';
import { CLIP_TOLERANCE, MIN_SUPPORT } from '../sim/body';
import { bottomSamples } from '../three/render/gunStand';

export type Stand = 'underside' | 'corners' | 'tip' | 'brace';

export type Piece = { name: string; obj: THREE.Object3D; stand: Stand };

export type SupportFault = { name: string; share: number; air: number; at: THREE.Vector3 };

const DOWN = new THREE.Vector3(0, -1, 0);
const EDGE = 1e-6;
const CORNER_SIDE = 2 * CLIP_TOLERANCE;
const HEAVY_TRIANGLES = 1000;
const COLUMNS_ACROSS = 48;
const MAX_CACHED_SOLIDS = 400;
const COLUMNS = new Map<string, Columns>();

export function supportFaults(pieces: Piece[], ground: THREE.Object3D[]): SupportFault[] {
  const faults: SupportFault[] = [];
  const groundSolids = solids(ground);
  const pieceSolids = pieces.map((piece) => solids([piece.obj]));
  for (const [at, piece] of pieces.entries()) {
    const others = [...groundSolids, ...pieceSolids.filter((_, i) => i !== at).flat()];
    const own = pieceSolids[at];
    const under = (piece.stand === 'underside' || piece.stand === 'corners' ? bottomSamples(piece.obj) : bottomPoints(piece.obj)).filter((p) => new THREE.Raycaster(p.clone().setY(p.y - CLIP_TOLERANCE / 2), DOWN).intersectObjects(own, false).length === 0);
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
  const origin = p.clone().addScaledVector(down, -CLIP_TOLERANCE);
  const distance = Math.min(...solids.map((mesh) => hitDistance(mesh, origin, down)));
  return Number.isFinite(distance) ? distance - CLIP_TOLERANCE : Infinity;
}

function mayHitBelow(mesh: THREE.Mesh, origin: THREE.Vector3): boolean {
  const box = mesh.userData.box as THREE.Box3;
  return origin.x >= box.min.x - EDGE && origin.x <= box.max.x + EDGE && origin.z >= box.min.z - EDGE && origin.z <= box.max.z + EDGE && box.min.y <= origin.y;
}

function hitDistance(mesh: THREE.Mesh, origin: THREE.Vector3, down: THREE.Vector3): number {
  if (down.equals(DOWN) && !mayHitBelow(mesh, origin)) return Infinity;
  const key = mesh.userData.key as string | undefined;
  if (key === undefined || !down.equals(DOWN)) return new THREE.Raycaster(origin, down).intersectObject(mesh, false)[0]?.distance ?? Infinity;
  return columnsOf(key, mesh).distanceDown(origin);
}

class Columns {
  private readonly cells = new Map<number, THREE.Vector3[][]>();
  private readonly min: THREE.Vector2;
  private readonly size: number;
  private readonly across: number;

  constructor(triangles: THREE.Vector3[][]) {
    const box = new THREE.Box3().setFromPoints(triangles.flat());
    this.min = new THREE.Vector2(box.min.x, box.min.z);
    this.size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / COLUMNS_ACROSS || 1;
    this.across = COLUMNS_ACROSS + 2;
    for (const tri of triangles) {
      const xs = tri.map((v) => this.column(v.x - this.min.x));
      const zs = tri.map((v) => this.column(v.z - this.min.y));
      for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
        for (let z = Math.min(...zs); z <= Math.max(...zs); z++) {
          const at = x * this.across + z;
          this.cells.set(at, [...(this.cells.get(at) ?? []), tri]);
        }
      }
    }
  }

  distanceDown(origin: THREE.Vector3): number {
    const x = this.column(origin.x - this.min.x);
    const z = this.column(origin.z - this.min.y);
    const ray = new THREE.Ray(origin, DOWN);
    const hit = new THREE.Vector3();
    let best = Infinity;
    for (const [a, b, c] of this.cells.get(x * this.across + z) ?? []) {
      if (ray.intersectTriangle(a, b, c, false, hit) !== null) best = Math.min(best, origin.distanceTo(hit));
    }
    return best;
  }

  private column(offset: number): number {
    return Math.floor(offset / this.size) + 1;
  }
}

function columnsOf(key: string, mesh: THREE.Mesh): Columns {
  const known = COLUMNS.get(key);
  if (known) return known;
  if (COLUMNS.size >= MAX_CACHED_SOLIDS) COLUMNS.clear();
  const fresh = new Columns(worldTriangles(mesh));
  COLUMNS.set(key, fresh);
  return fresh;
}

function worldTriangles(mesh: THREE.Mesh): THREE.Vector3[][] {
  const pos = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const at = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
  const count = index ? index.count : pos.count;
  const tris: THREE.Vector3[][] = [];
  for (let i = 0; i < count; i += 3) tris.push([at(i), at(i + 1), at(i + 2)]);
  return tris;
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
      const triangles = (o.geometry.getIndex()?.count ?? o.geometry.getAttribute('position').count) / 3;
      if (o.geometry.boundingBox === null) o.geometry.computeBoundingBox();
      const box = o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld);
      mesh.userData = triangles >= HEAVY_TRIANGLES ? { box, key: `${o.geometry.uuid}:${o.matrixWorld.elements.join(',')}` } : { box };
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
