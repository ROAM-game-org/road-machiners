import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import { outlineOf } from './models';
import { disposeTree } from './debris';

function reference(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const plain = geos.map((g) => {
    const p = new THREE.BufferGeometry();
    p.setAttribute('position', g.getAttribute('position').clone());
    if (g.index) p.setIndex(g.index.clone());
    return p.index ? p.toNonIndexed() : p;
  });
  const welded = mergeVertices(mergeGeometries(plain)!, 1e-3);
  welded.computeVertexNormals();
  return welded;
}

function parts(): THREE.BufferGeometry[] {
  const touching = new THREE.BoxGeometry(1, 1, 1).translate(1.0004, 0, 0);
  const loose = new THREE.CylinderGeometry(0.3, 0.3, 1, 7).toNonIndexed().translate(-2.5, 0.2, 1.3);
  return [new THREE.BoxGeometry(1, 1, 1), touching, loose];
}

describe('outline weld', () => {
  it('welds the same vertices, in the same order, with the same normals as mergeVertices', () => {
    const want = reference(parts());
    const got = outlineOf(parts())[0].geometry;
    expect(Array.from(got.index!.array)).toEqual(Array.from(want.index!.array));
    expect(Array.from(got.getAttribute('position').array)).toEqual(Array.from(want.getAttribute('position').array));
    expect(Array.from(got.getAttribute('normal').array)).toEqual(Array.from(want.getAttribute('normal').array));
  });

  it('refuses a vertex outside the weld range', () => {
    expect(() => outlineOf([new THREE.BoxGeometry(300, 300, 300)])).toThrow(/weld range/);
  });
});

describe('shared outline material', () => {
  it('survives disposing one outlined object, so the others keep their compiled shader', () => {
    const [outline] = outlineOf([new THREE.BoxGeometry()]);
    let disposed = 0;
    (outline.material as THREE.Material).addEventListener('dispose', () => disposed++);
    const holder = new THREE.Group();
    holder.add(outline);
    disposeTree(holder);
    expect(disposed).toBe(0);
  });
});
