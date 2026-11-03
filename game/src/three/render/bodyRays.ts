import * as THREE from 'three';

export type BodyHit = { point: THREE.Vector3; seeThrough: boolean };
export type BodyRays = (from: THREE.Vector3, dir: THREE.Vector3) => BodyHit | null;

type Tri = { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; cull: boolean; seeThrough: boolean; mid: THREE.Vector3 };
type Leaf = { box: THREE.Box3; tris: Tri[] };
type Split = { box: THREE.Box3; left: Tree; right: Tree };
type Tree = Leaf | Split;

const LEAF_SIZE = 8;

export function bodyRays(body: THREE.Object3D, seeThrough: (mesh: THREE.Mesh) => boolean): BodyRays {
  body.updateWorldMatrix(true, true);
  const tris: Tri[] = [];
  body.traverse((o) => {
    if (o instanceof THREE.Mesh) tris.push(...meshTris(o, seeThrough(o)));
  });
  const tree = treeOf(tris);
  return (from, dir) => nearestHit(tree, new THREE.Ray(from, dir));
}

function meshTris(mesh: THREE.Mesh, seeThrough: boolean): Tri[] {
  if (Array.isArray(mesh.material)) throw new Error(`Body mesh ${mesh.name} has several materials, which body rays do not read`);
  const side = mesh.material.side;
  const pos = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const corner = (k: number) => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(k) : k).applyMatrix4(mesh.matrixWorld);
  const tris: Tri[] = [];
  for (let k = 0; k + 2 < (index ? index.count : pos.count); k += 3) tris.push(triOf(corner(k), corner(k + 1), corner(k + 2), side, seeThrough));
  return tris;
}

function triOf(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, side: THREE.Side, seeThrough: boolean): Tri {
  const mid = a.clone().add(b).add(c).divideScalar(3);
  if (side === THREE.BackSide) return { a: c, b, c: a, cull: true, seeThrough, mid };
  return { a, b, c, cull: side === THREE.FrontSide, seeThrough, mid };
}

function boxOf(tris: Tri[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const t of tris) box.expandByPoint(t.a).expandByPoint(t.b).expandByPoint(t.c);
  return box;
}

function treeOf(tris: Tri[]): Tree {
  const box = boxOf(tris);
  if (tris.length <= LEAF_SIZE) return { box, tris };
  const axis = longestAxis(new THREE.Box3().setFromPoints(tris.map((t) => t.mid)));
  const sorted = [...tris].sort((p, q) => p.mid[axis] - q.mid[axis]);
  const half = sorted.length >> 1;
  return { box, left: treeOf(sorted.slice(0, half)), right: treeOf(sorted.slice(half)) };
}

function longestAxis(box: THREE.Box3): 'x' | 'y' | 'z' {
  const size = box.getSize(new THREE.Vector3());
  if (size.x >= size.y && size.x >= size.z) return 'x';
  return size.y >= size.z ? 'y' : 'z';
}

type Best = { hit: BodyHit | null; distance: number };

function nearestHit(tree: Tree, ray: THREE.Ray): BodyHit | null {
  const best: Best = { hit: null, distance: Infinity };
  visit(tree, ray, best);
  return best.hit;
}

function entryDistance(box: THREE.Box3, ray: THREE.Ray): number {
  if (box.containsPoint(ray.origin)) return 0;
  const entry = ray.intersectBox(box, new THREE.Vector3());
  return entry ? ray.origin.distanceTo(entry) : Infinity;
}

function visit(tree: Tree, ray: THREE.Ray, best: Best): void {
  const entry = entryDistance(tree.box, ray);
  if (entry === Infinity || entry > best.distance) return;
  if ('tris' in tree) {
    for (const t of tree.tris) hitTri(t, ray, best);
    return;
  }
  visit(tree.left, ray, best);
  visit(tree.right, ray, best);
}

function hitTri(t: Tri, ray: THREE.Ray, best: Best): void {
  const point = ray.intersectTriangle(t.a, t.b, t.c, t.cull, new THREE.Vector3());
  if (!point) return;
  const distance = ray.origin.distanceTo(point);
  if (distance < best.distance) {
    best.hit = { point, seeThrough: t.seeThrough };
    best.distance = distance;
  }
}
