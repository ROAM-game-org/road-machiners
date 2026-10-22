import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PAINT } from '../../data/chassis';
import { partDef } from '../../data/parts';
import { cellRect } from '../../sim/body';
import { isMounted, itemCells } from '../../sim/grid';
import type { GridItem, Vehicle } from '../../sim/types';
import { SLOW } from '../../test/gun-clearance-kit';
import { standardWorld } from '../../test/world-cache';
import { SURFACE_ATLAS } from './models';
import { VehicleView } from './vehicle';

SURFACE_ATLAS.value = new THREE.Texture();

const NEAR = 0.02;

describe('inset guns', () => {
  it('fire from the drawn barrel and anchor at the drawn head after the stand moves them off their cells', { timeout: SLOW }, () => {
    let moved = 0;
    for (const v of standardWorld(1337).vehicles) moved += insetGuns(structuredClone(v));
    expect(moved).toBeGreaterThan(0);
  });
});

function insetGuns(v: Vehicle): number {
  const view = new VehicleView(v, true, PAINT.standard, 'world');
  view.root.updateMatrixWorld(true);
  const guns = v.items.filter((it): it is Extract<GridItem, { kind: 'part' }> => it.kind === 'part' && partDef(it.part.defId).kind === 'weapon' && isMounted(v.chassisId, it));
  let moved = 0;
  for (const gun of guns) {
    const head = view.root.getObjectByName(`${gun.id} head`);
    if (!head) throw new Error(`No drawn head for ${gun.part.defId} on ${v.id}`);
    const box = new THREE.Box3().setFromObject(head).expandByScalar(NEAR);
    const muzzle = view.muzzle(gun.part.id).pos;
    expect(box.containsPoint(new THREE.Vector3(muzzle.x, muzzle.y, muzzle.z)), `${v.id} ${gun.part.defId} muzzle`).toBe(true);
    const anchor = view.partPoint(gun.part.id);
    const at = head.getWorldPosition(new THREE.Vector3());
    expect(at.distanceTo(new THREE.Vector3(anchor.x, anchor.y, anchor.z)), `${v.id} ${gun.part.defId} anchor`).toBeLessThan(1e-6);
    const cells = cellRect(v.chassisId, itemCells(gun));
    if (cells.unit === 0 && Math.abs(at.z - (cells.z0 + cells.z1) / 2) > NEAR) moved++;
  }
  return moved;
}
