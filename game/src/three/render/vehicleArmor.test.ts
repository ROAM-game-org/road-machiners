import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../../data/chassis';
import { isShield, PARTS } from '../../data/parts';
import { TRUCK_LOOK } from '../../render/partLooks';
import { itemLookId, partModel } from '../../render/partLooks';
import { bodyOf, cellRect, restOn, unitBody } from '../../sim/body';
import { baseGrid, isMounted, itemCells, placementError, plateSide } from '../../sim/grid';
import type { GridItem } from '../../sim/types';
import { loadModels, model } from './models';
import { armorPlacement, footprint, wouldFloat } from './vehicle';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const ARMOR = Object.values(PARTS).filter(isShield);
const EPS = 1e-6;
const LOOSE_PARTS = ['panniers', 'rack', 'trailerBox'];

type PartItem = Extract<GridItem, { kind: 'part' }>;

function mountedArmor(chassisId: string): PartItem[] {
  const { w, h } = baseGrid(chassisId);
  const out: PartItem[] = [];
  for (const def of ARMOR) {
    for (const rot of [0, 1] as const) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const item = { id: 'g', kind: 'part', x, y, rot, part: { id: 'p', defId: def.id, hp: 1, wear: 0 } } as unknown as PartItem;
          if (isMounted(chassisId, item)) out.push(item);
        }
      }
    }
  }
  return out;
}

function placedBox(chassisId: string, item: PartItem): THREE.Box3 {
  const obj = model(partModel(item.part.defId));
  const placement = armorPlacement({ chassisId }, item, new THREE.Box3().setFromObject(obj));
  obj.position.copy(placement.pos);
  obj.rotation.set(0, placement.yaw, 0);
  obj.scale.copy(placement.scale);
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
}

function overhangOf(box: THREE.Box3, half: { x: number; z: number }): number {
  return Math.max(0, box.max.x - half.x, -half.x - box.min.x, box.max.z - half.z, -half.z - box.min.z);
}

describe('mounted armor', () => {
  it.each(Object.keys(CHASSIS))('%s: every armor part sits with its inner face at the body face minus the inset, and every accessory one armor depth further out', (id) => {
    const problems: string[] = [];
    const items = mountedArmor(id);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const body = unitBody(id, cellRect(id, itemCells(item)).unit);
      const side = plateSide(id, item);
      const box = placedBox(id, item);
      const label = `${item.part.defId} rot ${item.rot} at ${item.x},${item.y} side ${side}`;
      const faces = { F: [box.min.x, body.half.x], B: [-box.max.x, body.half.x], R: [box.min.z, body.half.z], L: [-box.max.z, body.half.z] }[side];
      const over = PARTS[item.part.defId].kind === 'accessory' ? TRUCK_LOOK.armorDepth : 0;
      const inner = faces[1] - TRUCK_LOOK.armorInset + over;
      if (Math.abs(faces[0] - inner) > EPS) problems.push(`${label}: inner face ${faces[0].toFixed(3)}, expected ${inner.toFixed(3)}`);
      const depth = side === 'F' || side === 'B' ? box.max.x - box.min.x : box.max.z - box.min.z;
      if (depth < TRUCK_LOOK.armorDepth - EPS) problems.push(`${label}: ${depth.toFixed(3)} m deep, under ${TRUCK_LOOK.armorDepth}`);
    }
    expect(problems).toEqual([]);
  });

  it('raises every armor part by the rise over the body top, or over the body bottom for a ram', () => {
    const id = 'scout';
    const half = bodyOf(id).half.y;
    for (const item of mountedArmor(id)) {
      const def = PARTS[item.part.defId];
      if (!isShield(def)) continue;
      const box = placedBox(id, item);
      const raw = new THREE.Box3().setFromObject(model(partModel(def.id)));
      if (def.look === 'ram') expect(box.min.y, def.id).toBeCloseTo(-half + TRUCK_LOOK.armorRise + raw.min.y, 5);
      else expect(box.max.y, def.id).toBeCloseTo(half + TRUCK_LOOK.armorRise, 5);
    }
  });

  it.each(Object.keys(CHASSIS))('%s: no loose part or good reaches into armor by more than the inset plus its own overhang past the body', (id) => {
    const grid = baseGrid(id);
    const armor = mountedArmor(id).map((item) => ({ box: placedBox(id, item), unit: cellRect(id, itemCells(item)).unit, cells: new Set(itemCells(item).map((c) => `${c.x},${c.y}`)) }));
    const looks: GridItem[] = [];
    for (let y = 0; y < grid.chassisH; y++) {
      for (let x = 0; x < grid.w; x++) {
        for (const rot of [0, 1] as const) {
          for (const defId of LOOSE_PARTS) looks.push({ id: 'g', kind: 'part', x, y, rot, part: { id: 'p', defId, hp: 1, wear: 0 } } as unknown as GridItem);
          looks.push({ id: 'g', kind: 'good', x, y, rot, good: 'scrap' } as GridItem);
        }
      }
    }
    let worst = 0;
    let checked = 0;
    for (const item of looks) {
      if (placementError(grid, [], item, null) || wouldFloat({ chassisId: id }, item)) continue;
      checked++;
      const at = footprint({ chassisId: id }, item, restOn(id, cellRect(id, itemCells(item))).y);
      const drawn = new THREE.Box3().setFromObject(model(partModel(itemLookId(item)))).applyMatrix4(new THREE.Matrix4().compose(at.pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, at.yaw, 0)), at.scale));
      const mine = itemCells(item).map((c) => `${c.x},${c.y}`);
      const unit = cellRect(id, itemCells(item)).unit;
      for (const a of armor.filter((o) => o.unit === unit && !mine.some((k) => o.cells.has(k)))) {
        const reach = Math.min(drawn.max.x - a.box.min.x, a.box.max.x - drawn.min.x, drawn.max.z - a.box.min.z, a.box.max.z - drawn.min.z, drawn.max.y - a.box.min.y, a.box.max.y - drawn.min.y);
        worst = Math.max(worst, reach - overhangOf(drawn, unitBody(id, unit).half));
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(TRUCK_LOOK.armorInset + EPS);
  });

  it('has every armor model thin along its local x axis', () => {
    for (const def of ARMOR) {
      const box = new THREE.Box3().setFromObject(model(partModel(def.id)));
      expect(box.max.x - box.min.x, def.id).toBeLessThan(box.max.z - box.min.z);
    }
  });
});
