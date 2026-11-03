import * as THREE from 'three';
import { PAL } from '../../render/palette';

const RADIO_TIP = 1.6;
const RADIO_HALO = 0.6;

export function radioColor(lit: boolean): number {
  return lit ? PAL.radioLight.on : PAL.radioLight.off;
}

export function radioHalo(lit: boolean): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloMap(), color: PAL.radioLight.on, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  sprite.scale.setScalar(RADIO_HALO);
  sprite.raycast = () => {};
  sprite.position.set(0, RADIO_TIP, 0);
  sprite.visible = lit;
  return sprite;
}

let haloTexture: THREE.DataTexture | null = null;
function haloMap(): THREE.DataTexture {
  if (haloTexture) return haloTexture;
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const d = Math.hypot((i % size) - size / 2 + 0.5, Math.floor(i / size) - size / 2 + 0.5) / (size / 2);
    data.set([255, 255, 255, Math.round(255 * Math.max(0, 1 - d) ** 2)], i * 4);
  }
  haloTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  haloTexture.needsUpdate = true;
  return haloTexture;
}
