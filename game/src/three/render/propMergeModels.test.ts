import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadModels, NAMES, sourceParts } from './models';
import { instancedProp } from './propInstances';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const keep = (_name: string, source: THREE.Material): THREE.Material => source;

function glows(material: THREE.Material): boolean {
  return material.name === 'ship_glow' || (material as THREE.MeshLambertMaterial).emissive.getHex() !== 0;
}

describe('instancedProp over every model', () => {
  it.each(NAMES)('draws %s in one merged mesh plus one mesh per glowing part', (name) => {
    const parts = sourceParts(name);
    const lit = parts.filter((p) => glows(p.material)).length;

    const group = instancedProp(name, [new THREE.Matrix4()], keep);

    const merged = lit < parts.length ? 1 : 0;
    expect(group.children).toHaveLength(merged + lit);
    expect(group.children.length).toBeLessThanOrEqual(2);
  });
});
