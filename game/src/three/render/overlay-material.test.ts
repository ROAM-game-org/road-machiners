import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { overlayMaterial } from './overlay-material';

const THREE_DIR = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

function closingIndex(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth += 1;
    if (text[i] === ')' && --depth === 0) return i;
  }
  return text.length;
}

function twoPassLiterals(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const found: string[] = [];
  for (const match of text.matchAll(/new THREE\.MeshBasicMaterial\(/g)) {
    const open = match.index + match[0].length - 1;
    const literal = text.slice(open, closingIndex(text, open));
    if (literal.includes('transparent: true') && literal.includes('THREE.DoubleSide')) found.push(`${path}:${text.slice(0, open).split('\n').length}`);
  }
  return found;
}

describe('overlayMaterial', () => {
  it('draws in one pass and keeps every other param', () => {
    const material = overlayMaterial({
      color: 0x7cc85a, opacity: 0.4, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, stencilWrite: true, stencilRef: 4, stencilFunc: THREE.NotEqualStencilFunc,
    });
    expect(material).toMatchObject({
      transparent: true, side: THREE.DoubleSide, forceSinglePass: true, opacity: 0.4, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      stencilWrite: true, stencilRef: 4, stencilFunc: THREE.NotEqualStencilFunc,
    });
    expect(material.color.getHex()).toBe(0x7cc85a);
  });

  it('refuses a map or vertex colors, since triangle order would then change the picture', () => {
    expect(() => overlayMaterial({ map: new THREE.Texture() })).toThrow('one pass');
    expect(() => overlayMaterial({ vertexColors: true })).toThrow('one pass');
  });

  it('is the only way the views build a translucent double-sided material', () => {
    const owner = join(THREE_DIR, 'render', 'overlay-material.ts');
    const offenders = sourceFiles(THREE_DIR).filter((path) => path !== owner).flatMap(twoPassLiterals);
    expect(offenders).toEqual([]);
  });
});
