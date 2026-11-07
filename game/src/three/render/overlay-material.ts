import * as THREE from 'three';

type OverlayParams = Omit<THREE.MeshBasicMaterialParameters, 'transparent' | 'side' | 'forceSinglePass'>;

export function overlayMaterial(params: OverlayParams): THREE.MeshBasicMaterial {
  if (params.map || params.vertexColors) throw new Error('An overlay material draws in one pass, so it cannot take a map or vertex colors');
  return new THREE.MeshBasicMaterial({ ...params, transparent: true, side: THREE.DoubleSide, forceSinglePass: true });
}
