import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../data/chassis';
import { WEAR_LOOK_STEPS } from '../../render/partLooks';
import { bodyPaint, CHAR, CHAR_SHARE, charShare, OFF_ROLE_TONES, PAINT_MATERIAL, partTone, wornTone } from './truckMesh';

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

describe('wornTone', () => {
  const LAST_WORN = WEAR_LOOK_STEPS - 1;
  const charMix = (hex: number, share: number): number => new THREE.Color(hex).lerp(new THREE.Color(CHAR), share).getHex();
  const lightness = (hex: number): number => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l;
  const paints = Object.values(PALETTE).map(bodyPaint);

  it('reaches the char share at the last worn step and goes past it when broken', () => {
    expect(charShare(0)).toBe(0);
    expect(charShare(LAST_WORN)).toBeCloseTo(CHAR_SHARE);
    expect(charShare(WEAR_LOOK_STEPS)).toBeGreaterThan(CHAR_SHARE);
  });

  it('darkens paint and rust at every wear step and never lightens them', () => {
    for (const material of [PAINT_MATERIAL, ...Object.keys(OFF_ROLE_TONES)]) {
      for (const paint of paints) {
        const tones = [0, 1, 2, LAST_WORN].map((step) => wornTone(material, paint, step, false));
        tones.push(wornTone(material, paint, WEAR_LOOK_STEPS, true));
        for (let i = 1; i < tones.length; i++) expect(lightness(tones[i])).toBeLessThan(lightness(tones[i - 1]));
      }
    }
  });

  it('keeps trim, under, armor, ram, metal and tires unchanged while the part works', () => {
    for (const material of ['trim', 'under', 'armor', 'ram', 'metal', 'tire']) expect(wornTone(material, RAW, LAST_WORN, false)).toBe(RAW);
  });

  it('chars every material of a broken part past the last worn look', () => {
    for (const material of [PAINT_MATERIAL, 'trim', 'under', 'armor', 'ram', 'metal']) {
      expect(wornTone(material, RAW, WEAR_LOOK_STEPS, true)).toBe(charMix(RAW, charShare(WEAR_LOOK_STEPS)));
    }
  });
});
