import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { UNPRICED_WEAPONS } from '../../data/weapons';
import { WEAPON_POOLS } from '../../render/partLooks';
import { baseTone, GUN_ACCENT, GUN_LOOK, gunRole, gunTone, lookOfGun } from './gunLook';

function partOf(materials: string[]): THREE.Group {
  const group = new THREE.Group();
  for (const name of materials) group.add(new THREE.Mesh(new THREE.BoxGeometry(), Object.assign(new THREE.MeshLambertMaterial({ color: 0xff00ff }), { name })));
  return group;
}

function looks(group: THREE.Group): [string, number][] {
  return group.children.map((o) => {
    const material = (o as THREE.Mesh).material as THREE.MeshLambertMaterial;
    return [material.name, material.color.getHex()];
  });
}

function saturation(hex: number): number {
  return new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).s;
}

describe('gunRole', () => {
  it('reads the first class of every gun', () => {
    for (const [id, gun] of Object.entries(UNPRICED_WEAPONS)) expect(gunRole(id)).toBe(gun.classes[0] ?? 'none');
  });

  it('refuses a part that is not a gun', () => {
    expect(() => gunRole('steelPlate')).toThrow(/not a weapon/);
  });
});

describe('lookOfGun', () => {
  it('paints the role color on the painted block and gunmetal on the rest', () => {
    const part = partOf(['paint', 'metal', 'metal_light', 'dark', 'brass', 'lens']);
    lookOfGun(part, 'cannon');
    expect(looks(part)).toEqual([
      [GUN_ACCENT, GUN_LOOK.role.damager],
      ['metal', GUN_LOOK.metal],
      ['metal_light', GUN_LOOK.light],
      ['dark', GUN_LOOK.dark],
      ['brass', 0xff00ff],
      ['lens', 0xff00ff],
    ]);
  });

  it('gives every role its own color', () => {
    const roles = ['chip', 'damager', 'precision'] as const;
    expect(new Set(roles.map((role) => gunTone(role, 'paint'))).size).toBe(roles.length);
  });
});

describe('baseTone', () => {
  it('keeps bases darker and grayer than the body paint', () => {
    const tan = 0x9c7a3e;
    const base = baseTone(tan, 'metal');
    if (base === null) throw new Error('A metal base part has no tone');
    expect(new THREE.Color(base).getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(new THREE.Color(tan).getHSL({ h: 0, s: 0, l: 0 }).l);
    expect(saturation(base)).toBeLessThan(saturation(tan));
  });
});

describe('weapon pools', () => {
  it('draws no scopes', () => {
    const extras = Object.values(WEAPON_POOLS).flatMap((pool) => pool.extra as string[]);
    expect(extras).not.toContain('wext_scope');
  });
});
