import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadModels, SURFACE_ATLAS } from '../render/models';
import { maskedTruck } from './render';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});
SURFACE_ATLAS.value = new THREE.Texture();

function maskColors(root: THREE.Object3D): Set<number> {
  const seen = new Set<number>();
  const color = new THREE.Color();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    const material = o.material as THREE.MeshBasicMaterial;
    if (!material.vertexColors) {
      seen.add(material.color.getHex());
      return;
    }
    const colors = o.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < colors.count; i++) seen.add(color.fromBufferAttribute(colors, i).getHex());
  });
  return seen;
}

describe('chassis paint mask', () => {
  it.each(['courier', 'scout', 'van'])('%s shows its body in red, its cab in green and its gear in blue', (id) => {
    const seen = maskColors(maskedTruck(id));
    expect([0xff0000, 0x00ff00, 0x0000ff].filter((c) => !seen.has(c)).map((c) => c.toString(16))).toEqual([]);
  });
});
