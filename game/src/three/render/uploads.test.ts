import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CardBatch, type Card } from './particles/cards';
import { ChunkBatch } from './particles/chunks';
import { uploadFirst } from './uploads';
import type { Terrain } from '../../sim/terrain';

const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 1, 100);
camera.updateProjectionMatrix();
const FLAT = { heightAt: () => 0 } as unknown as Terrain;
const CARD: Card = { x: 0, y: 0, z: 0, size: 1, spin: 0, shape: 0, r: 1, g: 1, b: 1, alpha: 1, sx: 0, sy: 0, sz: 0 };

function tint(batch: CardBatch): THREE.BufferAttribute {
  return batch.mesh.geometry.getAttribute('tint') as THREE.BufferAttribute;
}

describe('uploadFirst', () => {
  it('sends only the used items', () => {
    const attribute = new THREE.BufferAttribute(new Float32Array(30), 3);
    uploadFirst(attribute, 2);
    expect(attribute.version).toBe(1);
    expect(attribute.updateRanges).toEqual([{ start: 0, count: 6 }]);
  });

  it('sends nothing for no items, because an empty range would send the whole buffer', () => {
    const attribute = new THREE.BufferAttribute(new Float32Array(30), 3);
    uploadFirst(attribute, 0);
    expect(attribute.version).toBe(0);
    expect(attribute.updateRanges).toEqual([]);
  });
});

describe('idle effects', () => {
  it('upload no cards while none are drawn', () => {
    const batch = new CardBatch(16, 'glow', new THREE.Texture(), 2);
    batch.flush(camera);
    expect(tint(batch).version).toBe(0);
  });

  it('stop uploading cards after the last one is gone', () => {
    const batch = new CardBatch(16, 'glow', new THREE.Texture(), 2);
    batch.push(CARD);
    batch.flush(camera);
    const sent = tint(batch).version;
    batch.flush(camera);
    expect(sent).toBe(1);
    expect(tint(batch).version).toBe(sent);
    expect((batch.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(0);
  });

  it('upload no debris while none flies', () => {
    const batch = new ChunkBatch(8, () => 0.5, () => true);
    const versions = () => batch.meshes.map((mesh) => mesh.instanceMatrix.version);
    const before = versions();
    batch.tick(0.016, FLAT);
    expect(versions()).toEqual(before);
  });
});
