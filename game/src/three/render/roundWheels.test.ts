import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadModels, model, type ModelName } from './models';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const ROUND_SIDES = { wheel: 48, metal_light: 28, rust: 16 } as const;
const DRAWN_WHEELS: readonly ModelName[] = ['wheel', 'base_semi', 'base_semi_rear', 'base_sorokonoga', 'base_sorokonoga_rear'];

type Piece = { points: THREE.Vector3[] };

function keyOf(p: THREE.Vector3): string {
  return `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
}

function piecesOf(mesh: THREE.Mesh): Piece[] {
  const pos = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const corners = index ? Array.from(index.array) : Array.from({ length: pos.count }, (_, i) => i);
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    const up = parent.get(k) ?? k;
    if (up === k) return k;
    const root = find(up);
    parent.set(k, root);
    return root;
  };
  const points = new Map<string, THREE.Vector3>();
  for (let t = 0; t < corners.length; t += 3) {
    const keys = [0, 1, 2].map((c) => {
      const p = new THREE.Vector3().fromBufferAttribute(pos, corners[t + c]);
      const k = keyOf(p);
      points.set(k, p);
      return k;
    });
    for (const k of keys.slice(1)) parent.set(find(k), find(keys[0]));
  }
  const groups = new Map<string, THREE.Vector3[]>();
  for (const [k, p] of points) groups.set(find(k), [...(groups.get(find(k)) ?? []), p]);
  return [...groups.values()].map((pts) => ({ points: pts }));
}

function isAxleDisc(piece: Piece): boolean {
  const box = new THREE.Box3().setFromPoints(piece.points);
  const size = box.getSize(new THREE.Vector3());
  return piece.points.length > 8 && Math.abs(size.x - size.y) < 0.02 * size.x;
}

function wheelSides(name: ModelName): Record<string, number[]> {
  const root = model(name);
  root.updateMatrixWorld(true);
  const sides: Record<string, number[]> = {};
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const material = (o.material as THREE.Material).name;
    if (!(material in ROUND_SIDES)) return;
    for (const piece of piecesOf(o).filter(isAxleDisc)) (sides[material] ??= []).push(piece.points.length / 2);
  });
  return sides;
}

describe('round wheels', () => {
  it.each(DRAWN_WHEELS)('%s draws every tire, rim and hub with the round rule\'s sides', (name) => {
    const sides = wheelSides(name);
    for (const [material, count] of Object.entries(ROUND_SIDES)) {
      expect(sides[material]?.length ?? 0, `${name} ${material} pieces`).toBeGreaterThan(0);
      expect(new Set(sides[material]), `${name} ${material}`).toEqual(new Set([count]));
    }
  });
});
