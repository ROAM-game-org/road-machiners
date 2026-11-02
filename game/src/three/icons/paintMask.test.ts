import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CHASSIS } from '../../data/chassis';
import { baseModels } from '../../render/partLooks';
import { loadModels, model } from '../render/models';
import { maskedTruck } from './render';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const SLOTS = { body: 'ff0000', cab: '00ff00', gear: '0000ff' };

function baseMaterials(chassisId: string): Set<string> {
  const names = new Set<string>();
  for (const name of baseModels(chassisId)) {
    model(name).traverse((o) => {
      if (o instanceof THREE.Mesh) names.add((o.material as THREE.Material).name);
    });
  }
  return names;
}

function paintedSlots(chassisId: string): (keyof typeof SLOTS)[] {
  const materials = baseMaterials(chassisId);
  return [...(materials.has('paint') ? (['body'] as const) : []), ...(materials.has('trim') ? (['cab'] as const) : []), 'gear'];
}

function drawnColors(root: THREE.Object3D): Set<string> {
  const seen = new Set<string>();
  const color = new THREE.Color();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    const material = o.material as THREE.MeshBasicMaterial;
    if (!material.vertexColors) {
      seen.add(material.color.getHexString());
      return;
    }
    const colors = o.geometry.getAttribute('color');
    for (let i = 0; i < colors.count; i++) seen.add(color.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i)).getHexString());
  });
  return seen;
}

describe('the chassis paint mask', () => {
  it.each(Object.keys(CHASSIS))('%s marks each painted body, cab trim and gear in its slot color', (id) => {
    const seen = drawnColors(maskedTruck(id));
    expect(paintedSlots(id).filter((slot) => !seen.has(SLOTS[slot]))).toEqual([]);
  });
});
