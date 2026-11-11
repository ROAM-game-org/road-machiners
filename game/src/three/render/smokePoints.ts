import { rotateBy, type V3, type VehicleFrame } from '../../phys/frames';
import { cellRect, unitBody } from '../../sim/body';
import { corePart, itemCells, mountedItems } from '../../sim/grid';
import type { GridItem, Vehicle } from '../../sim/types';
import { maxHp } from '../../sim/wear';

export const HURT_CAB = 0.35;

export type SmokeSource = { unit: number; x: number; y: number; z: number; damage: number };

type PartItem = Extract<GridItem, { kind: 'part' }>;

function sourceAt(v: Vehicle, item: PartItem, damage: number): SmokeSource {
  const rect = cellRect(v.chassisId, itemCells(item));
  return {
    unit: rect.unit,
    x: (rect.x0 + rect.x1) / 2,
    y: unitBody(v.chassisId, rect.unit).half.y,
    z: (rect.z0 + rect.z1) / 2,
    damage,
  };
}

function smokeOf(v: Vehicle, item: PartItem, cabId: string): SmokeSource | null {
  const { part } = item;
  if (part.id === cabId) return part.hp < maxHp(part) * HURT_CAB ? sourceAt(v, item, 1 - part.hp / maxHp(part)) : null;
  return part.hp === 0 ? sourceAt(v, item, 1) : null;
}

export function smokeSources(v: Vehicle): SmokeSource[] {
  const cabId = corePart(v, 'cab').id;
  return mountedItems(v).flatMap((item) => smokeOf(v, item, cabId) ?? []);
}

export function smokeAt(source: SmokeSource, f: VehicleFrame): V3 {
  const frame = unitFrame(source, f);
  const off = rotateBy(frame.rot, { x: source.x, y: source.y, z: source.z });
  return { x: frame.pos.x + off.x, y: frame.pos.y + off.y, z: frame.pos.z + off.z };
}

function unitFrame(source: SmokeSource, f: VehicleFrame): Pick<VehicleFrame, 'pos' | 'rot'> {
  if (source.unit === 0) return f;
  if (source.unit !== 1 || !f.rear) throw new Error(`Smoke source on unit ${source.unit} has no frame for it`);
  return f.rear;
}
