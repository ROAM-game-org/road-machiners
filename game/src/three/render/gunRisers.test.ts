
import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../../data/chassis';
import { PARTS } from '../../data/parts';
import { CLIP_TOLERANCE, cellRect, highestUnder, restOn } from '../../sim/body';
import { baseGrid, isMounted, itemCells } from '../../sim/grid';
import type { GridItem } from '../../sim/types';
import { loadModels, model } from './models';
import { baseModel, partModel } from '../../render/partLooks';
import * as THREE from 'three';
import { postColumn } from './gunStand';
import { armorPlacement, footprint, standingY, weaponStand, wouldFloat } from './vehicle';
import { budget } from '../../test/budget';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const GUNS = Object.values(PARTS).filter((def) => def.kind === 'weapon');

const BASES = new Map<string, THREE.Object3D>();

function baseUnder(id: string, item: GridItem): THREE.Object3D {
  const unit = cellRect(id, itemCells(item)).unit;
  const key = `${id}:${unit}`;
  if (!BASES.has(key)) BASES.set(key, model(baseModel(id, unit)));
  return BASES.get(key) as THREE.Object3D;
}

describe('gun risers', () => {
  it.each(Object.keys(CHASSIS))('%s: a gun on any deck spot stands on the model or on a post that does', (id) => {
    const cells = baseGrid(id).cells;
    const problems: string[] = [];
    for (const def of GUNS) {
      for (const rot of [0, 1] as const) {
        for (let y = 0; y < cells.length; y++) {
          for (let x = 0; x < cells[y].length; x++) {
            const item = { id: 'g', kind: 'part', x, y, rot, part: { id: 'p', defId: def.id, hp: 1, wear: 0 } } as unknown as GridItem;
            if (!itemCells(item).every((c) => cells[c.y]?.[c.x] === 'D')) continue;
            const { at: { pos }, bottom, top, plate } = weaponStand({ chassisId: id }, item, baseUnder(id, item));
            const rect = cellRect(id, itemCells(item));
            const label = `${def.id} rot ${rot} at ${x},${y}`;
            const surface = highestUnder(id, postColumn(pos, rect.unit));
            if (!Number.isFinite(surface)) problems.push(`${label}: no surface under the post`);
            else if (bottom - surface > CLIP_TOLERANCE) problems.push(`${label}: base ${bottom.toFixed(2)} over surface ${surface.toFixed(2)}`);
            else if (bottom < top && Math.abs(bottom - surface) > 1e-9) problems.push(`${label}: post starts at ${bottom.toFixed(2)} over surface ${surface.toFixed(2)}`);
            if (bottom > top) problems.push(`${label}: post starts at ${bottom.toFixed(2)} above its mount at ${top.toFixed(2)}`);
            const under = highestUnder(id, plate);
            if (Number.isFinite(under) && top < under - 1e-9) problems.push(`${label}: mount at ${top.toFixed(2)} below the surface ${under.toFixed(2)} under its plate`);
            const reach = { x: (plate.x1 - plate.x0) / 2, z: (plate.z1 - plate.z0) / 2 };
            if (pos.x < rect.x0 - reach.x || pos.x > rect.x1 + reach.x || pos.z < rect.z0 - reach.z || pos.z > rect.z1 + reach.z) problems.push(`${label}: post at ${pos.x.toFixed(2)},${pos.z.toFixed(2)} is more than half a plate outside its rect`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

function eachPlacement(visit: (id: string, def: (typeof PARTS)[string], item: GridItem, label: string) => void, kind: string): void {
  const defs = Object.values(PARTS).filter((p) => p.kind === kind);
  for (const id of Object.keys(CHASSIS)) {
    const { w, h, cells } = baseGrid(id);
    for (const def of defs) {
      for (let y = 0; y + def.h <= h; y++) {
        for (let x = 0; x + def.w <= w; x++) {
          const item = { id: 'g', kind: 'part', x, y, rot: 0, part: { id: 'p', defId: def.id, hp: 1, wear: 0 } } as unknown as GridItem;
          if (!itemCells(item).every((c) => cells[y + (c.y - y)]?.[c.x])) continue;
          visit(id, def, item, `${def.id} on ${id} at ${x},${y}`);
        }
      }
    }
  }
}

describe('parts that are always drawn', () => {
  it('never hides a weapon or mounted armor for lack of a surface, on any chassis and cell', () => {
    const hidden: string[] = [];
    const check = (id: string, _d: unknown, item: GridItem, label: string) => {
      if (item.kind === 'part' && partDefKind(item) === 'armor' && !isMounted(id, item)) return;
      if (wouldFloat({ chassisId: id }, item)) hidden.push(label);
    };
    eachPlacement(check, 'weapon');
    eachPlacement(check, 'armor');
    expect(hidden).toEqual([]);
  });
});

function partDefKind(item: GridItem): string {
  return item.kind === 'part' ? PARTS[item.part.defId].kind : '';
}

describe('spare armor', () => {
  const spare = (id: string, item: GridItem) => !isMounted(id, item);

  it('is hidden exactly when it has no surface to rest on', () => {
    const wrong: string[] = [];
    eachPlacement((id, _d, item, label) => {
      if (!spare(id, item)) return;
      if (wouldFloat({ chassisId: id }, item) !== restOn(id, cellRect(id, itemCells(item))).perched) wrong.push(label);
    }, 'armor');
    expect(wrong).toEqual([]);
  });

  it('is drawn inside its rest rect', () => {
    let checked = 0;
    const out: string[] = [];
    eachPlacement((id, def, item, label) => {
      if (!spare(id, item) || wouldFloat({ chassisId: id }, item)) return;
      if (item.kind !== 'part') return;
      checked++;
      let placement;
      try {
        const obj = model(partModel(def.id));
        placement = armorPlacement({ chassisId: id }, item, new THREE.Box3().setFromObject(obj));
        obj.position.copy(placement.pos);
        obj.rotation.set(0, placement.yaw, 0);
        obj.scale.copy(placement.scale);
        obj.updateMatrixWorld(true);
        const drawn = new THREE.Box3().setFromObject(obj);
        const rect = restOn(id, cellRect(id, itemCells(item))).rect;
        const tol = CLIP_TOLERANCE;
        if (drawn.min.x < rect.x0 - tol || drawn.max.x > rect.x1 + tol || drawn.min.z < rect.z0 - tol || drawn.max.z > rect.z1 + tol) out.push(`${label} drawn ${drawn.min.x.toFixed(2)}..${drawn.max.x.toFixed(2)} x ${drawn.min.z.toFixed(2)}..${drawn.max.z.toFixed(2)} rect ${rect.x0.toFixed(2)}..${rect.x1.toFixed(2)} x ${rect.z0.toFixed(2)}..${rect.z1.toFixed(2)}`);
      } catch (e) {
        out.push(`${label} threw ${String(e)}`);
      }
    }, 'armor');
    expect(checked).toBeGreaterThan(100);
    expect(out).toEqual([]);
  });
});

describe('placing any item on any cell', () => {
  it('never throws and always gives a finite spot, on every chassis, ring cell included', () => {
    const problems: string[] = [];
    for (const id of Object.keys(CHASSIS)) {
      const { w, h, cells } = baseGrid(id);
      const shapes = [...new Map(Object.values(PARTS).map((def) => [`${def.kind}${def.w}x${def.h}`, def])).values()];
      const items = [
        ...shapes.map((def) => ({ label: def.id, item: (x: number, y: number, rot: 0 | 1) => ({ id: 'g', kind: 'part', x, y, rot, part: { id: 'p', defId: def.id, hp: 1, wear: 0 } }) })),
        { label: 'good', item: (x: number, y: number, rot: 0 | 1) => ({ id: 'g', kind: 'good', x, y, rot, good: 'scrap' }) },
      ];
      for (const { label, item } of items) {
        for (const rot of [0, 1] as const) {
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const it = item(x, y, rot) as unknown as GridItem;
              if (!itemCells(it).every((c) => cells[c.y]?.[c.x])) continue;
              const where = `${label} rot ${rot} at ${x},${y} on ${id}`;
              try {
                wouldFloat({ chassisId: id }, it);
                const y0 = standingY({ chassisId: id }, it);
                const at = footprint({ chassisId: id }, it, y0);
                if (![y0, at.pos.x, at.pos.z, at.scale.x, at.scale.z].every(Number.isFinite)) problems.push(`${where}: not finite`);
                if (label !== 'good' && PARTS[label].kind === 'weapon') {
                  const { bottom, top } = weaponStand({ chassisId: id }, it, baseUnder(id, it));
                  if (![bottom, top].every(Number.isFinite)) problems.push(`${where}: stand not finite`);
                }
              } catch (e) {
                problems.push(`${where}: ${(e as Error).message}`);
              }
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  }, budget(120_000));
});

const UNRESTABLE: Record<string, string[]> = {
  lincoln: ['amRifle rot 0 at 4,3', 'recoilless rot 0 at 4,3', 'battleRifle rot 0 at 4,3'],
};

describe('guns on the issue 149 chassis', () => {
  it.each(['lincoln', 'niva', 'bukhanka'])('%s: every gun spot on deck cells rests on the model', (id) => {
    const cells = baseGrid(id).cells;
    const perched: string[] = [];
    for (const def of GUNS) {
      for (const rot of [0, 1] as const) {
        for (let y = 0; y < cells.length; y++) {
          for (let x = 0; x < cells[y].length; x++) {
            const item = { id: 'g', kind: 'part', x, y, rot, part: { id: 'p', defId: def.id, hp: 1, wear: 0 } } as unknown as GridItem;
            const spot = itemCells(item);
            if (!spot.every((c) => cells[c.y]?.[c.x] === 'D')) continue;
            if (restOn(id, cellRect(id, spot)).perched) perched.push(`${def.id} rot ${rot} at ${x},${y}`);
          }
        }
      }
    }
    expect(perched).toEqual(UNRESTABLE[id] ?? []);
  });
});
