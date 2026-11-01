import * as THREE from 'three';
import type { CellRect } from '../../sim/body';
export function fitInto(obj: THREE.Object3D, rect: CellRect, y: number, yaw: number): THREE.Object3D {
  obj.position.set(0, 0, 0);
  obj.rotation.set(0, yaw, 0);
  obj.scale.set(1, 1, 1);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const middle = box.getCenter(new THREE.Vector3());
  const stretch = { x: (rect.x1 - rect.x0) / size.x, z: (rect.z1 - rect.z0) / size.z };
  if (yaw === 0) obj.scale.set(stretch.x, 1, stretch.z);
  else obj.scale.set(stretch.z, 1, stretch.x);
  obj.position.set((rect.x0 + rect.x1) / 2 - middle.x * stretch.x, y, (rect.z0 + rect.z1) / 2 - middle.z * stretch.z);
  return obj;
}
