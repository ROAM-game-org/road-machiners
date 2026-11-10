import * as THREE from 'three';
import { PARTS, type PartKind } from '../../data/parts';
import { partModel } from '../../render/partLooks';
import { GUN_LOOK } from './gunLook';
import { model } from './models';

export const CARGO_WOOD = 'wood';

export type KindTone = { color: number; name?: string };

export const KIND_LOOK: Partial<Record<PartKind, Record<string, KindTone>>> = {
  cargo: { paint: { color: 0x61562c, name: CARGO_WOOD }, wood: { color: 0x4d4423 }, metal_light: { color: 0x5a5a58, name: 'metal' } },
  scanner: { metal_light: { color: GUN_LOOK.light } },
};

export function kindTones(id: string): Record<string, KindTone> | null {
  const def = PARTS[id];
  return def ? (KIND_LOOK[def.kind] ?? null) : null;
}

export function itemObject(id: string): THREE.Object3D {
  const obj = model(partModel(id));
  const tones = kindTones(id);
  if (tones) obj.traverse((o) => retone(o, tones));
  return obj;
}

function retone(o: THREE.Object3D, tones: Record<string, KindTone>): void {
  if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshLambertMaterial)) return;
  const tone = tones[o.material.name];
  if (!tone) return;
  o.material.color.setHex(tone.color);
  o.material.name = tone.name ?? o.material.name;
}
