import type * as THREE from 'three';

export function uploadFirst(attribute: THREE.BufferAttribute | null, items: number): void {
  if (attribute === null || items === 0) return;
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, items * attribute.itemSize);
  attribute.needsUpdate = true;
}

export function uploadRows(attribute: THREE.BufferAttribute, firstItem: number, items: number): void {
  attribute.addUpdateRange(firstItem * attribute.itemSize, items * attribute.itemSize);
  attribute.needsUpdate = true;
}
