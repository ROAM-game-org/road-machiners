import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { UNPRICED_WEAPONS } from '../../data/weapons';
import { WEAPON_POOLS, type WeaponLook } from '../../render/partLooks';
import '../../test/gun-clearance-kit';
import { weaponHead } from './weaponHead';

const SLACK = 0.05;

function looksOf(defId: string): WeaponLook[] {
  const pool = WEAPON_POOLS[defId];
  const extras = pool.extra.length === 0 ? [null] : pool.extra;
  return pool.mount.flatMap((mount) => pool.receiver.flatMap((receiver) => pool.barrel.flatMap((barrel) => extras.map((extra) => ({ mount, receiver, barrel, extra })))));
}

function farthest(defId: string): number {
  let far = 0;
  const p = new THREE.Vector3();
  for (const look of looksOf(defId)) {
    const { head } = weaponHead(look);
    head.updateMatrixWorld(true);
    head.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const pos = o.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        far = Math.max(far, Math.hypot(p.x, p.z));
      }
    });
  }
  return far;
}

describe('weapon reach', () => {
  it.each(Object.keys(UNPRICED_WEAPONS))('%s reaches as far as its farthest resting head point and no more than 5 cm further', (defId) => {
    const far = farthest(defId);
    const reach = UNPRICED_WEAPONS[defId].reach;
    expect(reach).toBeGreaterThanOrEqual(far - 1e-6);
    expect(reach).toBeLessThanOrEqual(far + SLACK);
  });
});
