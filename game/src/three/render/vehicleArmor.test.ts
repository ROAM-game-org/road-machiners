import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../../data/chassis';
import { isShield, PARTS } from '../../data/parts';
import { TRUCK_LOOK } from '../../render/partLooks';
import { baseModel, itemLookId, partModel } from '../../render/partLooks';
import { bodyOf, cellRect, CLIP_TOLERANCE, restOn, unitBody } from '../../sim/body';
import { baseGrid, isMounted, itemCells, placementError, plateSide } from '../../sim/grid';
import type { GridItem } from '../../sim/types';
import { loadModels, model } from './models';
import { armorPlacement } from './armorCut';
import { footprint, wouldFloat } from './vehicle';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const ARMOR = Object.values(PARTS).filter(isShield);
const EPS = 1e-6;
const LOOSE_PARTS = ['panniers', 'rack', 'trailerBox'];
const PROBE = 0.1;
const FAR = 20;

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

function plateUnder(item: PartItem): PartItem {
  const [cell] = itemCells(item);
  return { ...item, id: 'under', x: cell.x, y: cell.y, rot: 0, part: { id: 'under', defId: 'steelPlate', hp: 1, wear: 0 } };
}

function placedBox(chassisId: string, item: PartItem, items: GridItem[] = []): THREE.Box3 {
  const obj = model(partModel(item.part.defId));
  const placement = armorPlacement({ chassisId, items }, item, new THREE.Box3().setFromObject(obj), model(baseModel(chassisId, cellRect(chassisId, itemCells(item)).unit)));
  obj.position.copy(placement.pos);
  obj.rotation.set(0, placement.yaw, 0);
  obj.scale.copy(placement.scale);
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
}

function innerFace(box: THREE.Box3, side: string): number {
  return { F: box.min.x, B: -box.max.x, R: box.min.z, L: -box.max.z }[side] as number;
}

function bodyHalf(half: { x: number; z: number }, side: string): number {
  return side === 'F' || side === 'B' ? half.x : half.z;
}

function outermostBody(chassisId: string, item: PartItem, box: THREE.Box3, side: string): number {
  const base = model(baseModel(chassisId, cellRect(chassisId, itemCells(item)).unit));
  base.updateMatrixWorld(true);
  const across = side === 'F' || side === 'B';
  const outward = side === 'F' || side === 'R' ? 1 : -1;
  const dir = across ? new THREE.Vector3(-outward, 0, 0) : new THREE.Vector3(0, 0, -outward);
  const [lo, hi] = across ? [box.min.z, box.max.z] : [box.min.x, box.max.x];
  let best = -Infinity;
  for (let u = lo + PROBE / 2; u < hi; u += PROBE) {
    for (let y = box.min.y + PROBE / 2; y < box.max.y; y += PROBE) {
      const from = across ? new THREE.Vector3(outward * FAR, y, u) : new THREE.Vector3(u, y, outward * FAR);
      const hit = new THREE.Raycaster(from, dir).intersectObject(base, true)[0];
      if (hit) best = Math.max(best, outward * (across ? hit.point.x : hit.point.z));
    }
  }
  return best;
}

function overhangOf(box: THREE.Box3, half: { x: number; z: number }): number {
  return Math.max(0, box.max.x - half.x, -half.x - box.min.x, box.max.z - half.z, -half.z - box.min.z);
}

describe('mounted armor', () => {
  it.each(Object.keys(CHASSIS))('%s: every armor part sits with its inner face no deeper than the body face minus the inset, touching the real body, and every accessory one armor depth further out only over armor', (id) => {
    const problems: string[] = [];
    const items = mountedArmor(id);
    expect(items.length).toBeGreaterThan(0);
    const cases = items.flatMap((item) => (PARTS[item.part.defId].kind === 'accessory' ? [{ item, under: [plateUnder(item)] }, { item, under: [] }] : [{ item, under: [] }]));
    for (const { item, under } of cases) {
      const body = unitBody(id, cellRect(id, itemCells(item)).unit);
      const side = plateSide(id, item);
      const box = placedBox(id, item, under);
      const label = `${item.part.defId} rot ${item.rot} at ${item.x},${item.y} side ${side} over ${under.length} plates`;
      const over = under.length ? TRUCK_LOOK.armorDepth : 0;
      const inner = innerFace(box, side) - over;
      const snug = bodyHalf(body.half, side) - TRUCK_LOOK.armorInset;
      if (inner > snug + EPS) problems.push(`${label}: inner face ${inner.toFixed(3)} past ${snug.toFixed(3)}`);
      const gap = inner - outermostBody(id, item, box, side);
      if (gap > CLIP_TOLERANCE) problems.push(`${label}: ${gap.toFixed(3)} m of air between armor and body`);
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
    const armor = mountedArmor(id).map((item) => {
      const box = placedBox(id, item);
      const unit = cellRect(id, itemCells(item)).unit;
      const side = plateSide(id, item);
      const sunk = bodyHalf(unitBody(id, unit).half, side) - TRUCK_LOOK.armorInset - innerFace(box, side);
      return { box, unit, sunk, cells: new Set(itemCells(item).map((c) => `${c.x},${c.y}`)) };
    });
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
        worst = Math.max(worst, reach - overhangOf(drawn, unitBody(id, unit).half) - a.sunk);
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
