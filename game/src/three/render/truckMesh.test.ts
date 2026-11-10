import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bodyPaint, OFF_ROLE_TONES, PAINT_MATERIAL, partTone } from './truckMesh';

const TAN = 0x9c7a3e;
const RAW = 0xe03020;
const LEAST_ROLE_CHROMA = 0.08;

function chroma(hex: number): number {
  const { r, g, b } = new THREE.Color(hex);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

describe('partTone', () => {
  it('paints the paint material in the body paint on every item', () => {
    expect(partTone(PAINT_MATERIAL, RAW, TAN, true)).toBe(bodyPaint(TAN));
    expect(partTone(PAINT_MATERIAL, RAW, TAN, false)).toBe(bodyPaint(TAN));
  });

  it('turns red and rust parts into grays that no gun role color can be mistaken for', () => {
    for (const material of Object.keys(OFF_ROLE_TONES)) expect(chroma(partTone(material, RAW, TAN, true))).toBeLessThan(LEAST_ROLE_CHROMA);
  });

  it('keeps the colors of goods, which are not parts', () => {
    expect(partTone('red', RAW, TAN, false)).toBe(RAW);
    expect(partTone('rust', RAW, TAN, false)).toBe(RAW);
  });
});
