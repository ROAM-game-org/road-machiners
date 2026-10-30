import { chassisDef, type ChassisDef } from '../data/chassis';
import { PHYSICS } from '../data/physics';
import TRUCK_SHAPES from '../data/truck-shapes.json';
import { baseGrid } from './grid';
import type { ShapeBox } from './mapgen';

export type BodyBox = { at: { x: number; y: number; z: number }; half: { x: number; y: number; z: number } };

export type Body = {
  half: { x: number; y: number; z: number };
  boxes: BodyBox[];
  wheelX: number;
  wheelZ: number;
  wheelY: number;
  wheelRadius: number;
  wheelHalfWidth: number;
  comY: number;
};

export type CellRect = { unit: number; x0: number; x1: number; z0: number; z1: number };

export type Unit = { index: number; body: Body; rows: readonly [number, number]; offset: number; pivot: number | null; shape: string };

export type Span = { center: number; half: { x: number; z: number } };

type HeightMap = { cell: number; i0: number; j0: number; top: (number | null)[][] };
type TruckShape = { boxes: ShapeBox[]; heights: HeightMap };
type WheelLook = { halfHeight: number; wheelY: number; wheelX: number; wheelZ: number; wheelRadius: number; wheelHalfWidth: number; comHeight: number };
type CouplingLook = (typeof PHYSICS.couplings)[keyof typeof PHYSICS.couplings];

const units = new Map<string, readonly Unit[]>();
const spans = new Map<string, Span>();

export function couplingOf(chassisId: string): CouplingLook | null {
  const def = chassisDef(chassisId);
  if (!def.coupling) return null;
  const look = (PHYSICS.couplings as Record<string, CouplingLook>)[def.look];
  if (!look) throw new Error(`Chassis ${chassisId} has a coupling but its look ${def.look} has no PHYSICS.couplings entry`);
  return look;
}

export function isRig(chassisId: string): boolean {
  return couplingOf(chassisId) !== null;
}

export function unitsOf(chassisId: string): readonly Unit[] {
  const cached = units.get(chassisId);
  if (cached) return cached;
  const made = buildUnits(chassisDef(chassisId));
  units.set(chassisId, made);
  return made;
}

function buildUnits(def: ChassisDef): readonly Unit[] {
  const rows = baseGrid(def.id).h;
  const front = PHYSICS.bodies[def.look];
  const coupling = couplingOf(def.id);
  if (!coupling || !def.coupling) return [{ index: 0, body: buildBody(def.id, `base_${def.id}`, front), rows: [0, rows], offset: 0, pivot: null, shape: `base_${def.id}` }];
  const row = def.coupling.row;
  if (!(row > 1 && row < rows - 1)) throw new Error(`Chassis ${def.id} couples at row ${row}, outside its ${rows} rows`);
  const rearShape = `base_${coupling.rear.model}`;
  return [
    { index: 0, body: buildBody(def.id, `base_${def.id}`, front), rows: [0, row], offset: 0, pivot: coupling.pivotFront, shape: `base_${def.id}` },
    { index: 1, body: buildBody(def.id, rearShape, coupling.rear), rows: [row, rows], offset: coupling.pivotFront - coupling.pivotRear, pivot: coupling.pivotRear, shape: rearShape },
  ];
}

export function unitOfRow(chassisId: string, y: number): Unit {
  const all = unitsOf(chassisId);
  const last = all[all.length - 1];
  if (!Number.isInteger(y) || y < 0) throw new Error(`Row ${y} is on no unit of the ${chassisId} grid`);
  return all.find((u) => y >= u.rows[0] && y < u.rows[1]) ?? last;
}

export function unitOfCells(chassisId: string, cells: readonly { y: number }[]): Unit {
  if (cells.length === 0) throw new Error(`No cells to find a unit of ${chassisId} for`);
  return unitOfRow(chassisId, Math.min(...cells.map((c) => c.y)));
}

export function unitBody(chassisId: string, unit: number): Body {
  const found = unitsOf(chassisId)[unit];
  if (!found) throw new Error(`Chassis ${chassisId} has no unit ${unit}`);
  return found.body;
}

export function bodyOf(chassisId: string): Body {
  const all = unitsOf(chassisId);
  if (all.length !== 1) throw new Error(`Chassis ${chassisId} is a rig; ask unitsOf()`);
  return all[0].body;
}

export function frontBody(chassisId: string): Body {
  return unitsOf(chassisId)[0].body;
}

export function spanOf(chassisId: string): Span {
  const cached = spans.get(chassisId);
  if (cached) return cached;
  const all = unitsOf(chassisId);
  const made = all.length === 1 ? { center: 0, half: { x: all[0].body.half.x, z: all[0].body.half.z } } : unionSpan(all);
  spans.set(chassisId, made);
  return made;
}

function unionSpan(all: readonly Unit[]): Span {
  const ends = all.flatMap((u) => u.body.boxes.flatMap((b) => [u.offset + b.at.x - b.half.x, u.offset + b.at.x + b.half.x]));
  const lo = Math.min(...ends);
  const hi = Math.max(...ends);
  return { center: (lo + hi) / 2, half: { x: (hi - lo) / 2, z: Math.max(...all.map((u) => u.body.half.z)) } };
}

function buildBody(chassisId: string, shape: string, look: WheelLook): Body {
  const boxes = collisionBoxes(chassisId, shape, look.halfHeight, restTop(look));
  const half = {
    x: Math.max(...boxes.map((b) => Math.abs(b.at.x) + b.half.x)),
    y: look.halfHeight,
    z: Math.max(...boxes.map((b) => Math.abs(b.at.z) + b.half.z)),
  };
  const comY = look.comHeight - rideOf(look);
  return { half, boxes, wheelX: look.wheelX, wheelZ: look.wheelZ, wheelY: look.wheelY, wheelRadius: look.wheelRadius, wheelHalfWidth: look.wheelHalfWidth, comY };
}

export function rideOf(body: Pick<Body, 'wheelRadius' | 'wheelY'>): number {
  return body.wheelRadius + PHYSICS.truck.suspensionRest - body.wheelY;
}

function restTop(look: Pick<Body, 'wheelRadius' | 'wheelY'>): number {
  return PHYSICS.truckRoof - rideOf(look);
}

function truckShape(name: string): TruckShape {
  const shape = (TRUCK_SHAPES as Record<string, TruckShape>)[name];
  if (!shape) throw new Error(`No truck shape ${name}. Run npm run models:shapes.`);
  return shape;
}

function unitShape(chassisId: string, unit: number): TruckShape {
  const found = unitsOf(chassisId)[unit];
  if (!found) throw new Error(`Chassis ${chassisId} has no unit ${unit}`);
  return truckShape(found.shape);
}

function collisionBoxes(chassisId: string, shape: string, halfHeight: number, top: number): BodyBox[] {
  return truckShape(shape).boxes.flatMap((b) => {
    if (b.z0 >= top || b.z1 <= -halfHeight) return [];
    const y0 = Math.max(b.z0, -halfHeight);
    const y1 = Math.min(b.z1, top);
    if (!(y1 > y0)) throw new Error(`A ${chassisId} collision box of ${shape} has no height between the chassis bottom and the roof limit`);
    return [{
      at: { x: (b.x0 + b.x1) / 2, y: (y0 + y1) / 2, z: -(b.y0 + b.y1) / 2 },
      half: { x: (b.x1 - b.x0) / 2, y: (y1 - y0) / 2, z: (b.y1 - b.y0) / 2 },
    }];
  });
}

export type HulkBox = { box: ShapeBox; x: number; y: number; turn: number };

const hulks = new Map<string, readonly HulkBox[]>();

export function hulkBoxes(chassisId: string, bend: number | undefined): readonly HulkBox[] {
  const all = unitsOf(chassisId);
  if ((all.length > 1) !== (bend !== undefined)) throw new Error(`A ${chassisId} hulk ${bend === undefined ? 'has no bend but is a rig' : 'has a bend but is no rig'}`);
  const key = `${chassisId}|${bend ?? ''}`;
  const cached = hulks.get(key);
  if (cached) return cached;
  const bottom = -all[0].body.half.y;
  const made = all.flatMap((u) => {
    const place = unitPlace(u, bend ?? 0);
    return truckShape(u.shape).boxes.filter((b) => b.z1 > bottom).map((b) => {
      const z0 = Math.max(b.z0, bottom);
      return { box: { ...b, z0: z0 - bottom, z1: b.z1 - bottom }, ...place };
    });
  });
  hulks.set(key, made);
  return made;
}

function unitPlace(u: Unit, bend: number): { x: number; y: number; turn: number } {
  if (u.index === 0 || u.pivot === null) return { x: 0, y: 0, turn: 0 };
  const pivot = u.offset + u.pivot;
  return { x: pivot - u.pivot * Math.cos(bend), y: -u.pivot * Math.sin(bend), turn: bend };
}

export function cellRect(chassisId: string, cells: readonly { x: number; y: number }[]): CellRect {
  const unit = unitOfCells(chassisId, cells);
  const rects = cells.map((c) => singleCellRect(chassisId, c.x, c.y, unit));
  return {
    unit: unit.index,
    x0: Math.min(...rects.map((r) => r.x0)),
    x1: Math.max(...rects.map((r) => r.x1)),
    z0: Math.min(...rects.map((r) => r.z0)),
    z1: Math.max(...rects.map((r) => r.z1)),
  };
}

export function ringMiddles(chassisId: string, y: number): { z0: number; z1: number } {
  const [left, right] = [0, baseGrid(chassisId).w - 1].map((x) => cellRect(chassisId, [{ x, y }]));
  return { z0: (left.z0 + left.z1) / 2, z1: (right.z0 + right.z1) / 2 };
}

export function cellCenter(chassisId: string, x: number, y: number): { x: number; z: number; unit: number } {
  const unit = unitOfRow(chassisId, y);
  const r = singleCellRect(chassisId, x, y, unit);
  return { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, unit: unit.index };
}

export const GRID_CELL = 0.45;

export function cellSteps(chassisId: string): { row: number; col: number } {
  chassisDef(chassisId);
  return { row: GRID_CELL, col: GRID_CELL };
}

export function bodyRows(chassisId: string): number {
  return baseGrid(chassisId).h - 2;
}

function singleCellRect(chassisId: string, x: number, y: number, unit: Unit): Omit<CellRect, 'unit'> {
  const { w, h } = gridContaining(chassisId, x, y);
  const { center, half } = spanOf(chassisId);
  const shift = center - unit.offset;
  const front = shift + ((h - 2) * GRID_CELL) / 2;
  const left = -((w - 2) * GRID_CELL) / 2;
  const along = { x0: front - y * GRID_CELL, x1: front - (y - 1) * GRID_CELL };
  const across = { z0: left + (x - 1) * GRID_CELL, z1: left + x * GRID_CELL };
  const side = ringSign(x, w, -1);
  const end = ringSign(y, h, 1);
  if (side !== 0) return { ...along, z0: side * half.z, z1: side * half.z };
  if (end !== 0) return { x0: shift + end * half.x, x1: shift + end * half.x, ...across };
  return { ...along, ...across };
}

function gridContaining(chassisId: string, x: number, y: number): { w: number; h: number } {
  const grid = baseGrid(chassisId);
  const inside = x >= 0 && x < grid.w && y >= 0 && y < grid.h;
  if (!inside) throw new Error(`Cell ${x},${y} is outside the ${chassisId} grid`);
  return grid;
}

function ringSign(index: number, count: number, first: number): number {
  if (index === 0) return first;
  return index === count - 1 ? -first : 0;
}

function topOver(map: HeightMap, xa: number, xb: number, ya: number, yb: number): number {
  const eps = 1e-6;
  const cellsOf = (lo: number, hi: number) => {
    const first = Math.ceil((lo - eps) / map.cell);
    const last = Math.floor((hi + eps) / map.cell) - 1;
    if (last < first) return [Math.floor((lo + hi) / 2 / map.cell)];
    return Array.from({ length: last - first + 1 }, (_, k) => first + k);
  };
  const tops = cellsOf(xa, xb).flatMap((i) => cellsOf(ya, yb).map((j) => map.top[i - map.i0]?.[j - map.j0]));
  return Math.max(-Infinity, ...tops.filter((t): t is number => typeof t === 'number').map((t) => t / 100));
}

export function surfaceAt(chassisId: string, rect: CellRect): number {
  const best = highestUnder(chassisId, rect);
  if (best === -Infinity) throw new Error(`The ${chassisId} model has no surface under x ${rect.x0}..${rect.x1}, z ${rect.z0}..${rect.z1}`);
  return best;
}

function nearestSurface(chassisId: string, rect: CellRect): number {
  const map = unitShape(chassisId, rect.unit).heights;
  for (let grow = 1; grow <= 4; grow++) {
    const pad = grow * map.cell;
    const y = highestUnder(chassisId, { ...rect, x0: rect.x0 - pad, x1: rect.x1 + pad, z0: rect.z0 - pad, z1: rect.z1 + pad });
    if (y !== -Infinity) return y;
  }
  throw new Error(`The ${chassisId} model has no surface near x ${rect.x0}..${rect.x1}, z ${rect.z0}..${rect.z1}`);
}

export function highestUnder(chassisId: string, rect: CellRect): number {
  const map = unitShape(chassisId, rect.unit).heights;
  const reach = (lo: number, hi: number) => (hi > lo ? [lo, hi] : [lo - map.cell, hi + map.cell]);
  const [xa, xb] = reach(rect.x0, rect.x1);
  const [ya, yb] = reach(-rect.z1, -rect.z0);
  return topOver(map, xa, xb, ya, yb);
}

export function surfaceSamples(chassisId: string, unit: number, center: { x: number; z: number }, radius: number): { x: number; z: number; y: number; half: number }[] {
  const map = unitShape(chassisId, unit).heights;
  const out: { x: number; z: number; y: number; half: number }[] = [];
  const reach = Math.ceil(radius / map.cell) + 1;
  const i0 = Math.floor(center.x / map.cell);
  const j0 = Math.floor(-center.z / map.cell);
  for (let i = i0 - reach; i <= i0 + reach; i++) {
    for (let j = j0 - reach; j <= j0 + reach; j++) {
      const top = map.top[i - map.i0]?.[j - map.j0];
      if (typeof top !== 'number') continue;
      const x = (i + 0.5) * map.cell;
      const z = -(j + 0.5) * map.cell;
      if (Math.hypot(x - center.x, z - center.z) <= radius) out.push({ x, z, y: top / 100, half: map.cell / 2 });
    }
  }
  return out;
}

export const CLIP_TOLERANCE = 0.05;
const MIN_KEEP = 0.3;
export const MIN_SUPPORT = 0.9;

export type Rest = { y: number; rect: CellRect; perched: boolean; slope: { x: number; z: number } };

const FLAT = { x: 0, z: 0 };
export const MAX_SLOPE = 0.7;
const MIN_SLOPE = 0.1;

export function roofSpot(chassisId: string, rect: CellRect, inset: number): { x: number; z: number; y: number } {
  const center = { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 };
  const radius = Math.hypot(rect.x1 - rect.x0, rect.z1 - rect.z0) / 2;
  const near = surfaceSamples(chassisId, rect.unit, center, radius + inset * 2);
  const within = near.filter((s) => s.x >= rect.x0 && s.x <= rect.x1 && s.z >= rect.z0 && s.z <= rect.z1);
  if (within.length === 0) throw new Error(`The ${chassisId} model has no surface in x ${rect.x0}..${rect.x1}, z ${rect.z0}..${rect.z1}`);
  const cells = new Map(near.map((s) => [`${s.x.toFixed(3)},${s.z.toFixed(3)}`, s]));
  const step = within[0].half * 2;
  const margin = inset + step;
  const reach = Math.ceil(margin / step);
  const flatAround = (s: { x: number; z: number; y: number }) => {
    for (let i = -reach; i <= reach; i++) {
      for (let j = -reach; j <= reach; j++) {
        if (Math.hypot(i, j) * step > margin) continue;
        const n = cells.get(`${(s.x + i * step).toFixed(3)},${(s.z + j * step).toFixed(3)}`);
        if (!n || Math.abs(n.y - s.y) > CLIP_TOLERANCE) return false;
      }
    }
    return true;
  };
  const flat = within.filter(flatAround);
  if (flat.length === 0) throw new Error(`The ${chassisId} model has no flat spot ${inset} m from its edges in x ${rect.x0}..${rect.x1}, z ${rect.z0}..${rect.z1}`);
  const top = Math.max(...flat.map((s) => s.y));
  const best = flat.filter((s) => s.y >= top - CLIP_TOLERANCE).reduce((a, b) => (b.x + b.z < a.x + a.z ? b : a));
  return { x: best.x, z: best.z, y: best.y };
}

export function restOn(chassisId: string, rect: CellRect): Rest {
  const map = unitShape(chassisId, rect.unit).heights;
  const samples = rect.x1 > rect.x0 && rect.z1 > rect.z0 ? samplesUnder(map, rect) : [];
  if (samples.length === 0) return restOnEdge(chassisId, rect);
  return cleanSlope(map, samples, rect) ?? restFlat(map, samples, rect) ?? perch(chassisId, map, samples, rect);
}

export function engineRest(chassisId: string, rect: CellRect): Rest | null {
  const map = unitShape(chassisId, rect.unit).heights;
  const samples = samplesUnder(map, rect);
  if (samples.length === 0) return null;
  const y = engineAnchor(chassisId).y;
  const box = clearBox(samples, y - CLIP_TOLERANCE, y + CLIP_TOLERANCE);
  if (box.empty) return null;
  const kept = Math.min((box.i1 - box.i0) / sampleSpan(samples, 'i'), (box.j1 - box.j0) / sampleSpan(samples, 'j'));
  if (kept < MIN_KEEP) return null;
  const flat = rectOfBox(map, box, rect);
  const { x, z } = engineAnchor(chassisId);
  const reachX = Math.min(x - flat.x0, flat.x1 - x);
  const reachZ = Math.min(z - flat.z0, flat.z1 - z);
  if (reachX <= 0 || reachZ <= 0) return null;
  return { y, rect: { unit: rect.unit, x0: x - reachX, x1: x + reachX, z0: z - reachZ, z1: z + reachZ }, perched: false, slope: FLAT };
}

function restOnEdge(chassisId: string, rect: CellRect): Rest {
  const y = highestUnder(chassisId, rect);
  return y === -Infinity ? { y: 0, rect, perched: true, slope: FLAT } : { y, rect, perched: false, slope: FLAT };
}

function cleanSlope(map: HeightMap, samples: Sample[], rect: CellRect): Rest | null {
  const slope = leanOn(map, samples, rect, CLIP_TOLERANCE, true);
  return slope && Math.hypot(slope.slope.x, slope.slope.z) >= MIN_SLOPE ? slope : null;
}

function restFlat(map: HeightMap, samples: Sample[], rect: CellRect): Rest | null {
  const tops = samples.map((sm) => sm.top).filter(Number.isFinite).sort((a, b) => a - b);
  const levels = [...new Set(tops.slice(Math.floor((tops.length - 1) / 2)))];
  const fits = levels.flatMap((y) => {
    const box = clearBox(samples, y - CLIP_TOLERANCE, y + CLIP_TOLERANCE);
    const di = (box.i1 - box.i0) / sampleSpan(samples, 'i');
    const dj = (box.j1 - box.j0) / sampleSpan(samples, 'j');
    return !box.empty && Math.min(di, dj) >= MIN_KEEP && supports(samples, box, y) ? [{ y, box, area: di * dj }] : [];
  });
  const best = fits.reduce<(typeof fits)[number] | null>((a, b) => (a && a.area >= b.area ? a : b), null);
  return best && { y: best.y, rect: rectOfBox(map, best.box, rect), perched: false, slope: FLAT };
}

function perch(chassisId: string, map: HeightMap, samples: Sample[], rect: CellRect): Rest {
  const tops = samples.map((sm) => sm.top).filter(Number.isFinite);
  if (tops.length === 0) return { y: nearestSurface(chassisId, rect), rect, perched: true, slope: FLAT };
  const highest = Math.max(...tops);
  const leaning = leanOn(map, samples, rect, highest - Math.min(...tops), false);
  return leaning ? { ...leaning, perched: true } : { y: highest, rect, perched: true, slope: FLAT };
}

function leanOn(map: HeightMap, samples: Sample[], rect: CellRect, maxGap: number, mostTouching: boolean): Rest | null {
  if (samples.some((sm) => !Number.isFinite(sm.top))) return null;
  const points = samples.map((sm) => ({ x: (sm.i + 0.5) * map.cell, z: -(sm.j + 0.5) * map.cell, y: sm.top }));
  const plane = fitPlane(points);
  if (!plane || Math.hypot(plane.x, plane.z) > MAX_SLOPE) return null;
  const at = (pt: { x: number; z: number }) => plane.y + plane.x * pt.x + plane.z * pt.z;
  const lift = Math.max(...points.map((pt) => pt.y - at(pt)));
  const gaps = points.map((pt) => at(pt) + lift - pt.y);
  if (!gapsFit(gaps, maxGap, mostTouching)) return null;
  const center = { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 };
  return { y: at(center) + lift, rect, perched: false, slope: { x: plane.x, z: plane.z } };
}

function gapsFit(gaps: number[], maxGap: number, mostTouching: boolean): boolean {
  if (gaps.some((g) => g > maxGap)) return false;
  return !mostTouching || gaps.filter((g) => g <= CLIP_TOLERANCE).length >= MIN_SUPPORT * gaps.length;
}

function fitPlane(points: { x: number; y: number; z: number }[]): { y: number; x: number; z: number } | null {
  const n = points.length;
  const mean = (f: (pt: { x: number; y: number; z: number }) => number) => points.reduce((sum, pt) => sum + f(pt), 0) / n;
  const mx = mean((pt) => pt.x);
  const mz = mean((pt) => pt.z);
  const my = mean((pt) => pt.y);
  const sxx = mean((pt) => (pt.x - mx) ** 2);
  const szz = mean((pt) => (pt.z - mz) ** 2);
  const sxz = mean((pt) => (pt.x - mx) * (pt.z - mz));
  const sxy = mean((pt) => (pt.x - mx) * (pt.y - my));
  const szy = mean((pt) => (pt.z - mz) * (pt.y - my));
  const det = sxx * szz - sxz * sxz;
  if (Math.abs(det) < 1e-12) return null;
  const x = (sxy * szz - szy * sxz) / det;
  const z = (szy * sxx - sxy * sxz) / det;
  return { y: my - x * mx - z * mz, x, z };
}

type Sample = { i: number; j: number; top: number };
type Box = { i0: number; i1: number; j0: number; j1: number; empty: boolean; cut: [boolean, boolean, boolean, boolean] };

function samplesUnder(map: HeightMap, rect: CellRect): Sample[] {
  const range = (lo: number, hi: number, outward: boolean) => {
    const first = outward ? Math.floor((lo + 1e-6) / map.cell) : Math.ceil((lo - 1e-6) / map.cell);
    const last = outward ? Math.ceil((hi - 1e-6) / map.cell) - 1 : Math.floor((hi + 1e-6) / map.cell) - 1;
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, k) => first + k);
  };
  const whole = new Set(range(rect.x0, rect.x1, false));
  const topAt = (i: number, j: number) => map.top[i - map.i0]?.[j - map.j0];
  const hangsOff = (i: number, j: number) => [i - 1, i + 1].some((n) => !whole.has(n) && typeof topAt(n, j) !== 'number');
  return range(rect.x0, rect.x1, true).flatMap((i) => range(-rect.z1, -rect.z0, false).flatMap((j) => {
    const top = topAt(i, j);
    if (typeof top !== 'number') return [{ i, j, top: -Infinity }];
    return whole.has(i) ? [{ i, j, top: hangsOff(i, j) ? -Infinity : top / 100 }] : [];
  }));
}

function supports(samples: Sample[], box: Box, y: number): boolean {
  const inside = samples.filter((sm) => sm.i >= box.i0 && sm.i < box.i1 && sm.j >= box.j0 && sm.j < box.j1);
  return inside.filter((sm) => sm.top >= y - CLIP_TOLERANCE).length >= MIN_SUPPORT * inside.length;
}

function sampleSpan(samples: Sample[], key: 'i' | 'j'): number {
  const values = samples.map((sm) => sm[key]);
  return Math.max(...values) - Math.min(...values) + 1;
}

function clearBox(samples: Sample[], low: number, high: number): Box {
  const box: Box = { i0: Math.min(...samples.map((sm) => sm.i)), i1: Math.max(...samples.map((sm) => sm.i)) + 1, j0: Math.min(...samples.map((sm) => sm.j)), j1: Math.max(...samples.map((sm) => sm.j)) + 1, empty: false, cut: [false, false, false, false] };
  const inBox = (sm: Sample) => sm.i >= box.i0 && sm.i < box.i1 && sm.j >= box.j0 && sm.j < box.j1;
  for (;;) {
    const tall = samples.filter((sm) => (sm.top > high || sm.top < low) && inBox(sm));
    if (tall.length === 0) return box;
    trimEdge(box, tall);
    if (box.i1 <= box.i0 || box.j1 <= box.j0) return { ...box, empty: true };
  }
}

function trimEdge(box: Box, tall: Sample[]): void {
  const edges = [(sm: Sample) => sm.i === box.i0, (sm: Sample) => sm.i === box.i1 - 1, (sm: Sample) => sm.j === box.j0, (sm: Sample) => sm.j === box.j1 - 1];
  const counts = edges.map((on) => tall.filter(on).length);
  const most = Math.max(...counts);
  const first = tall[0];
  const gaps = [first.i - box.i0, box.i1 - 1 - first.i, first.j - box.j0, box.j1 - 1 - first.j];
  const side = most > 0 ? counts.indexOf(most) : gaps.indexOf(Math.min(...gaps));
  box.cut[side] = true;
  if (side === 0) box.i0 += 1;
  else if (side === 1) box.i1 -= 1;
  else if (side === 2) box.j0 += 1;
  else box.j1 -= 1;
}

function rectOfBox(map: HeightMap, box: Box, rect: CellRect): CellRect {
  return {
    unit: rect.unit,
    x0: box.cut[0] ? box.i0 * map.cell : rect.x0,
    x1: box.cut[1] ? box.i1 * map.cell : rect.x1,
    z0: box.cut[3] ? -box.j1 * map.cell : rect.z0,
    z1: box.cut[2] ? -box.j0 * map.cell : rect.z1,
  };
}

export function engineAnchor(chassisId: string): { x: number; y: number; z: number } {
  return { ...PHYSICS.bodies[chassisDef(chassisId).look].engine };
}

export function lanesAt(chassisId: string, axis: 'column' | 'row', a: number, b: number, unit: number): number[] {
  const { w, h } = baseGrid(chassisId);
  const { center, half } = spanOf(chassisId);
  const u = unitsOf(chassisId)[unit];
  if (!u) throw new Error(`Chassis ${chassisId} has no unit ${unit}`);
  const shift = center - u.offset;
  const across = ((w - 2) * GRID_CELL) / 2;
  const along = ((h - 2) * GRID_CELL) / 2;
  const inner = (offset: number, count: number) => 1 + Math.min(count - 1, Math.max(0, Math.floor(offset / GRID_CELL)));
  const lane = axis === 'column'
    ? (z: number) => (z < -half.z ? 0 : z >= half.z ? w - 1 : inner(z + across, w - 2))
    : (x: number) => Math.min(u.rows[1] - 1, Math.max(u.rows[0], x > shift + half.x ? 0 : x <= shift - half.x ? h - 1 : inner(shift + along - x, h - 2)));
  const first = Math.min(lane(a), lane(b));
  const last = Math.max(lane(a), lane(b));
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

