import type * as THREE from 'three';

export function uploadFirst(attribute: THREE.BufferAttribute | null, items: number): void {
  if (attribute === null || items === 0) return;
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, items * attribute.itemSize);
  attribute.needsUpdate = true;
}
