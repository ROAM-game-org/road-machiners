import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PAINT } from '../../data/chassis';
import { partDef, PARTS, TALL_RISE } from '../../data/parts';
import { GUN_CLEARANCE } from '../../data/weapons';
import { cellRect, highestUnder } from '../../sim/body';
import { baseGrid, isMounted, itemCells } from '../../sim/grid';
import { bare, place } from '../../test/gun-clearance-kit';
import type { GridItem } from '../../sim/types';
import { VehicleView } from './vehicle';

const CHASSIS = 'bus';
const RISE_TOLERANCE = 0.1;

function aloneOnDeck(defId: string) {
  const g = baseGrid(CHASSIS);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const { world, v } = bare(CHASSIS);
      if (!place(world, v, defId, null, x, y, 0)) continue;
      const item = v.items[v.items.length - 1];
      if (isMounted(CHASSIS, item)) return { v, item, floor: highestUnder(CHASSIS, cellRect(CHASSIS, itemCells(item))) };
    }
  }
  throw new Error(`${defId} mounts nowhere on ${CHASSIS}`);
}

function topAbove(root: THREE.Object3D, item: GridItem, floor: number): number {
  const r = cellRect(CHASSIS, itemCells(item));
  const pt = new THREE.Vector3();
  let top = -Infinity;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const p = o.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      pt.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (pt.x > r.x0 && pt.x < r.x1 && pt.z > r.z0 && pt.z < r.z1) top = Math.max(top, pt.y);
    }
  });
  return top - floor;
}

describe('fire cover heights follow the models', () => {
  it.each(Object.keys(TALL_RISE))('%s stands as high as its rise says', (defId) => {
    const { v, item, floor } = aloneOnDeck(defId);
    const view = new VehicleView(v, true, PAINT.standard, 'world');
    view.root.updateMatrixWorld(true);
    expect(Math.abs(topAbove(view.root, item, floor) - TALL_RISE[defId])).toBeLessThanOrEqual(RISE_TOLERANCE);
  });

  it('every tall part that is not a cab has a rise', () => {
    const tall = Object.keys(PARTS).filter((id) => partDef(id).tall && partDef(id).kind !== 'core');
    expect(tall.sort()).toEqual(Object.keys(TALL_RISE).sort());
  });

  it.each(Object.keys(PARTS).filter((id) => partDef(id).kind === 'weapon'))('%s head sits no lower than the gun clearance over its deck', (defId) => {
    const { v, item, floor } = aloneOnDeck(defId);
    const view = new VehicleView(v, true, PAINT.standard, 'world');
    view.root.updateMatrixWorld(true);
    const head = view.root.getObjectByName(`${item.id} head`)!;
    expect(new THREE.Box3().setFromObject(head).min.y - floor).toBeGreaterThanOrEqual(GUN_CLEARANCE);
  });
});
