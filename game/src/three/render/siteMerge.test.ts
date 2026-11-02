import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { outlineProps } from './models';
import { mergeStaticMeshes } from './siteMerge';

const PIVOT = new THREE.Vector3(5000, 2, 6000);

function look(color: number, options: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...options });
}

function put(parent: THREE.Object3D, material: THREE.Material, x: number, z: number, yaw = 0, size: [number, number, number] = [1, 2, 3]): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(5000 + x, 1, 6000 + z);
  mesh.rotation.y = yaw;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function site(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'landmark-test';
  return root;
}

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.outline) found.push(o);
  });
  return found;
}

function triangles(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry;
  return (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
}

function trianglesByColor(root: THREE.Object3D): Record<number, number> {
  const totals: Record<number, number> = {};
  for (const mesh of meshesOf(root)) {
    const color = (mesh.material as THREE.MeshLambertMaterial).color.getHex();
    totals[color] = (totals[color] ?? 0) + triangles(mesh);
  }
  return totals;
}

function worldVertices(root: THREE.Object3D): number[][] {
  root.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const rows: number[][] = [];
  for (const mesh of meshesOf(root)) {
    const positions = mesh.geometry.getAttribute('position');
    const normals = mesh.geometry.getAttribute('normal');
    const toNormal = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const index = mesh.geometry.index;
    const count = index ? index.count : positions.count;
    for (let n = 0; n < count; n++) {
      const i = index ? index.getX(n) : n;
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      normal.fromBufferAttribute(normals, i).applyMatrix3(toNormal).normalize();
      rows.push([point.x, point.y, point.z, normal.x, normal.y, normal.z]);
    }
  }
  return rows;
}

function expectSameVertices(after: number[][], before: number[][]): void {
  expect(after).toHaveLength(before.length);
  const unused = [...before];
  for (const row of after) {
    const at = unused.findIndex((other) => other.every((v, i) => Math.abs(v - row[i]) < 1e-3));
    expect(at, `no vertex near ${row.map((v) => v.toFixed(3))}`).toBeGreaterThanOrEqual(0);
    unused.splice(at, 1);
  }
}

function merge(root: THREE.Group, kept: THREE.Object3D[] = []): void {
  mergeStaticMeshes(root, kept, PIVOT);
  root.updateMatrixWorld(true);
}

describe('merging the static meshes of a site', () => {
  it('turns every mesh of one look into one mesh, even when each has its own copy of the material and its own name', () => {
    const root = site();
    for (let i = 0; i < 4; i++) put(root, look(0xaa0000, { name: `copy-${i}` }), i * 3, 0, i * 0.3);
    for (let i = 0; i < 3; i++) put(root, look(0x00aa00), i * 3, 10);
    merge(root);
    const meshes = meshesOf(root);
    expect(meshes).toHaveLength(2);
    expect(meshes.map((m) => triangles(m))).toEqual([48, 36]);
  });

  it('keeps every world vertex and normal of parts under turned, scaled and lifted parents', () => {
    const root = site();
    const turned = new THREE.Group();
    turned.position.set(5003, 4, 6001);
    turned.rotation.set(0.2, 1.1, -0.3);
    turned.scale.set(1.5, 0.7, 2);
    root.add(turned);
    const wall = look(0x886644);
    put(turned, wall, -5000, -6000, 0.4);
    put(turned, wall, -4998, -6004, 1.3, [2, 1, 0.5]);
    put(root, wall, 4, 4, 2.1);
    root.updateMatrixWorld(true);
    const before = worldVertices(root);
    merge(root);
    expect(meshesOf(root)).toHaveLength(1);
    expectSameVertices(worldVertices(root), before);
  });

  it('keeps the precise bounds and the triangles of every color', () => {
    const root = site();
    for (let i = 0; i < 5; i++) put(root, look(i % 2 ? 0x112233 : 0x445566), i * 4, i * 2, i * 0.7);
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root, true);
    const totals = trianglesByColor(root);
    merge(root);
    const after = new THREE.Box3().setFromObject(root, true);
    for (const [a, b] of [[bounds.min, after.min], [bounds.max, after.max]]) expect(a.distanceTo(b)).toBeLessThan(1e-3);
    expect(trianglesByColor(root)).toEqual(totals);
  });

  it('keeps movers, lamp heads with their children and fixture heads where they are', () => {
    const root = site();
    const paint = look(0x884400);
    put(root, paint, 0, 0);
    put(root, paint, 4, 0);
    const base = new THREE.Group();
    base.position.set(5008, 0, 6000);
    root.add(base);
    put(base, paint, -5008, -6000);
    const beam = new THREE.Group();
    beam.position.set(1, 3, 0);
    base.add(beam);
    put(beam, paint, -5009, -6000);
    const head = put(root, look(0xffcc66), 8, 8);
    const halo = new THREE.Sprite();
    head.add(halo);
    const anchor = new THREE.Group();
    anchor.position.set(5012, 5, 6012);
    root.add(anchor);
    const kept = [beam, head, anchor];
    root.updateMatrixWorld(true);
    const places = kept.map((o) => o.getWorldPosition(new THREE.Vector3()));
    merge(root, kept);
    kept.forEach((o, i) => {
      expect(o.getWorldPosition(new THREE.Vector3()).distanceTo(places[i])).toBeLessThan(1e-9);
      let top: THREE.Object3D = o;
      while (top.parent) top = top.parent;
      expect(top, o.name || o.type).toBe(root);
    });
    expect(halo.parent).toBe(head);
    expect(beam.children).toHaveLength(1);
    expect(meshesOf(root).filter((m) => (m.material as THREE.MeshLambertMaterial).color.getHex() === 0x884400)).toHaveLength(2);
  });

  it('removes a group whose meshes all merged away and keeps one that holds a mover', () => {
    const root = site();
    const paint = look(0x884400);
    put(root, paint, 0, 0);
    const emptied = new THREE.Group();
    root.add(emptied);
    put(emptied, paint, 1, 1);
    const holder = new THREE.Group();
    root.add(holder);
    put(holder, paint, 2, 2);
    const mover = new THREE.Group();
    holder.add(mover);
    put(mover, paint, 3, 3);
    merge(root, [mover]);
    expect(root.children).toContain(holder);
    expect(root.children).not.toContain(emptied);
    expect(holder.children).toEqual([mover]);
  });

  it('leaves transparent, textured, hidden, mirrored, parent, odd-attribute and non-plain meshes alone', () => {
    const root = site();
    const paint = look(0x884400);
    put(root, paint, 0, 0);
    put(root, paint, 3, 0);
    const alone: THREE.Object3D[] = [];
    alone.push(put(root, look(0x884400, { transparent: true, opacity: 0.5 }), 6, 0));
    alone.push(put(root, look(0x884400, { transparent: true, opacity: 0.5 }), 9, 0));
    alone.push(put(root, look(0x884400, { map: new THREE.Texture() }), 12, 0));
    alone.push(put(root, look(0x884400, { map: new THREE.Texture() }), 15, 0));
    const hidden = put(root, paint, 18, 0);
    hidden.visible = false;
    alone.push(hidden);
    const mirrored = put(root, paint, 21, 0);
    mirrored.scale.x = -1;
    alone.push(mirrored);
    const parent = put(root, paint, 24, 0);
    parent.add(new THREE.Group());
    alone.push(parent);
    const odd = put(root, paint, 27, 0);
    odd.geometry.setAttribute('maskUv', new THREE.BufferAttribute(new Float32Array(odd.geometry.getAttribute('position').count * 2), 2));
    alone.push(odd);
    const shiny = put(root, new THREE.MeshStandardMaterial({ color: 0x884400 }), 30, 0);
    alone.push(shiny);
    const outline = put(root, paint, 33, 0);
    outline.userData.outline = true;
    alone.push(outline);
    const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), paint, 2);
    root.add(crowd);
    alone.push(crowd);
    const sprite = new THREE.Sprite();
    root.add(sprite);
    alone.push(sprite);
    merge(root);
    for (const o of alone) expect(o.parent, o.type).toBe(root);
    expect(root.children.filter((o) => o.name === 'static')).toHaveLength(1);
  });

  it('keeps meshes apart that differ in shadow flags, render order, layers, culling or gate furniture', () => {
    const root = site();
    const paint = look(0x884400);
    const variants: ((m: THREE.Mesh) => void)[] = [
      () => {},
      (m) => (m.castShadow = false),
      (m) => (m.receiveShadow = false),
      (m) => (m.renderOrder = 3),
      (m) => m.layers.set(2),
      (m) => (m.frustumCulled = false),
    ];
    variants.forEach((change, i) => {
      for (let k = 0; k < 2; k++) change(put(root, paint, i * 5, k * 3));
    });
    const furniture = put(root, paint, 40, 0);
    furniture.userData.gateFurniture = true;
    const furniturePair = put(root, paint, 40, 3);
    furniturePair.userData.gateFurniture = true;
    merge(root);
    const merged = root.children.filter((o): o is THREE.Mesh => o.name === 'static');
    expect(merged).toHaveLength(variants.length + 1);
    expect(merged.filter((m) => m.userData.gateFurniture)).toHaveLength(1);
    const shapes = merged.map((m) => [m.castShadow, m.receiveShadow, m.renderOrder, m.layers.mask, m.frustumCulled].join());
    expect(new Set(shapes).size).toBe(shapes.length - 1);
  });

  it('keeps vertex colors apart from plain looks', () => {
    const root = site();
    const plain = look(0x884400);
    const colored = look(0x884400, { vertexColors: true });
    for (const material of [plain, plain, colored, colored]) {
      const mesh = put(root, material, root.children.length * 3, 0);
      const count = mesh.geometry.getAttribute('position').count;
      mesh.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(0.5), 3));
    }
    merge(root);
    expect(meshesOf(root)).toHaveLength(2);
    const [first, second] = meshesOf(root);
    expect(Object.keys(first.geometry.attributes).sort()).not.toEqual(Object.keys(second.geometry.attributes).sort());
  });

  it('shares one material for merged meshes and gives it the first copy', () => {
    const root = site();
    const copies = [look(0x884400), look(0x884400)];
    put(root, copies[0], 0, 0);
    put(root, copies[1], 3, 0);
    merge(root);
    expect(meshesOf(root)[0].material).toBe(copies[0]);
  });

  it('draws one outline for the merged mesh, made of the outlines of its parts welded one by one', () => {
    const touching = (root: THREE.Group) => {
      const paint = look(0x884400);
      put(root, paint, 0, 0);
      put(root, paint, 1, 0);
      put(root, paint, 6, 2, 0.6, [2, 1, 4]);
    };
    const outlinesOf = (root: THREE.Group) => {
      root.updateMatrixWorld(true);
      const found: THREE.Mesh[] = [];
      root.traverse((o) => {
        if (o instanceof THREE.Mesh && o.userData.outline) found.push(o);
      });
      return found;
    };
    const loose = site();
    touching(loose);
    outlineProps(loose);
    const joined = site();
    touching(joined);
    merge(joined);
    outlineProps(joined);
    const parts = outlinesOf(loose);
    const [outline, ...others] = outlinesOf(joined);
    expect(parts).toHaveLength(3);
    expect(others).toHaveLength(0);
    expect(triangles(outline)).toBe(parts.reduce((n, o) => n + triangles(o), 0));
    expect(outline.geometry.getAttribute('position').count).toBe(parts.reduce((n, o) => n + o.geometry.getAttribute('position').count, 0));
    const bounds = new THREE.Box3();
    for (const o of parts) bounds.union(new THREE.Box3().setFromObject(o, true));
    const after = new THREE.Box3().setFromObject(outline, true);
    expect(after.min.distanceTo(bounds.min)).toBeLessThan(1e-3);
    expect(after.max.distanceTo(bounds.max)).toBeLessThan(1e-3);
  });
});
