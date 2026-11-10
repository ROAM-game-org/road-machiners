import * as THREE from 'three';
import { isShield, partDef } from '../../data/parts';
import { partModel } from '../../render/partLooks';
import { model } from './models';

export type ArmorGrade = 'steel' | 'spaced' | 'scrap' | 'ceramic' | 'cage' | 'ram';

export const ARMOR_LOOK = {
  steel: 0x646a70,
  detail: 0.86,
  spaced: { panel: 0x4f6378, wall: 0x3c4249 },
  scrap: { steel: 0x6c655d, rust: 0x6a4836 },
  ceramic: { tile: 0xb0ab9f, dim: 0x989488 },
  cage: { bar: 0x5e4a3c },
  ram: { strip: 0xd08a1e },
};

export const ARMOR_SURFACE = 'armor';
export const RAM_SURFACE = 'ram';

const OWN_COLOR = new Set(['glass', 'light', 'glow', 'lens', 'sign', 'sign_red', 'sign_green', 'mustard', 'warhead', 'brass', 'wire']);
const GRADE_OF_MODEL: [string, ArmorGrade][] = [['spaced', 'spaced'], ['scrap', 'scrap'], ['ceramic', 'ceramic'], ['cage', 'cage'], ['reinforced', 'cage']];

type GradeTones = { rest: number; by: Record<string, number> };

const STEEL_DETAIL = shaded(ARMOR_LOOK.steel, ARMOR_LOOK.detail);
const DETAIL = { metal_light: STEEL_DETAIL, dark: STEEL_DETAIL, paint: STEEL_DETAIL };
const rusted = (tone: number) => ({ rust: tone, rust_side: tone, rust_dark: tone });

const TONES: Record<ArmorGrade, GradeTones> = {
  steel: { rest: ARMOR_LOOK.steel, by: DETAIL },
  spaced: { rest: ARMOR_LOOK.spaced.wall, by: { paint: ARMOR_LOOK.spaced.panel } },
  scrap: { rest: ARMOR_LOOK.scrap.steel, by: rusted(ARMOR_LOOK.scrap.rust) },
  ceramic: { rest: ARMOR_LOOK.steel, by: { ...DETAIL, ceramic: ARMOR_LOOK.ceramic.tile, ceramic_dim: ARMOR_LOOK.ceramic.dim } },
  cage: { rest: ARMOR_LOOK.steel, by: { ...DETAIL, ...rusted(ARMOR_LOOK.cage.bar) } },
  ram: { rest: ARMOR_LOOK.steel, by: { ...DETAIL, paint: ARMOR_LOOK.ram.strip } },
};

export function armorGrade(defId: string): ArmorGrade {
  const def = partDef(defId);
  if (!isShield(def)) throw new Error(`Part ${defId} is not armor or an accessory`);
  if (def.kind === 'accessory') return 'ram';
  const name = partModel(defId);
  return GRADE_OF_MODEL.find(([part]) => name.includes(part))?.[1] ?? 'steel';
}

export function armorTone(grade: ArmorGrade, material: string): number | null {
  if (OWN_COLOR.has(material)) return null;
  const tones = TONES[grade];
  return tones.by[material] ?? tones.rest;
}

export function lookOfArmor(obj: THREE.Object3D, defId: string): void {
  const grade = armorGrade(defId);
  const surface = grade === 'ram' ? RAM_SURFACE : ARMOR_SURFACE;
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshLambertMaterial)) return;
    const tone = armorTone(grade, o.material.name);
    if (tone === null) return;
    o.material.color.setHex(tone);
    o.material.name = surface;
  });
}

export function armorModel(defId: string): THREE.Object3D {
  const obj = model(partModel(defId));
  lookOfArmor(obj, defId);
  return obj;
}

function shaded(color: number, k: number): number {
  return new THREE.Color(color).multiplyScalar(k).getHex();
}
