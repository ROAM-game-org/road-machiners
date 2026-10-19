import { mountedParts } from './grid';
import type { Vehicle } from './types';
import { maxHp } from './wear';

export function haulerShare(hauler: Vehicle): number {
  const parts = mountedParts(hauler);
  const max = parts.reduce((sum, p) => sum + maxHp(p), 0);
  return max === 0 ? 0 : parts.reduce((sum, p) => sum + p.hp, 0) / max;
}
