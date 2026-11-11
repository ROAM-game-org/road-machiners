import { rotateBy, type V3, type VehicleFrame } from '../../phys/frames';
import { wheelMounts } from '../../phys/body';
import { cellRect, engineBay, hulkBoxes, isRig, unitBody, unitsOf, type CellRect, type HulkBox } from '../../sim/body';
import { corePart, itemCells, mountedItems } from '../../sim/grid';
import type { GridItem, Vehicle } from '../../sim/types';
import { maxHp } from '../../sim/wear';
import { startRadius } from './particles/emissions';

export const HURT_CAB = 0.35;
export const EXHAUST_SIDE = 0.6;

export type BodyPoint = { unit: number; x: number; y: number; z: number };
export type SmokeSource = BodyPoint & { damage: number };
export type TruckVents = {
  exhaust: BodyPoint;
  engine: BodyPoint;
  douse: BodyPoint & { halfX: number; halfZ: number };
  hazeBack: number;
};

type PartItem = Extract<GridItem, { kind: 'part' }>;

function straightBoxes(chassisId: string): readonly HulkBox[] {
  return hulkBoxes(chassisId, isRig(chassisId) ? 0 : undefined);
}

function trailTop(chassisId: string, unit: number, x: number, z: number, halfX: number, halfZ: number, radius: number): number {
  const at = unitsOf(chassisId)[unit].offset + x;
  const bottom = unitBody(chassisId, 0).half.y;
  const trail = straightBoxes(chassisId).filter((b) => {
    const across = { lo: -b.box.y1 + b.y, hi: -b.box.y0 + b.y };
    return b.box.x0 + b.x < at + halfX + radius && across.hi > z - halfZ - radius && across.lo < z + halfZ + radius;
  });
  if (trail.length === 0) throw new Error(`The ${chassisId} model has no body in the trail of x ${x}, z ${z} on unit ${unit}`);
  return Math.max(...trail.map((b) => b.box.z1)) - bottom + radius;
}

function pointOver(chassisId: string, rect: CellRect, x: number, z: number, radius: number): BodyPoint {
  return { unit: rect.unit, x, y: trailTop(chassisId, rect.unit, x, z, 0, 0, radius), z };
}

function sourceAt(v: Vehicle, item: PartItem, damage: number): SmokeSource {
  const rect = cellRect(v.chassisId, itemCells(item));
  return { ...pointOver(v.chassisId, rect, (rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2, startRadius('hurt')), damage };
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

export function ventsOf(v: Vehicle): TruckVents {
  const id = v.chassisId;
  const cab = cabRect(v);
  const bay = engineBay(id);
  const bayAt = { x: (bay.x0 + bay.x1) / 2, z: (bay.z0 + bay.z1) / 2 };
  const halfX = (bay.x1 - bay.x0) / 2;
  const halfZ = (bay.z1 - bay.z0) / 2;
  const engineRadius = Math.max(startRadius('steam'), startRadius('breakdown'));
  const exhaustAt = { x: cab.x0, z: (cab.z0 + cab.z1) / 2 - (EXHAUST_SIDE * (cab.z1 - cab.z0)) / 2 };
  return {
    exhaust: pointOver(id, cab, exhaustAt.x, exhaustAt.z, startRadius('exhaust')),
    engine: pointOver(id, bay, bayAt.x, bayAt.z, engineRadius),
    douse: { unit: bay.unit, ...bayAt, y: trailTop(id, bay.unit, bayAt.x, bayAt.z, halfX, halfZ, startRadius('douse')), halfX, halfZ },
    hazeBack: hazeBackOf(id),
  };
}

function cabRect(v: Vehicle): CellRect {
  const cabId = corePart(v, 'cab').id;
  const item = mountedItems(v).find((it) => it.part.id === cabId);
  if (!item) throw new Error(`The ${v.chassisId} has no mounted cab`);
  return cellRect(v.chassisId, itemCells(item));
}

function hazeBackOf(chassisId: string): number {
  const last = unitsOf(chassisId).at(-1)!;
  const axle = Math.min(...wheelMounts(last.body, last.index).map((m) => m.x));
  const back = Math.min(...straightBoxes(chassisId).map((b) => b.box.x0 + b.x - last.offset));
  return axle - back;
}

export function smokeAt(source: BodyPoint, f: VehicleFrame): V3 {
  const frame = unitFrame(source, f);
  const off = rotateBy(frame.rot, { x: source.x, y: source.y, z: source.z });
  return { x: frame.pos.x + off.x, y: frame.pos.y + off.y, z: frame.pos.z + off.z };
}

function unitFrame(source: BodyPoint, f: VehicleFrame): Pick<VehicleFrame, 'pos' | 'rot'> {
  if (source.unit === 0) return f;
  if (source.unit !== 1 || !f.rear) throw new Error(`Smoke source on unit ${source.unit} has no frame for it`);
  return f.rear;
}
