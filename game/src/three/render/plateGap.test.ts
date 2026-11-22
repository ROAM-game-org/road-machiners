import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PLAYER_CHASSIS } from '../../data/chassis';
import { isShield, PARTS } from '../../data/parts';
import { baseModel, partModel } from '../../render/partLooks';
import { bareVehicle } from '../../sim/factory';
import { cellRect, CLIP_TOLERANCE } from '../../sim/body';
import { gridOf, itemCells, mountSpots } from '../../sim/grid';
import type { GridItem } from '../../sim/types';
import { drawnArmorPlacement, poseArmor } from './armorCut';
import { armorSkinX } from './armorLook';
import { bodyFace, FACE_COLUMN, faceProfile } from './gunStand';
import { loadModels, model } from './models';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const PLATES = Object.values(PARTS).filter(isShield).filter((def) => def.kind !== 'accessory' && def.look === 'plates');
const SIDES = ['R', 'L'] as const;
const TYPICAL_AIR = CLIP_TOLERANCE;
const VISIBLE_AIR = 0.03;
const cases = () => PLAYER_CHASSIS.flatMap((id) => PLATES.map((def) => [id, def.id] as const));

type PartItem = Extract<GridItem, { kind: 'part' }>;

function airUnder(chassisId: string, defId: string, side: 'R' | 'L'): number[] {
  const v = bareVehicle({ nextId: 1 }, { faction: 'player', chassisId, pos: { x: 0, y: 0 }, heading: 0, brain: null });
  const blank = { id: 'plate', kind: 'part', x: 0, y: 0, rot: 0, part: { id: 'plate-part', defId, hp: 1, wear: 0 } } as unknown as PartItem;
  return mountSpots(gridOf(v), v.items, blank, [side]).flatMap((spot) => {
    const item = { ...blank, ...spot } as PartItem;
    const base = model(baseModel(chassisId, cellRect(chassisId, itemCells(item)).unit));
    base.updateMatrixWorld(true);
    const drawn = model(partModel(defId));
    drawn.updateMatrixWorld(true);
    const at = drawnArmorPlacement({ chassisId, items: [item] }, item, new THREE.Box3().setFromObject(drawn), base);
    poseArmor(drawn, at);
    drawn.updateMatrixWorld(true);
    return rowAir(drawn, base, side);
  });
}

function rowAir(drawn: THREE.Object3D, base: THREE.Object3D, side: 'R' | 'L'): number[] {
  const outward = side === 'R' ? 1 : -1;
  const points: THREE.Vector3[] = [];
  drawn.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
  });
  const lateral: [number, number] = [Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x))];
  const profile = faceProfile(base, 'z', outward, lateral);
  const inner = new Map<number, number>();
  for (const p of points) {
    const row = Math.floor((p.y - profile.bottom) / FACE_COLUMN);
    inner.set(row, Math.min(inner.get(row) ?? Infinity, outward * p.z));
  }
  return [...inner].flatMap(([row, face]) => {
    const reach = profile.reach[row];
    return reach === null || reach === undefined ? [] : [face - reach];
  });
}

function spotAirs(chassisId: string, defId: string, side: 'R' | 'L'): number[][] {
  const v = bareVehicle({ nextId: 1 }, { faction: 'player', chassisId, pos: { x: 0, y: 0 }, heading: 0, brain: null });
  const blank = { id: 'plate', kind: 'part', x: 0, y: 0, rot: 0, part: { id: 'plate-part', defId, hp: 1, wear: 0 } } as unknown as PartItem;
  const outward = side === 'R' ? 1 : -1;
  return mountSpots(gridOf(v), v.items, blank, [side]).map((spot) => {
    const item = { ...blank, ...spot } as PartItem;
    const base = model(baseModel(chassisId, cellRect(chassisId, itemCells(item)).unit));
    base.updateMatrixWorld(true);
    const drawn = model(partModel(defId));
    drawn.updateMatrixWorld(true);
    const raw = new THREE.Box3().setFromObject(drawn);
    const at = drawnArmorPlacement({ chassisId, items: [item] }, item, raw, base);
    poseArmor(drawn, at);
    drawn.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(drawn);
    const inner = (outward > 0 ? b.min.z : b.max.z) + outward * (armorSkinX(defId) - raw.min.x) * at.scale.x;
    const slices = 6;
    return Array.from({ length: slices }, (_, i) => {
      const lo = b.min.x + ((b.max.x - b.min.x) * i) / slices;
      const face = bodyFace(base, 'z', outward, [lo, lo + (b.max.x - b.min.x) / slices], [b.min.y, b.max.y]);
      return face === null ? 0 : outward * (inner - face);
    });
  });
}

describe('mounted side plates', () => {
  it('the scout ceramic plate beside the cab leaves no row more than 3 cm off the narrower hull row', () => {
    const [airs] = spotAirs('scout', 'ceramicPlates', 'R');
    expect(Math.max(...airs)).toBeLessThanOrEqual(VISIBLE_AIR);
  });

  it.each(cases())('%s %s has its skin within 5 cm of the hull wall over most of its rows', (chassisId, defId) => {
    const all = SIDES.flatMap((side) => airUnder(chassisId, defId, side)).sort((a, b) => a - b);
    const typical = all[Math.floor(all.length / 2)] ?? 0;
    expect(typical).toBeLessThanOrEqual(TYPICAL_AIR);
  });
});
