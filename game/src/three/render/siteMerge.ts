import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { registerBakedOutline } from './models';

const PLAIN_ATTRIBUTES = new Set(['position', 'normal', 'uv', 'color']);
const NOT_LOOK = new Set(['uuid', 'name']);

type Look = { id: number; material: THREE.MeshLambertMaterial };
type Looks = { keys: Map<THREE.Material, string | null>; shared: Map<string, Look> };
type Context = { root: THREE.Object3D; looks: Looks };
type Piece = { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 };
type Group = { look: Look; furniture: boolean; meshes: THREE.Mesh[] };

const MERGE_RULES: readonly ((mesh: THREE.Mesh, context: Context) => boolean)[] = [
  (mesh) => !mesh.userData.outline && mesh.children.length === 0,
  (mesh, { root }) => visibleUpTo(mesh, root) && mesh.matrixWorld.determinant() >= 0,
  (mesh, { looks }) => !Array.isArray(mesh.material) && lookKey(mesh.material, looks) !== null,
  (mesh) => hasPlainGeometry(mesh.geometry),
];

export function mergeStaticMeshes(root: THREE.Group, kept: readonly THREE.Object3D[], pivot: THREE.Vector3): void {
  root.updateMatrixWorld(true);
  const standing = subtreesOf(kept);
  const toPivot = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z).multiply(root.matrixWorld.clone().invert());
  for (const group of groupsOf(root, standing)) if (group.meshes.length > 1) mergeGroup(root, group, toPivot, pivot, standing);
}

function subtreesOf(nodes: readonly THREE.Object3D[]): Set<THREE.Object3D> {
  const all = new Set<THREE.Object3D>();
  for (const node of nodes) node.traverse((o) => all.add(o));
  return all;
}

function groupsOf(root: THREE.Object3D, standing: ReadonlySet<THREE.Object3D>): Group[] {
  const context: Context = { root, looks: { keys: new Map(), shared: new Map() } };
  const groups = new Map<string, Group>();
  root.traverse((o) => {
    if (standing.has(o) || !isMergeable(o, context)) return;
    const mesh = o as THREE.Mesh;
    const look = lookOf(mesh.material as THREE.MeshLambertMaterial, context.looks);
    const furniture = isFurniture(mesh, root);
    const key = [look.id, mesh.castShadow, mesh.receiveShadow, mesh.renderOrder, mesh.layers.mask, mesh.frustumCulled, furniture, shapeOf(mesh.geometry, look.material)].join('|');
    const group = groups.get(key) ?? { look, furniture, meshes: [] };
    group.meshes.push(mesh);
    groups.set(key, group);
  });
  return [...groups.values()];
}

function isMergeable(o: THREE.Object3D, context: Context): boolean {
  return Object.getPrototypeOf(o) === THREE.Mesh.prototype && MERGE_RULES.every((rule) => rule(o as THREE.Mesh, context));
}

function visibleUpTo(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = o; node; node = node === root ? null : node.parent) if (!node.visible) return false;
  return true;
}

function hasPlainGeometry(geometry: THREE.BufferGeometry): boolean {
  return isDrawnWhole(geometry) && geometry.hasAttribute('position') && geometry.hasAttribute('normal') && Object.entries(geometry.attributes).every(isPlainAttribute);
}

function isDrawnWhole(geometry: THREE.BufferGeometry): boolean {
  const range = geometry.drawRange.start === 0 && geometry.drawRange.count === Infinity;
  return range && Object.keys(geometry.morphAttributes).length === 0;
}

function isPlainAttribute([name, attribute]: [string, THREE.BufferAttribute | THREE.InterleavedBufferAttribute]): boolean {
  return PLAIN_ATTRIBUTES.has(name) && !('isInterleavedBufferAttribute' in attribute);
}

function lookKey(material: THREE.Material, looks: Looks): string | null {
  if (!looks.keys.has(material)) looks.keys.set(material, plainLook(material));
  return looks.keys.get(material)!;
}

function plainLook(material: THREE.Material): string | null {
  if (!(material instanceof THREE.MeshLambertMaterial) || material.transparent) return null;
  const text = JSON.stringify(material.toJSON(), (key, value) => (NOT_LOOK.has(key) ? undefined : value));
  return text.includes('"textures"') || text.includes('"images"') ? null : text;
}

function lookOf(material: THREE.MeshLambertMaterial, looks: Looks): Look {
  const key = lookKey(material, looks)!;
  const known = looks.shared.get(key);
  if (known) return known;
  const look = { id: looks.shared.size, material };
  looks.shared.set(key, look);
  return look;
}

function isFurniture(mesh: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = mesh; node; node = node === root ? null : node.parent) if (node.userData.gateFurniture) return true;
  return false;
}

function keptAttributes(material: THREE.Material): string[] {
  return material.vertexColors ? ['position', 'normal', 'color'] : ['position', 'normal'];
}

function shapeOf(geometry: THREE.BufferGeometry, material: THREE.Material): string {
  const layout = keptAttributes(material).map((name) => {
    const attribute = geometry.getAttribute(name);
    return `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`;
  });
  return [geometry.index ? 'indexed' : 'soup', ...layout].join(',');
}

function bakedPiece(mesh: THREE.Mesh, material: THREE.Material, toPivot: THREE.Matrix4): Piece {
  const matrix = new THREE.Matrix4().multiplyMatrices(toPivot, mesh.matrixWorld);
  const geometry = new THREE.BufferGeometry();
  for (const name of keptAttributes(material)) geometry.setAttribute(name, mesh.geometry.getAttribute(name).clone());
  if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index.clone());
  return { geometry: geometry.applyMatrix4(matrix), matrix };
}

function mergedMesh(group: Group, geometry: THREE.BufferGeometry, pivot: THREE.Vector3): THREE.Mesh {
  const first = group.meshes[0];
  const merged = new THREE.Mesh(geometry, group.look.material);
  merged.name = 'static';
  merged.position.copy(pivot);
  merged.castShadow = first.castShadow;
  merged.receiveShadow = first.receiveShadow;
  merged.renderOrder = first.renderOrder;
  merged.layers.mask = first.layers.mask;
  merged.frustumCulled = first.frustumCulled;
  if (group.furniture) merged.userData.gateFurniture = true;
  return merged;
}

function mergeGroup(root: THREE.Group, group: Group, toPivot: THREE.Matrix4, pivot: THREE.Vector3, standing: ReadonlySet<THREE.Object3D>): void {
  const pieces = group.meshes.map((mesh) => bakedPiece(mesh, group.look.material, toPivot));
  const geometry = mergeGeometries(pieces.map((piece) => piece.geometry));
  if (!geometry) throw new Error(`Static meshes of ${root.name} have different attributes under one look`);
  registerBakedOutline(geometry, group.meshes.map((mesh, i) => ({ geometry: mesh.geometry, matrix: pieces[i].matrix })));
  root.add(mergedMesh(group, geometry, pivot));
  for (const mesh of group.meshes) {
    removeWithEmptyParents(mesh, root, standing);
    mesh.geometry.dispose();
  }
  for (const piece of pieces) piece.geometry.dispose();
}

function removeWithEmptyParents(mesh: THREE.Object3D, root: THREE.Object3D, standing: ReadonlySet<THREE.Object3D>): void {
  let parent = mesh.parent;
  mesh.removeFromParent();
  while (parent && parent !== root && parent.children.length === 0 && !standing.has(parent)) {
    const above = parent.parent;
    parent.removeFromParent();
    parent = above;
  }
}
