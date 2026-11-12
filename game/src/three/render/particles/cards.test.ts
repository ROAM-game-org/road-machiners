import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { perfSnapshot } from '../../../perf';
import { batchesOf, CardBatch, OVERFILL_COUNTER, type Card, CLUMP_FIRST, createCardShapes, type FxCards } from './cards';
import { TUNING } from '../inkTuning';

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

describe('card shape atlas', () => {
  const CELL = 128;
  const atlas = () => {
    const alpha = new Uint8ClampedArray(CELL * 3 * CELL * 3).fill(255);
    const ctx = {
      filter: '',
      fillStyle: '',
      beginPath: () => undefined,
      arc: () => undefined,
      fill: () => undefined,
      getImageData: (left: number, top: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[(y * w + x) * 4 + 3] = alpha[(top + y) * CELL * 3 + left + x];
        return { data };
      },
      putImageData: (image: { data: Uint8ClampedArray }, left: number, top: number) => {
        for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) alpha[(top + y) * CELL * 3 + left + x] = image.data[(y * CELL + x) * 4 + 3];
      },
    };
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
    let seed = 7;
    createCardShapes(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
    vi.unstubAllGlobals();
    return alpha;
  };

  it('fades clump shapes to nothing before the cell edge and breaks their rim with grain', () => {
    const alpha = atlas();
    const firstClump = { left: (CLUMP_FIRST % 3) * CELL, top: Math.floor(CLUMP_FIRST / 3) * CELL };
    const at = (x: number, y: number) => alpha[(firstClump.top + y) * CELL * 3 + firstClump.left + x];
    for (let i = 0; i < CELL; i++) {
      expect(at(i, 0)).toBeLessThan(255 * 0.5);
      expect(at(0, i)).toBeLessThan(255 * 0.5);
    }
    expect(at(CELL / 2, CELL / 2)).toBe(255);
    const rim = Array.from({ length: 64 }, (_, i) => at(Math.round(CELL / 2 + Math.cos(i / 10) * CELL * 0.42), Math.round(CELL / 2 + Math.sin(i / 10) * CELL * 0.42)));
    expect(new Set(rim).size).toBeGreaterThan(8);
  });
});

describe('smoke batch choice', () => {
  const lit = new CardBatch(4, 'lit', new THREE.Texture(), 2);
  const other = new CardBatch(4, 'glow', new THREE.Texture(), 2);
  const smoke = new CardBatch(4, 'glow', new THREE.Texture(), 2);
  const cards: FxCards = { lit, glow: other, dust: other, bank: other, fire: other, smoke };

  function smokeBatchAt(ink: number): CardBatch {
    const was = TUNING.fxInk.value;
    TUNING.fxInk.value = ink;
    const chosen = batchesOf(cards, lit).smoke;
    TUNING.fxInk.value = was;
    return chosen;
  }

  it('sends smoke to the ink smoke batch at full ink', () => {
    expect(smokeBatchAt(1)).toBe(smoke);
  });

  it('keeps smoke in the lit batch with ink off', () => {
    expect(smokeBatchAt(0)).toBe(lit);
  });
});
