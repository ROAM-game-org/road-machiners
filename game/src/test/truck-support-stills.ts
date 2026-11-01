import * as THREE from 'three';

export const stills: THREE.Group[] = [];

export function keepingStills<T extends { mergeParts: unknown }>(real: T): T {
  return {
    ...real,
    mergeParts: (group: THREE.Group) => {
      stills.push(group.clone(true));
      return new THREE.Group();
    },
  };
}
