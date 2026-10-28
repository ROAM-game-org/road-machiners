import * as THREE from 'three';
import { CLIP_TOLERANCE, highestUnder, MAX_SLOPE, MIN_SUPPORT, surfaceSamples, unitBody, type CellRect } from '../../sim/body';
import { GLASS, LAMP, model, RADIO, socket, type ModelName } from './models';

export type PlateSpot = { dx: number; dz: number; shrink: number };

const RISER_TOP_SIDE = 0.3;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const BRACE_ANGLES = [15, 30, 45, 60, 75];
const SEE_THROUGH = new Set([GLASS, LAMP, RADIO]);
const IDENTITY = new THREE.Matrix4();
const FOOTING_GRID = CLIP_TOLERANCE / 2;
const FACE_COLUMN = 0.1;
const GLASS_SKIN = 2 * CLIP_TOLERANCE;

export function postBottom(foot: number, top: number): number {
  return foot !== -Infinity && top - foot > CLIP_TOLERANCE ? foot : top;
}

export function postColumn(at: THREE.Vector3, unit: number): CellRect {
  const corner = socket('wmount_riser', 'column');
  const half = { x: Math.abs(corner.x), z: Math.abs(corner.z) };
  return { unit, x0: at.x - half.x, x1: at.x + half.x, z0: at.z - half.z, z1: at.z + half.z };
}

export function highestAhead(chassisId: string, rect: CellRect): number {
  const nose = unitBody(chassisId, rect.unit).half.x;
  if (rect.x1 >= nose) return -Infinity;
  return highestUnder(chassisId, { ...rect, x0: rect.x1, x1: nose });
}

const MOUNT_BOXES = new Map<ModelName, THREE.Box3>();

export function plateOf(name: ModelName, unit: number, at: { pos: THREE.Vector3; yaw: number; scale: THREE.Vector3 }): CellRect {
  let local = MOUNT_BOXES.get(name);
  if (!local) {
    local = new THREE.Box3().setFromObject(model(name));
    MOUNT_BOXES.set(name, local);
  }
  const placed = local.clone().applyMatrix4(new THREE.Matrix4().compose(at.pos, new THREE.Quaternion().setFromAxisAngle(UP, at.yaw), at.scale));
  return { unit, x0: placed.min.x, x1: placed.max.x, z0: placed.min.z, z1: placed.max.z };
}

type Sample = [x: number, z: number, lift: number];

export type Footprint = { rect: CellRect; points: Sample[] };

const BOTTOMS = new Map<ModelName, THREE.Vector3[][]>();

export function bottomOf(name: ModelName, unit: number, at: { pos: THREE.Vector3; yaw: number; scale: THREE.Vector3 }): Footprint {
  let local = BOTTOMS.get(name);
  if (!local) {
    local = bottomFaces(model(name));
    BOTTOMS.set(name, local);
  }
  const placement = new THREE.Matrix4().compose(at.pos, new THREE.Quaternion().setFromAxisAngle(UP, at.yaw), at.scale);
  const faces = local.map((face) => face.map((p) => p.clone().applyMatrix4(placement)));
  const box = new THREE.Box3().setFromPoints(faces.flat());
  const rect = { unit, x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z };
  const samples = faceSamples(faces);
  const floor = Math.min(...samples.map((p) => p.y));
  return { rect, points: samples.map((p): Sample => [p.x, p.z, p.y - floor]) };
}

export function bottomSamples(obj: THREE.Object3D): THREE.Vector3[] {
  obj.updateWorldMatrix(true, true);
  const turn = new THREE.Quaternion();
  obj.matrixWorld.decompose(new THREE.Vector3(), turn, new THREE.Vector3());
  const fromLevel = new THREE.Matrix4().makeRotationFromQuaternion(turn);
  const toLevel = fromLevel.clone().invert();
  const level = lowFaces(worldFaces(obj).map((face) => face.map((p) => p.applyMatrix4(toLevel))), obj.name);
  return faceSamples(level).map((p) => p.applyMatrix4(fromLevel));
}

export function underSpots(obj: THREE.Object3D): (x: number, z: number) => [number, number] {
  const faces = bottomFaces(obj);
  const corners = faces.flat();
  const reach = 2 * legPad();
  return (x, z) => {
    if (faces.some((face) => coversXZ(face, x, z))) return [x, z];
    const near = corners.filter((p) => Math.hypot(p.x - x, p.z - z) <= reach).sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z))[0];
    return near ? [near.x, near.z] : [x, z];
  };
}

function faceSamples(faces: THREE.Vector3[][]): THREE.Vector3[] {
  const box = new THREE.Box3().setFromPoints(faces.flat());
  const inside = gridIn({ unit: 0, x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z }).flatMap(([x, z]) => {
    const ys = faces.flatMap((face) => (coversXZ(face, x, z) ? [heightOn(face, x, z)] : []));
    return ys.length > 0 ? [new THREE.Vector3(x, Math.min(...ys), z)] : [];
  });
  const outline = faces.flatMap(([a, b, c]) => [new THREE.Vector3().add(a).add(b).add(c).divideScalar(3), a.clone(), b.clone(), c.clone()]);
  return [...inside, ...outline].filter((p) => !overOwnFace(faces, p));
}

function overOwnFace(faces: THREE.Vector3[][], p: THREE.Vector3): boolean {
  return faces.some((face) => coversXZ(face, p.x, p.z) && heightOn(face, p.x, p.z) < p.y - CLIP_TOLERANCE / 2);
}

function heightOn([a, b, c]: THREE.Vector3[], x: number, z: number): number {
  const normal = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3());
  return a.y - (normal.x * (x - a.x) + normal.z * (z - a.z)) / normal.y;
}

export function bottomRect(obj: THREE.Object3D, unit: number): CellRect {
  const box = new THREE.Box3().setFromPoints(bottomFaces(obj).flat());
  return { unit, x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z };
}

function coversXZ([a, b, c]: THREE.Vector3[], x: number, z: number): boolean {
  const side = (p: THREE.Vector3, q: THREE.Vector3) => (q.x - p.x) * (z - p.z) - (q.z - p.z) * (x - p.x);
  const s = [side(a, b), side(b, c), side(c, a)];
  return s.every((n) => n >= 0) || s.every((n) => n <= 0);
}

function bottomFaces(obj: THREE.Object3D): THREE.Vector3[][] {
  return lowFaces(worldFaces(obj), obj.name);
}

function worldFaces(obj: THREE.Object3D): THREE.Vector3[][] {
  obj.updateWorldMatrix(true, true);
  const faces: THREE.Vector3[][] = [];
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute('position');
    const index = o.geometry.getIndex();
    const at = (k: number) => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(k) : k).applyMatrix4(o.matrixWorld);
    for (let k = 0; k < (index ? index.count : pos.count); k += 3) faces.push([at(k), at(k + 1), at(k + 2)]);
  });
  return faces;
}

function lowFaces(faces: THREE.Vector3[][], name: string): THREE.Vector3[][] {
  const floor = Math.min(...faces.flat().map((p) => p.y));
  const low = faces.filter((f) => f.every((p) => p.y <= floor + CLIP_TOLERANCE) && new THREE.Triangle(f[0], f[1], f[2]).getNormal(new THREE.Vector3()).y < 0);
  if (low.length === 0) throw new Error(`Model ${name} has no bottom face to stand on`);
  return low;
}

export function plateSpot(body: THREE.Object3D, chassisId: string, plate: CellRect, cells: CellRect, topOf: (plate: CellRect) => number): PlateSpot {
  const size = { x: plate.x1 - plate.x0, z: plate.z1 - plate.z0 };
  const step = cellSize(chassisId, plate);
  const smallest = Math.min(1, RISER_TOP_SIDE / Math.max(size.x, size.z));
  const center = { x: (plate.x0 + plate.x1) / 2, z: (plate.z0 + plate.z1) / 2 };
  const shifts = shiftsWithin({ x0: cells.x0 - size.x / 2 - center.x, x1: cells.x1 + size.x / 2 - center.x, z0: cells.z0 - size.z / 2 - center.z, z1: cells.z1 + size.z / 2 - center.z }, step);
  const feet = footings(body);
  const fits = (dx: number, dz: number, shrink: number) => nearCells(cells, center.x + dx, center.z + dz, (size.x * shrink) / 2, (size.z * shrink) / 2);
  for (let shrink = 1; shrink >= smallest; shrink -= step / Math.max(size.x, size.z)) {
    const found = spotAt(plate, shifts.filter(([dx, dz]) => fits(dx, dz, shrink)), shrink, feet);
    if (found) return found;
  }
  const braced = bracedSpot(body, plate, topOf, feet, shifts, fits, smallest, step);
  if (braced) return braced;
  throw new Error(`The gun plate on ${chassisId} over cells ${cells.x0.toFixed(2)},${cells.z0.toFixed(2)} to ${cells.x1.toFixed(2)},${cells.z1.toFixed(2)} has no spot its legs and braces reach`);
}

function bracedSpot(body: THREE.Object3D, plate: CellRect, topOf: (plate: CellRect) => number, feet: Footing, shifts: [number, number][], fits: (dx: number, dz: number, shrink: number) => boolean, smallest: number, step: number): PlateSpot | null {
  const size = Math.max(plate.x1 - plate.x0, plate.z1 - plate.z0);
  const reaches = (spot: PlateSpot) => {
    const moved = movedPlate(plate, spot);
    return legsReach(body, moved, topOf(moved), feet, farBraceHit);
  };
  const home = { dx: 0, dz: 0, shrink: smallest };
  if (reaches(home)) return home;
  for (let shrink = 1; shrink >= smallest; shrink -= step / size) {
    const found = shifts.filter(([dx, dz]) => fits(dx, dz, shrink)).map(([dx, dz]) => ({ dx, dz, shrink })).find(reaches);
    if (found) return found;
  }
  return null;
}

function spotAt(plate: CellRect, shifts: [number, number][], shrink: number, feet: (x: number, z: number) => THREE.Vector3 | null): PlateSpot | null {
  let standing: PlateSpot | null = null;
  for (const [dx, dz] of shifts) {
    const at = legSpots(movedPlate(plate, { dx, dz, shrink })).map(([x, z]) => feet(x, z));
    if (!at.every((p) => p !== null)) continue;
    if (spread(at.map((p) => (p as THREE.Vector3).y)) <= CLIP_TOLERANCE) return { dx, dz, shrink };
    standing ??= { dx, dz, shrink };
  }
  return standing;
}

export type ItemSpot = { dx: number; dz: number; y: number; slope: { x: number; z: number }; legs: boolean };

type Footing = (x: number, z: number) => THREE.Vector3 | null;

const FLAT = { x: 0, z: 0 };
const SUPPORT_STEP = CLIP_TOLERANCE;

const ITEM_SPOTS = new Map<string, ItemSpot | null>();

export function itemSpot(body: THREE.Object3D, foot: Footprint, rest: { y: number; slope: { x: number; z: number } }, cells: CellRect, stilts: boolean): ItemSpot | null {
  const { rect } = foot;
  const key = `${body.userData.model}:${stilts}:${foot.points.length}:${[rect.x0, rect.x1, rect.z0, rect.z1, rest.y, rest.slope.x, rest.slope.z, cells.x0, cells.x1, cells.z0, cells.z1].map((n) => n.toFixed(3)).join(',')}`;
  const shared = sharedModel(body);
  if (shared && ITEM_SPOTS.has(key)) return ITEM_SPOTS.get(key) as ItemSpot | null;
  const found = searchItemSpot(body, foot, rest, cells, stilts);
  if (shared) ITEM_SPOTS.set(key, found);
  return found;
}

function sharedModel(body: THREE.Object3D): boolean {
  body.updateWorldMatrix(true, true);
  return typeof body.userData.model === 'string' && body.matrixWorld.equals(IDENTITY);
}

function searchItemSpot(body: THREE.Object3D, { rect, points }: Footprint, rest: { y: number; slope: { x: number; z: number } }, cells: CellRect, stilts: boolean): ItemSpot | null {
  const feet = footings(body);
  const exact = exactFootings(body);
  const tops = exactTops(body);
  const onLegSpots = fittedSpot(rect, points, rest, feet, exact, tops);
  if (onLegSpots) return onLegSpots;
  if (heldOn(points, planeAt(rect, rest), exact, tops)) return { dx: 0, dz: 0, y: rest.y, slope: rest.slope, legs: false };
  const shifts = shiftsWithin(shiftRange(rect, cells), FACE_COLUMN);
  for (const support of [SHIFT_SUPPORT, MIN_SUPPORT]) {
    for (const [dx, dz] of shifts) {
      const moved = shifted(points, dx, dz);
      const y = highestTop(moved, tops);
      if (heldOn(moved, () => y, exact, tops, support)) return { dx, dz, y, slope: FLAT, legs: false };
    }
  }
  return stilts ? stiltSpot(body, { rect, points }, shifts, feet, tops) : null;
}

type Rest = { y: number; slope: { x: number; z: number } };

function planeAt(rect: CellRect, rest: Rest): (x: number, z: number) => number {
  const cx = (rect.x0 + rect.x1) / 2;
  const cz = (rect.z0 + rect.z1) / 2;
  return (x, z) => rest.y + rest.slope.x * (x - cx) + rest.slope.z * (z - cz);
}

function fittedSpot(rect: CellRect, points: Sample[], rest: Rest, feet: Footing, exact: Footing, tops: Footing): ItemSpot | null {
  const plane = planeAt(rect, rest);
  const spots = standSpots(rect);
  const under = spots.map(([x, z]) => feet(x, z));
  if (!under.every((foot, i) => foot !== null && Math.abs(plane(spots[i][0], spots[i][1]) - foot.y) <= CLIP_TOLERANCE)) return null;
  const fitted = planeOf(under as THREE.Vector3[]);
  return heldOn(points, planeAt(rect, fitted), exact, tops) ? { dx: 0, dz: 0, ...fitted, legs: false } : null;
}

function stiltSpot(body: THREE.Object3D, { rect, points }: Footprint, shifts: [number, number][], feet: Footing, tops: Footing): ItemSpot | null {
  let best: ItemSpot | null = null;
  for (const [dx, dz] of shifts) {
    const moved = movedPlate(rect, { dx, dz, shrink: 1 });
    if (!tops((moved.x0 + moved.x1) / 2, (moved.z0 + moved.z1) / 2)) continue;
    const y = highestTop(shifted(points, dx, dz), tops);
    if ((!best || y < best.y - CLIP_TOLERANCE) && legsReach(body, moved, y, feet)) best = { dx, dz, y, slope: FLAT, legs: true };
  }
  return best;
}

function shifted(points: Sample[], dx: number, dz: number): Sample[] {
  return points.map(([x, z, lift]) => [x + dx, z + dz, lift]);
}

function shiftRange(rect: CellRect, cells: CellRect): { x0: number; x1: number; z0: number; z1: number } {
  const cx = (rect.x0 + rect.x1) / 2;
  const cz = (rect.z0 + rect.z1) / 2;
  const half = { x: (rect.x1 - rect.x0) / 2, z: (rect.z1 - rect.z0) / 2 };
  return { x0: cells.x0 - half.x - cx, x1: cells.x1 + half.x - cx, z0: cells.z0 - half.z - cz, z1: cells.z1 + half.z - cz };
}

const SHIFT_SUPPORT = MIN_SUPPORT + 0.05;

function heldOn(points: Sample[], plane: (x: number, z: number) => number, feet: Footing, tops: Footing, support = MIN_SUPPORT): boolean {
  let held = 0;
  for (const [x, z, lift] of points) {
    const bottom = plane(x, z) + lift;
    const top = tops(x, z);
    if (top && top.y > bottom + CLIP_TOLERANCE) return false;
    const foot = feet(x, z);
    if (foot && Math.abs(foot.y - bottom) <= CLIP_TOLERANCE) held++;
  }
  return held / points.length >= support;
}

function highestTop(points: Sample[], tops: Footing): number {
  return Math.max(...points.map(([x, z, lift]) => (tops(x, z)?.y ?? -Infinity) - lift));
}

function gridIn(rect: CellRect): [number, number][] {
  const out: [number, number][] = [];
  const nx = Math.max(1, Math.round((rect.x1 - rect.x0) / SUPPORT_STEP));
  const nz = Math.max(1, Math.round((rect.z1 - rect.z0) / SUPPORT_STEP));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) out.push([rect.x0 + ((rect.x1 - rect.x0) * (i + 0.5)) / nx, rect.z0 + ((rect.z1 - rect.z0) * (j + 0.5)) / nz]);
  return out;
}

function standSpots(rect: CellRect): [number, number][] {
  const [a, , , d] = legSpots(rect);
  const mid = (lo: number, hi: number) => [lo, (lo + hi) / 2, hi];
  const inner: [number, number][] = mid(a[0], d[0]).flatMap((x) => mid(a[1], d[1]).map((z): [number, number] => [x, z]));
  return [...legSpots(rect), ...inner.filter(([x, z]) => !legSpots(rect).some(([lx, lz]) => lx === x && lz === z))];
}

function planeOf(corners: THREE.Vector3[]): { y: number; slope: { x: number; z: number } } {
  const [a, b, c, d] = corners;
  const dx = c.x - a.x;
  const dz = b.z - a.z;
  return { y: (a.y + b.y + c.y + d.y) / 4, slope: { x: (c.y + d.y - a.y - b.y) / 2 / dx, z: (b.y + d.y - a.y - c.y) / 2 / dz } };
}

type Face = { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; facing: number; seeThrough: boolean };
type Look = { normal: THREE.Vector3; u: 'x' | 'y' | 'z'; v: 'x' | 'y' | 'z' };
type FaceIndex = { look: Look; start: number; columns: Map<string, Face[]> };
type Footings = { index: FaceIndex; seen: Map<string, THREE.Vector3 | null> };

const LOOKS = {
  down: { normal: new THREE.Vector3(0, 1, 0), u: 'x', v: 'z' },
  '+x': { normal: new THREE.Vector3(1, 0, 0), u: 'z', v: 'y' },
  '-x': { normal: new THREE.Vector3(-1, 0, 0), u: 'z', v: 'y' },
  '+z': { normal: new THREE.Vector3(0, 0, 1), u: 'x', v: 'y' },
  '-z': { normal: new THREE.Vector3(0, 0, -1), u: 'x', v: 'y' },
} satisfies Record<string, Look>;

const INDEXES = new Map<string, FaceIndex>();
const FOOTINGS = new Map<string, Footings>();

function faceIndex(body: THREE.Object3D, name: keyof typeof LOOKS): FaceIndex {
  const key = `${body.userData.model}:${name}`;
  const shared = sharedModel(body);
  const cached = shared ? INDEXES.get(key) : undefined;
  if (cached) return cached;
  const index = indexFaces(body, LOOKS[name]);
  if (shared) INDEXES.set(key, index);
  return index;
}

function footings(body: THREE.Object3D): (x: number, z: number) => THREE.Vector3 | null {
  const shared = sharedModel(body) ? body.userData.model : null;
  const cache = (shared && FOOTINGS.get(shared)) || { index: faceIndex(body, 'down'), seen: new Map() };
  if (shared) FOOTINGS.set(shared, cache);
  const pad = legPad();
  return (x, z) => {
    const i = Math.round(x / FOOTING_GRID);
    const j = Math.round(z / FOOTING_GRID);
    const key = `${i},${j}`;
    if (!cache.seen.has(key)) cache.seen.set(key, padFooting(cache.index, i * FOOTING_GRID, j * FOOTING_GRID, pad));
    return cache.seen.get(key) ?? null;
  };
}

function exactFootings(body: THREE.Object3D): Footing {
  const index = faceIndex(body, 'down');
  return (x, z) => topFooting(index, x, z);
}

function exactTops(body: THREE.Object3D): Footing {
  const index = faceIndex(body, 'down');
  return (x, z) => nearestFace(index, x, z)?.point ?? null;
}


function padFooting(index: FaceIndex, x: number, z: number, pad: number): THREE.Vector3 | null {
  const center = topFooting(index, x, z);
  if (!center) return null;
  const rim = [[-pad, -pad], [-pad, pad], [pad, -pad], [pad, pad]].map(([dx, dz]) => topFooting(index, x + dx, z + dz));
  return rim.every((p) => p !== null && Math.abs(p.y - center.y) <= CLIP_TOLERANCE) ? center : null;
}

function indexFaces(body: THREE.Object3D, look: Look): FaceIndex {
  const columns = new Map<string, Face[]>();
  body.traverse((o) => {
    if (o instanceof THREE.Mesh) for (const face of facingFaces(o, look.normal)) addFace(columns, face, look);
  });
  const box = new THREE.Box3().setFromObject(body);
  const far = Math.max(box.max.dot(look.normal), box.min.dot(look.normal)) + CLIP_TOLERANCE;
  return { look, start: far, columns };
}

function facingFaces(mesh: THREE.Mesh, normal: THREE.Vector3): Face[] {
  const pos = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const corner = (k: number) => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(k) : k).applyMatrix4(mesh.matrixWorld);
  const faces: Face[] = [];
  for (let k = 0; k < (index ? index.count : pos.count); k += 3) {
    const face = { a: corner(k), b: corner(k + 1), c: corner(k + 2), facing: 0, seeThrough: seeThrough(mesh) };
    face.facing = new THREE.Triangle(face.a, face.b, face.c).getNormal(new THREE.Vector3()).dot(normal);
    if (face.facing > 0) faces.push(face);
  }
  return faces;
}

function addFace(columns: Map<string, Face[]>, face: Face, look: Look): void {
  for (const key of columnsUnder(face, look)) {
    const column = columns.get(key);
    if (column) column.push(face);
    else columns.set(key, [face]);
  }
}

function columnsUnder(face: Face, look: Look): string[] {
  const us = [face.a, face.b, face.c].map((p) => Math.floor(p[look.u] / FACE_COLUMN));
  const vs = [face.a, face.b, face.c].map((p) => Math.floor(p[look.v] / FACE_COLUMN));
  const keys: string[] = [];
  for (let i = Math.min(...us); i <= Math.max(...us); i++) for (let j = Math.min(...vs); j <= Math.max(...vs); j++) keys.push(`${i},${j}`);
  return keys;
}

function topFooting(index: FaceIndex, x: number, z: number): THREE.Vector3 | null {
  const best = nearestFace(index, x, z);
  if (!best || best.face.seeThrough || slopeOf(best.face) > MAX_SLOPE) return null;
  return best.point;
}

function nearestFace(index: FaceIndex, u: number, v: number): { point: THREE.Vector3; face: Face } | null {
  const { look } = index;
  const origin = look.normal.clone().multiplyScalar(index.start);
  origin[look.u] = u;
  origin[look.v] = v;
  const ray = new THREE.Ray(origin, look.normal.clone().negate());
  let best: { point: THREE.Vector3; face: Face } | null = null;
  for (const face of index.columns.get(`${Math.floor(u / FACE_COLUMN)},${Math.floor(v / FACE_COLUMN)}`) ?? []) {
    const point = ray.intersectTriangle(face.a, face.b, face.c, false, new THREE.Vector3());
    if (point && (!best || point.dot(look.normal) > best.point.dot(look.normal))) best = { point, face };
  }
  return best;
}

function slopeOf(face: Face): number {
  return Math.sqrt(1 - face.facing * face.facing) / face.facing;
}

function legSpots(plate: CellRect): [number, number][] {
  const pad = legPad();
  return [[plate.x0 + pad, plate.z0 + pad], [plate.x0 + pad, plate.z1 - pad], [plate.x1 - pad, plate.z0 + pad], [plate.x1 - pad, plate.z1 - pad]];
}

export function moveBySpot(at: { pos: THREE.Vector3; scale: THREE.Vector3 }, spot: PlateSpot): void {
  at.pos.x += spot.dx;
  at.pos.z += spot.dz;
  at.scale.x *= spot.shrink;
  at.scale.z *= spot.shrink;
}

export function movedPlate(plate: CellRect, spot: PlateSpot): CellRect {
  const cx = (plate.x0 + plate.x1) / 2 + spot.dx;
  const cz = (plate.z0 + plate.z1) / 2 + spot.dz;
  const hx = ((plate.x1 - plate.x0) / 2) * spot.shrink;
  const hz = ((plate.z1 - plate.z0) / 2) * spot.shrink;
  return { unit: plate.unit, x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz };
}

export function plateLegs(body: THREE.Object3D, plate: CellRect, top: number, makeLeg: (role: 'leg' | 'brace') => THREE.Object3D, under: (x: number, z: number) => [number, number] = (x, z) => [x, z]): THREE.Object3D[] {
  const feet = footings(body);
  const center = new THREE.Vector3((plate.x0 + plate.x1) / 2, top, (plate.z0 + plate.z1) / 2);
  const legs: THREE.Object3D[] = [];
  for (const spot of legSpots(plate)) {
    const [x, z] = feet(spot[0], spot[1]) ? under(spot[0], spot[1]) : spot;
    const moved = new THREE.Vector3(x, top, z);
    const corner = feet(x, z) || farBraceHit(body, moved, center) ? moved : new THREE.Vector3(spot[0], top, spot[1]);
    const foot = feet(corner.x, corner.z);
    if (foot && top - foot.y <= CLIP_TOLERANCE / 2) continue;
    legs.push(foot ? strut(makeLeg('leg'), foot, corner) : strut(makeLeg('brace'), braceFoot(body, corner, center), corner));
  }
  return legs;
}

export function postStands(body: THREE.Object3D, at: THREE.Vector3, bottom: number): boolean {
  const feet = footings(body);
  const foot = plateOf('wmount_riser', 0, { pos: at.clone().setY(bottom), yaw: 0, scale: new THREE.Vector3(1, 1, 1) });
  const xs = [foot.x0, (foot.x0 + foot.x1) / 2, foot.x1];
  const zs = [foot.z0, (foot.z0 + foot.z1) / 2, foot.z1];
  return xs.flatMap((x) => zs.map((z) => [x, z])).every(([x, z]) => {
    const hit = feet(x, z);
    return hit !== null && Math.abs(bottom - hit.y) <= CLIP_TOLERANCE;
  });
}

function braceFoot(body: THREE.Object3D, corner: THREE.Vector3, center: THREE.Vector3): THREE.Vector3 {
  const hit = farBraceHit(body, corner, center) ?? braceBehindGlass(body, corner, center);
  if (!hit) throw new Error(`No body wall below the gun plate corner at ${corner.x.toFixed(2)},${corner.z.toFixed(2)} to brace it to`);
  return hit;
}

function braceHit(body: THREE.Object3D, corner: THREE.Vector3, center: THREE.Vector3): THREE.Vector3 | undefined {
  return nearestWall(body, corner, inwardOf(corner, center), 0);
}

function farBraceHit(body: THREE.Object3D, corner: THREE.Vector3, center: THREE.Vector3): THREE.Vector3 | undefined {
  const bodyCenter = new THREE.Vector3(0, corner.y, 0);
  return braceHit(body, corner, center) ?? nearestWall(body, corner, inwardOf(corner, bodyCenter), 0) ?? wallHit(body, corner, DOWN, 0) ?? undefined;
}

function braceBehindGlass(body: THREE.Object3D, corner: THREE.Vector3, center: THREE.Vector3): THREE.Vector3 | undefined {
  const inward = inwardOf(corner, center);
  return nearestWall(body, corner, inward, GLASS_SKIN) ?? nearestWall(body, corner, inward.negate(), GLASS_SKIN);
}

function inwardOf(corner: THREE.Vector3, center: THREE.Vector3): THREE.Vector3 {
  return center.clone().sub(corner).setY(0).normalize();
}

function nearestWall(body: THREE.Object3D, corner: THREE.Vector3, along: THREE.Vector3, skin: number): THREE.Vector3 | undefined {
  return BRACE_ANGLES.map((deg) => wallHit(body, corner, along.clone().multiplyScalar(Math.cos(deg * THREE.MathUtils.DEG2RAD)).setY(-Math.sin(deg * THREE.MathUtils.DEG2RAD)), skin))
    .filter((p): p is THREE.Vector3 => p !== null)
    .sort((a, b) => a.distanceTo(corner) - b.distanceTo(corner))[0];
}

function legsReach(body: THREE.Object3D, plate: CellRect, top: number, feet: Footing, brace = braceHit): boolean {
  const center = new THREE.Vector3((plate.x0 + plate.x1) / 2, top, (plate.z0 + plate.z1) / 2);
  return legSpots(plate).every(([x, z]) => feet(x, z) !== null || brace(body, new THREE.Vector3(x, top, z), center) !== undefined);
}

const FACES = new Map<string, number | null>();

export function bodyFace(body: THREE.Object3D, axis: 'x' | 'z', outward: number, lateral: [number, number], height: [number, number]): number | null {
  body.updateWorldMatrix(true, true);
  const shared = typeof body.userData.model === 'string' && body.matrixWorld.equals(IDENTITY);
  const key = `${body.userData.model}:${axis}:${outward}:${lateral.map((n) => n.toFixed(3)).join(',')}:${height.map((n) => n.toFixed(3)).join(',')}`;
  if (shared && FACES.has(key)) return FACES.get(key) as number | null;
  const found = outermost(body, axis, outward, lateral, height);
  if (shared) FACES.set(key, found);
  return found;
}

function outermost(body: THREE.Object3D, axis: 'x' | 'z', outward: number, lateral: [number, number], height: [number, number]): number | null {
  const index = faceIndex(body, `${outward > 0 ? '+' : '-'}${axis}` as keyof typeof LOOKS);
  const hits = facePoints(lateral, height).map(([u, y]) => nearestFace(index, u, y)?.point[axis]);
  const found = hits.filter((h): h is number => h !== undefined).map((h) => outward * h);
  return found.length === 0 ? null : outward * Math.max(...found);
}

function facePoints(lateral: [number, number], height: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  for (let u = lateral[0] + FACE_COLUMN / 2; u < lateral[1]; u += FACE_COLUMN) {
    for (let y = height[0] + FACE_COLUMN / 2; y < height[1]; y += FACE_COLUMN) out.push([u, y]);
  }
  return out;
}

export function rearHang(body: THREE.Object3D, z: number): THREE.Vector3 {
  body.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(body);
  for (let x = box.min.x + FOOTING_GRID; x < box.min.x + (box.max.x - box.min.x) / 4; x += FOOTING_GRID) {
    const hit = new THREE.Raycaster(new THREE.Vector3(x, box.min.y - CLIP_TOLERANCE, z), UP).intersectObject(body, true)[0];
    if (hit && !seeThrough(hit.object)) return hit.point;
  }
  throw new Error(`The base has no underside in its rear quarter at z ${z.toFixed(2)} to hang a chain from`);
}

function wallHit(body: THREE.Object3D, from: THREE.Vector3, dir: THREE.Vector3, skin: number): THREE.Vector3 | null {
  const start = from.clone().addScaledVector(dir, -CLIP_TOLERANCE);
  const hits = new THREE.Raycaster(start, dir).intersectObject(body, true);
  const solid = hits.find((h) => !seeThrough(h.object));
  return solid && solid.distance - hits[0].distance <= skin ? solid.point : null;
}

function seeThrough(obj: THREE.Object3D): boolean {
  if (obj.userData.lamp) return true;
  const material = (obj as THREE.Mesh).material as THREE.Material | undefined;
  return material !== undefined && SEE_THROUGH.has(material.name);
}

function strut(leg: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): THREE.Object3D {
  const along = to.clone().sub(from);
  leg.position.copy(from);
  leg.quaternion.setFromUnitVectors(UP, along.clone().normalize());
  leg.scale.set(1, along.length() / socket('wmount_leg', 'top').y, 1);
  return leg;
}

function legPad(): number {
  return Math.abs(socket('wmount_leg', 'pad').x);
}

function shiftsWithin(range: { x0: number; x1: number; z0: number; z1: number }, step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = Math.ceil(range.x0 / step); i * step <= range.x1; i++) {
    for (let j = Math.ceil(range.z0 / step); j * step <= range.z1; j++) out.push([i * step, j * step]);
  }
  return out.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
}

function cellSize(chassisId: string, plate: CellRect): number {
  const sample = surfaceSamples(chassisId, plate.unit, { x: (plate.x0 + plate.x1) / 2, z: (plate.z0 + plate.z1) / 2 }, Math.hypot(plate.x1 - plate.x0, plate.z1 - plate.z0))[0];
  if (!sample) throw new Error(`The ${chassisId} model has no surface near the gun plate at x ${plate.x0.toFixed(2)}..${plate.x1.toFixed(2)}`);
  return sample.half * 2;
}

function nearCells(cells: CellRect, x: number, z: number, rx: number, rz: number): boolean {
  return x >= cells.x0 - rx && x <= cells.x1 + rx && z >= cells.z0 - rz && z <= cells.z1 + rz;
}

function spread(tops: number[]): number {
  return Math.max(...tops) - Math.min(...tops);
}
