import { rotateBy, type V3, type VehicleFrame } from '../../phys/frames';
import { wheelMounts } from '../../phys/body';
import { cellRect, engineBay, hulkBoxes, isRig, unitBody, unitsOf, type CellRect, type HulkBox } from '../../sim/body';
import { corePart, itemCells, mountedItems } from '../../sim/grid';
import type { GridItem, Vehicle } from '../../sim/types';
import { maxHp } from '../../sim/wear';
import { EXHAUST_VENT } from '../../data/chassis';
import { partDef } from '../../data/parts';
import { startRadius } from './particles/emissions';

export const HURT_CAB = 0.35;
export const MIN_VENT_SCALE = 0.5;
const TAILPIPE_HEIGHT = 0.3;
const STACK_REFERENCE = 'semi';
const SEAT_STEP = 0.05;
const SEAT_SLACK = 0.05;

export type BodyPoint = { unit: number; x: number; y: number; z: number };
export type SmokeSource = BodyPoint & { damage: number };
export type TruckVents = {
  exhaust: BodyPoint;
  ventScale: number;
  engine: BodyPoint;
  douse: BodyPoint & { halfX: number; halfZ: number };
  hazeBack: number;
};

type PartItem = Extract<GridItem, { kind: 'part' }>;

function straightBoxes(chassisId: string): readonly HulkBox[] {
  return hulkBoxes(chassisId, isRig(chassisId) ? 0 : undefined);
}

type Reach = 'trail' | 'footprint';

function topUnder(chassisId: string, unit: number, x: number, z: number, halfX: number, halfZ: number, radius: number, reach: Reach): number {
  const at = unitsOf(chassisId)[unit].offset + x;
  const bottom = unitBody(chassisId, 0).half.y;
  const under = straightBoxes(chassisId).filter((b) => {
    const across = { lo: -b.box.y1 + b.y, hi: -b.box.y0 + b.y };
    const ahead = reach === 'trail' || b.box.x1 + b.x > at - halfX - radius;
    return ahead && b.box.x0 + b.x < at + halfX + radius && across.hi > z - halfZ - radius && across.lo < z + halfZ + radius;
  });
  if (under.length === 0) throw new Error(`The ${chassisId} model has no body in the ${reach} of x ${x}, z ${z} on unit ${unit}`);
  return Math.max(...under.map((b) => b.box.z1)) - bottom + radius;
}

function trailTop(chassisId: string, unit: number, x: number, z: number, halfX: number, halfZ: number, radius: number): number {
  return topUnder(chassisId, unit, x, z, halfX, halfZ, radius, 'trail');
}

function pointOver(chassisId: string, rect: CellRect, x: number, z: number, radius: number): BodyPoint {
  return { unit: rect.unit, x, y: trailTop(chassisId, rect.unit, x, z, 0, 0, radius), z };
}

function sourceAt(v: Vehicle, item: PartItem, damage: number): SmokeSource {
  const rect = cellRect(v.chassisId, itemCells(item));
  return { ...pointOver(v.chassisId, rect, (rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2, startRadius('hurt', ventScaleOf(v.chassisId))), damage };
}

function smokeOf(v: Vehicle, item: PartItem, cabId: string): SmokeSource | null {
  const { part } = item;
  if (partDef(part.defId).kind === 'engine') return null;
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
  const ventScale = ventScaleOf(id);
  const engineRadius = Math.max(startRadius('steam', ventScale), startRadius('breakdown', ventScale));
  return {
    exhaust: exhaustVent(v, cab, startRadius('exhaust', ventScale)),
    ventScale,
    engine: lowestSeat(id, bay, bayAt.z, engineRadius),
    douse: { unit: bay.unit, ...bayAt, y: trailTop(id, bay.unit, bayAt.x, bayAt.z, halfX, halfZ, startRadius('douse')), halfX, halfZ },
    hazeBack: hazeBackOf(id),
  };
}

const SEATS = new Map<string, BodyPoint>();

function lowestSeat(chassisId: string, bay: CellRect, z: number, radius: number): BodyPoint {
  const key = `${chassisId}:${radius}`;
  const known = SEATS.get(key);
  if (known) return known;
  const seat = findLowestSeat(chassisId, bay, z, radius);
  SEATS.set(key, seat);
  return seat;
}

function findLowestSeat(chassisId: string, bay: CellRect, z: number, radius: number): BodyPoint {
  const center = (bay.x0 + bay.x1) / 2;
  const steps = Math.ceil((bay.x1 - bay.x0) / SEAT_STEP);
  const seats = Array.from({ length: steps + 1 }, (_, i) => bay.x0 + ((bay.x1 - bay.x0) * i) / steps)
    .sort((a, b) => Math.abs(a - center) - Math.abs(b - center))
    .map((x) => ({ unit: bay.unit, x, y: topUnder(chassisId, bay.unit, x, z, 0, 0, radius, 'footprint'), z }));
  const lowest = Math.min(...seats.map((seat) => seat.y));
  return seats.find((seat) => seat.y <= lowest + SEAT_SLACK)!;
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

function ventScaleOf(chassisId: string): number {
  const share = unitBody(chassisId, 0).half.z / unitBody(STACK_REFERENCE, 0).half.z;
  return Math.min(1, Math.max(MIN_VENT_SCALE, share));
}

function exhaustVent(v: Vehicle, cab: CellRect, radius: number): BodyPoint {
  const vent = EXHAUST_VENT[v.chassisId];
  if (!vent) throw new Error(`The ${v.chassisId} has no exhaust vent`);
  if (vent.at === 'cab') return pointOver(v.chassisId, cab, cab.x0, (cab.z0 + cab.z1) / 2 - (vent.side * (cab.z1 - cab.z0)) / 2, radius);
  return tailpipe(v.chassisId, vent.side, radius);
}

function tailpipe(chassisId: string, side: number, radius: number): BodyPoint {
  const last = unitsOf(chassisId).at(-1)!;
  const bottom = unitBody(chassisId, 0).half.y;
  const z = -side * unitBody(chassisId, last.index).half.z;
  const boxes = straightBoxes(chassisId);
  const covering = boxes.filter((b) => -b.box.y1 + b.y <= z && -b.box.y0 + b.y >= z);
  const tail = (covering.length > 0 ? covering : boxes).reduce((a, b) => (b.box.x0 + b.x < a.box.x0 + a.x ? b : a));
  const y = tail.box.z0 + TAILPIPE_HEIGHT * (tail.box.z1 - tail.box.z0) - bottom;
  return { unit: last.index, x: tail.box.x0 + tail.x - last.offset - radius, y, z };
}
