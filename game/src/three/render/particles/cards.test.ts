import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { perfSnapshot } from '../../../perf';
import { CardBatch, OVERFILL_COUNTER, type Card } from './cards';

const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 1, 100);
camera.updateProjectionMatrix();

function card(alpha: number, size: number): Card {
  return { x: 0, y: 0, z: 0, size, spin: 0, shape: 0, r: 1, g: 1, b: 1, alpha, sx: 0, sy: 0, sz: 0 };
}

function put(batch: CardBatch, filled: Card): void {
  Object.assign(batch.slot(), filled);
}

function drawn(batch: CardBatch): number {
  return (batch.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount;
}

describe('card fill ceiling', () => {
  it('draws every card while they paint less than the ceiling', () => {
    const batch = new CardBatch(16, 'glow', new THREE.Texture(), 2);
    for (let i = 0; i < 4; i++) put(batch, card(0.5, 5));
    batch.flush(camera);
    expect(drawn(batch)).toBe(4);
  });

  it('stops drawing the faintest cards once they would paint the screen more times over than the ceiling', () => {
    const batch = new CardBatch(16, 'glow', new THREE.Texture(), 2);
    const before = perfSnapshot()[OVERFILL_COUNTER]?.calls ?? 0;
    for (const alpha of [0.1, 0.9, 0.2, 0.8, 0.3, 0.7]) put(batch, card(alpha, 10));
    batch.flush(camera);
    expect(drawn(batch)).toBe(2);
    expect(perfSnapshot()[OVERFILL_COUNTER].calls - before).toBe(4);
    const tints = batch.mesh.geometry.getAttribute('tint');
    const kept = [tints.getW(0), tints.getW(1)].sort();
    expect(kept[0]).toBeCloseTo(0.8);
    expect(kept[1]).toBeCloseTo(0.9);
  });

  it('counts a streak by its length on screen', () => {
    const batch = new CardBatch(16, 'glow', new THREE.Texture(), 1);
    put(batch, { ...card(0.9, 5), sx: 15 });
    put(batch, card(0.5, 5));
    batch.flush(camera);
    expect(drawn(batch)).toBe(1);
  });
});

describe('card material', () => {
  it('builds one depth tested mesh that writes no depth and no stencil', () => {
    const batch = new CardBatch(4, 'lit', new THREE.Texture(), 2);
    const material = batch.mesh.material as THREE.ShaderMaterial;
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.stencilWrite).toBe(false);
  });
});

describe('lit card order', () => {
  const lookingDown = new THREE.OrthographicCamera(-5, 5, 5, -5, 1, 100);
  lookingDown.updateProjectionMatrix();

  function offsetsZ(batch: CardBatch): number[] {
    const offsets = batch.mesh.geometry.getAttribute('offset');
    return Array.from({ length: drawn(batch) }, (_, i) => offsets.getZ(i));
  }

  it('draws the farthest cards first, and keeps every card', () => {
    const batch = new CardBatch(16, 'lit', new THREE.Texture(), 100);
    for (const z of [-1, -5, -3, -4, -2]) put(batch, { ...card(0.5, 1), z });
    batch.flush(lookingDown);
    expect(offsetsZ(batch)).toEqual([-5, -4, -3, -2, -1]);
  });

  it('keeps every card when one has a depth that is not a number', () => {
    const batch = new CardBatch(16, 'lit', new THREE.Texture(), 100);
    for (const z of [-1, Number.NaN, -3, Infinity]) put(batch, { ...card(0.5, 1), z });
    batch.flush(lookingDown);
    expect(drawn(batch)).toBe(4);
    expect(offsetsZ(batch).filter((z) => Number.isFinite(z))).toEqual([-3, -1]);
  });

  it('keeps the order of cards at one depth and draws a single card', () => {
    const batch = new CardBatch(16, 'lit', new THREE.Texture(), 100);
    for (const x of [3, 1, 2]) put(batch, { ...card(0.5, 1), x, z: -2 });
    batch.flush(lookingDown);
    const offsets = batch.mesh.geometry.getAttribute('offset');
    expect([0, 1, 2].map((i) => offsets.getX(i))).toEqual([3, 1, 2]);
    put(batch, { ...card(0.5, 1), z: -9 });
    batch.flush(lookingDown);
    expect(offsetsZ(batch)).toEqual([-9]);
  });
});
