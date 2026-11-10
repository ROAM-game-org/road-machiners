import * as THREE from 'three';
import { partDef, type WeaponClass } from '../../data/parts';
import type { WeaponLook } from '../../render/partLooks';
import { model, type ModelName } from './models';
import { bodyPaint } from './truckMesh';
import { weaponHead } from './weaponHead';

export type GunRole = WeaponClass | 'none';

export const GUN_LOOK = {
  metal: 0x4b5157,
  light: 0x5a6168,
  dark: 0x2b2f33,
  role: { chip: 0xa8683e, damager: 0x8e3b37, precision: 0xa4acab, none: 0x4b5157 } satisfies Record<GunRole, number>,
  base: { neutral: 0x8a8c8e, paintShare: 0.35, body: 0.62, dark: 0.45 },
};

export const GUN_ACCENT = 'trim';
export const GUN_BASE = 'under';

const OWN_COLOR = new Set(['glass', 'light', 'glow', 'lens', 'warhead', 'brass', 'wire', 'sign', 'sign_red', 'sign_green', 'mustard']);
const METAL: Record<string, number> = { metal: GUN_LOOK.metal, metal_light: GUN_LOOK.light, dark: GUN_LOOK.dark, rust: GUN_LOOK.dark };

export function gunRole(defId: string): GunRole {
  const def = partDef(defId);
  if (def.kind !== 'weapon') throw new Error(`Part ${defId} is not a weapon`);
  return def.classes[0] ?? 'none';
}

export function gunTone(role: GunRole, material: string): number | null {
  if (OWN_COLOR.has(material)) return null;
  if (material === 'paint') return GUN_LOOK.role[role];
  return METAL[material] ?? GUN_LOOK.metal;
}

export function lookOfGun(obj: THREE.Object3D, defId: string): void {
  const role = gunRole(defId);
  eachLambert(obj, (material) => {
    const tone = gunTone(role, material.name);
    if (tone === null) return;
    material.color.setHex(tone);
    if (material.name === 'paint') material.name = GUN_ACCENT;
  });
}

export function gunHead(look: WeaponLook, defId: string): ReturnType<typeof weaponHead> {
  const built = weaponHead(look);
  lookOfGun(built.head, defId);
  return built;
}

export function baseTone(paint: number, material: string): number | null {
  if (OWN_COLOR.has(material)) return null;
  const share = material === 'dark' ? GUN_LOOK.base.dark : GUN_LOOK.base.body;
  const tinted = new THREE.Color(GUN_LOOK.base.neutral).lerp(new THREE.Color(bodyPaint(paint)), GUN_LOOK.base.paintShare);
  return tinted.multiplyScalar(share).getHex();
}

export function gunBase(name: ModelName, paint: number): THREE.Object3D {
  const obj = model(name);
  eachLambert(obj, (material) => {
    const tone = baseTone(paint, material.name);
    if (tone === null) return;
    material.color.setHex(tone);
    material.name = GUN_BASE;
  });
  return obj;
}

function eachLambert(obj: THREE.Object3D, visit: (material: THREE.MeshLambertMaterial) => void): void {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial) visit(o.material);
  });
}
