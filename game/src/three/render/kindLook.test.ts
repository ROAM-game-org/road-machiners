import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PARTS } from '../../data/parts';
import { ARMOR_LOOK } from './armorLook';
import { GUN_LOOK } from './gunLook';
import { CARGO_WOOD, itemObject, KIND_LOOK, kindTones } from './kindLook';
import { loadModels } from './models';
import { partTone, wornTone } from './truckMesh';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const TAN = 0x9c7a3e;
const CLEARLY_APART = 10;
const ids = (kind: string) => Object.values(PARTS).filter((p) => p.kind === kind).map((p) => p.id);

function materials(id: string): THREE.MeshLambertMaterial[] {
  const found: THREE.MeshLambertMaterial[] = [];
  itemObject(id).traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial) found.push(o.material);
  });
  return found;
}

function lab(hex: number): [number, number, number] {
  const { r, g, b } = new THREE.Color(hex);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function apart(a: number, b: number): number {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

describe('cargo look', () => {
  it('builds every cargo part in its own wood, which the body paint and wear leave alone', () => {
    for (const id of ids('cargo')) {
      const names = materials(id).map((m) => m.name);
      expect(names).not.toContain('paint');
      expect(names).not.toContain('metal_light');
      for (const m of materials(id).filter((m) => m.name === CARGO_WOOD)) {
        const color = m.color.getHex();
        expect(wornTone(m.name, partTone(m.name, color, TAN, true), 3, false)).toBe(color);
      }
    }
  });

  it('keeps the cargo wood clearly apart from every armor and gun color', () => {
    const neighbors = [ARMOR_LOOK.steel, ARMOR_LOOK.cage.bar, ARMOR_LOOK.ram.strip, ARMOR_LOOK.scrap.rust, ARMOR_LOOK.ceramic.dim, ARMOR_LOOK.spaced.panel, GUN_LOOK.metal, ...Object.values(GUN_LOOK.role)];
    const cargo = KIND_LOOK.cargo ?? {};
    const woods = ['paint', 'wood'].map((material) => cargo[material].color);
    for (const wood of woods) for (const n of neighbors) expect(apart(wood, n)).toBeGreaterThan(CLEARLY_APART);
  });
});

describe('scanner look', () => {
  it('has no pale metal left, so pale reads only as a precision gun', () => {
    for (const id of ids('scanner')) expect(materials(id).find((m) => m.name === 'metal_light')?.color.getHex()).toBe(GUN_LOOK.light);
  });
});

describe('kind tones', () => {
  it('leaves goods and other part kinds as their models draw them', () => {
    expect(kindTones('salt')).toBeNull();
    expect(kindTones('mg')).toBeNull();
    expect(kindTones('stockEngine')).toBeNull();
  });
});
