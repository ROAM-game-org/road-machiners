import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Mesh, type BufferGeometry, type Material, Texture, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SURFACE_MODELS } from '../../render/partLooks';
import { VIEW_METERS, ZOOM } from './camera';
import { loadModels, model, NAMES, type ModelName } from './models';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const DEFERRED_FAULTS: Partial<Record<ModelName, number>> = {
  cargo_pod: 1,
  crane_grab: 11,
  fort_cistern_inner: 8,
  fort_cistern_wall: 2,
  fort_compound_gate: 1,
  fort_compound_tower: 3,
  fort_compound_wall: 4,
  fort_outpost_gate: 11,
  fort_outpost_leaf: 6,
  fort_outpost_shut: 9,
  fort_outpost_wall: 2,
  fort_patchwork_gate: 1,
  fort_pumpworks_gate: 1,
  fort_pumpworks_inner: 10,
  fort_pumpworks_tower: 2,
  fort_pumpworks_wall: 12,
  fort_ring_gate: 3,
  fort_ring_wall: 6,
  fort_scrap_gate: 6,
  fort_scrap_tower: 4,
  fort_scrap_wall: 2,
  fort_yard_gate: 7,
  fort_yard_tower: 1,
  guard_post: 1,
  hull_scaffold: 3,
  hull_shell: 1,
  hull_tower: 3,
  pump_station: 1,
  ship_bow: 4,
  ship_cage: 2,
  ship_flap: 4,
  ship_hull_ring: 1,
  ship_nose: 4,
  ship_wing_deck: 5,
  tank_hulk: 1,
};

const PLANE_TOLERANCE = 0.001;
const NORMAL_TOLERANCE = 0.0005;
const MAX_OVERLAP = 1e-4;
const WELD = 0.001;
const TALL_WINDOW_PX = 2000;
const MIN_LIP = VIEW_METERS / ZOOM.max / TALL_WINDOW_PX;
const MIN_RUN = 4 * MIN_LIP;
const TOUCH = 1e-8;
const PARALLEL = 0.03;
const QUANTUM = 1e-4;
const SIDE_AXIS: Vec3 = [0.6, 0.7, 0.39];
const LOOK_OFFSET = 0.003;
const LOOK_LIFT = 0.6;
const UNDERSIDE = -0.5;
const REACH = 1e-6;

type Vec3 = [number, number, number];
type Point2 = [number, number];
type Face = { material: string; points: Vec3[]; normal: Vec3; offset: number; plane: Vec3; planeOffset: number; low: Vec3; high: Vec3 };
type Fault = { model: string; kind: 'coplanar' | 'butt'; materials: string; plane: Vec3; offset: number; size: number; low: Vec3; high: Vec3 };
type PlanePair = { a: Face; b: Face; sameFacing: boolean };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const bounds = (points: Vec3[], pick: (...v: number[]) => number): Vec3 => [0, 1, 2].map((k) => pick(...points.map((p) => p[k]))) as Vec3;

function facesOf(root: Object3D): Face[] {
  const faces: Face[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const geometry = (o.geometry as BufferGeometry).clone().applyMatrix4(o.matrixWorld);
    const material = ((Array.isArray(o.material) ? o.material[0] : o.material) as Material).name;
    const pos = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const count = index ? index.count : pos.count;
    const at = (i: number) => (index ? index.getX(i) : i);
    for (let t = 0; t < count; t += 3) {
      const points = [0, 1, 2].map((k): Vec3 => [pos.getX(at(t + k)), pos.getY(at(t + k)), pos.getZ(at(t + k))]);
      const n = cross(sub(points[1], points[0]), sub(points[2], points[0]));
      const len = Math.hypot(...n);
      if (len === 0) continue;
      const normal: Vec3 = [n[0] / len, n[1] / len, n[2] / len];
      const offset = dot(normal, points[0]);
      const flip = dot(normal, SIDE_AXIS) < 0 ? -1 : 1;
      const plane: Vec3 = [normal[0] * flip, normal[1] * flip, normal[2] * flip];
      faces.push({ material, points, normal, offset, plane, planeOffset: offset * flip, low: bounds(points, Math.min), high: bounds(points, Math.max) });
    }
  });
  return faces;
}

function planeBasis(normal: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = cross(normal, helper);
  const ulen = Math.hypot(...u);
  const unit: Vec3 = [u[0] / ulen, u[1] / ulen, u[2] / ulen];
  return [unit, cross(normal, unit)];
}

const area2 = (poly: Point2[]) => {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [a, b] = [poly[i], poly[(i + 1) % poly.length]];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
};

function clipToEdge(poly: Point2[], a: Point2, b: Point2): Point2[] {
  const side = (p: Point2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const out: Point2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [p, q] = [poly[i], poly[(i + 1) % poly.length]];
    const [sp, sq] = [side(p), side(q)];
    if (sp >= 0) out.push(p);
    if (sp >= 0 !== sq >= 0) out.push([p[0] + (sp / (sp - sq)) * (q[0] - p[0]), p[1] + (sp / (sp - sq)) * (q[1] - p[1])]);
  }
  return out;
}

type Overlap = { area: number; centre: Vec3 };

function overlapOf(a: Face, b: Face): Overlap {
  const [u, v] = planeBasis(a.plane);
  const flat = (f: Face): Point2[] => {
    const poly = f.points.map((p): Point2 => [dot(p, u), dot(p, v)]);
    return area2(poly) < 0 ? poly.reverse() : poly;
  };
  const clipper = flat(b);
  let poly = flat(a);
  for (let i = 0; i < clipper.length && poly.length > 2; i++) poly = clipToEdge(poly, clipper[i], clipper[(i + 1) % clipper.length]);
  if (poly.length < 3) return { area: 0, centre: a.points[0] };
  const mean = poly.reduce((sum, p): Point2 => [sum[0] + p[0] / poly.length, sum[1] + p[1] / poly.length], [0, 0] as Point2);
  const along = a.planeOffset;
  const centre: Vec3 = [0, 1, 2].map((k) => u[k] * mean[0] + v[k] * mean[1] + a.plane[k] * along) as Vec3;
  return { area: Math.abs(area2(poly)), centre };
}

function crosses(face: Face, origin: Vec3, dir: Vec3): boolean {
  const [p0, p1, p2] = face.points;
  const e1 = sub(p1, p0);
  const e2 = sub(p2, p0);
  const h = cross(dir, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return false;
  const s = sub(origin, p0);
  const u = dot(s, h) / det;
  if (u < 0 || u > 1) return false;
  const q = cross(s, e1);
  const v = dot(dir, q) / det;
  if (v < 0 || u + v > 1) return false;
  return dot(e2, q) / det > REACH;
}

function seenFrom(faces: Face[], point: Vec3, outward: Vec3): boolean {
  const dir0: Vec3 = [outward[0], outward[1] + LOOK_LIFT, outward[2]];
  const len = Math.hypot(...dir0);
  const dir: Vec3 = [dir0[0] / len, dir0[1] / len, dir0[2] / len];
  const origin: Vec3 = [point[0] + outward[0] * LOOK_OFFSET, point[1] + outward[1] * LOOK_OFFSET, point[2] + outward[2] * LOOK_OFFSET];
  return !faces.some((f) => crosses(f, origin, dir));
}

const sharesPlane = (a: Face, b: Face) =>
  Math.abs(a.plane[0] - b.plane[0]) < NORMAL_TOLERANCE &&
  Math.abs(a.plane[1] - b.plane[1]) < NORMAL_TOLERANCE &&
  Math.abs(a.plane[2] - b.plane[2]) < NORMAL_TOLERANCE &&
  Math.abs(a.planeOffset - b.planeOffset) < PLANE_TOLERANCE;

const boxesTouch = (a: Face, b: Face) => [0, 1, 2].every((k) => a.low[k] <= b.high[k] + PLANE_TOLERANCE && b.low[k] <= a.high[k] + PLANE_TOLERANCE);

function planePairs(faces: Face[]): PlanePair[] {
  const sorted = [...faces].sort((a, b) => a.planeOffset - b.planeOffset);
  const pairs: PlanePair[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].planeOffset - sorted[i].planeOffset < PLANE_TOLERANCE; j++) {
      const [a, b] = [sorted[i], sorted[j]];
      if (sharesPlane(a, b) && boxesTouch(a, b)) pairs.push({ a, b, sameFacing: dot(a.normal, b.normal) > 0 });
    }
  }
  return pairs;
}

function addFault(found: Map<string, Fault>, fault: Fault, key: string) {
  const known = found.get(key);
  if (!known) {
    found.set(key, fault);
    return;
  }
  known.size += fault.size;
  known.low = known.low.map((v, k) => Math.min(v, fault.low[k])) as Vec3;
  known.high = known.high.map((v, k) => Math.max(v, fault.high[k])) as Vec3;
}

const planeKey = (f: Face) => `${f.plane.map((c) => c.toFixed(3))}|${f.planeOffset.toFixed(3)}`;
const boxOf = (faces: Face[]) => ({ low: bounds(faces.flatMap((f) => f.points), Math.min), high: bounds(faces.flatMap((f) => f.points), Math.max) });

function coplanarFaults(model: string, faces: Face[], pairs: PlanePair[], anyMaterial: boolean): Fault[] {
  const found = new Map<string, Fault>();
  for (const { a, b, sameFacing } of pairs) {
    if (!sameFacing || (!anyMaterial && a.material === b.material) || a.normal[1] < UNDERSIDE) continue;
    const { area, centre } = overlapOf(a, b);
    if (area < TOUCH || !seenFrom(faces, centre, a.normal)) continue;
    const materials = [a.material, b.material].sort().join(' + ');
    const box = boxOf([a, b]);
    addFault(found, { model, kind: 'coplanar', materials, plane: a.normal, offset: a.offset, size: area, ...box }, `${materials}|${planeKey(a)}`);
  }
  return [...found.values()].filter((f) => f.size > MAX_OVERLAP);
}

const quantized = (p: Vec3) => p.map((c) => Math.round(c / QUANTUM)).join(',');

type Rim = { ends: [Vec3, Vec3]; outward: Vec3 };

function boundaryEdges(faces: Face[]): Rim[] {
  const edges = new Map<string, { rim: Rim; count: number }>();
  for (const face of faces) {
    for (let i = 0; i < 3; i++) {
      const [p, q, far] = [face.points[i], face.points[(i + 1) % 3], face.points[(i + 2) % 3]];
      const [kp, kq] = [quantized(p), quantized(q)];
      const key = kp < kq ? `${kp}|${kq}` : `${kq}|${kp}`;
      const known = edges.get(key);
      if (known) {
        known.count++;
        continue;
      }
      const along = sub(q, p);
      const side = cross(face.normal, along);
      const sign = dot(side, sub(far, p)) > 0 ? -1 : 1;
      const len = Math.hypot(...side) || 1;
      edges.set(key, { rim: { ends: [p, q], outward: [(side[0] * sign) / len, (side[1] * sign) / len, (side[2] * sign) / len] }, count: 1 });
    }
  }
  return [...edges.values()].filter((e) => e.count === 1).map((e) => e.rim);
}

type Run = { at: Vec3; across: Vec3 };

function parallelRun(mine: Rim, theirs: Rim): Run | null {
  const [a, b] = mine.ends;
  const [c, d] = theirs.ends;
  const length = Math.hypot(...sub(b, a));
  const otherLength = Math.hypot(...sub(d, c));
  if (length === 0 || otherLength === 0) return null;
  const unit: Vec3 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length, (b[2] - a[2]) / length];
  if (Math.hypot(...cross(unit, sub(d, c))) / otherLength > PARALLEL) return null;
  const offAxis = (p: Vec3): Vec3 => {
    const along = dot(sub(p, a), unit);
    return sub(p, [a[0] + unit[0] * along, a[1] + unit[1] * along, a[2] + unit[2] * along]);
  };
  const [first, second] = [offAxis(c), offAxis(d)];
  const gaps = [Math.hypot(...first), Math.hypot(...second)];
  if (gaps.some((gap) => gap <= WELD || gap >= MIN_LIP)) return null;
  const [from, to] = [dot(sub(c, a), unit), dot(sub(d, a), unit)].sort((x, y) => x - y);
  const [start, end] = [Math.max(0, from), Math.min(length, to)];
  if (end - start < MIN_RUN) return null;
  const middle = (start + end) / 2;
  const across: Vec3 = [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2, (first[2] + second[2]) / 2];
  return { at: [a[0] + unit[0] * middle, a[1] + unit[1] * middle, a[2] + unit[2] * middle], across };
}

function slivers(faces: Face[], rims: Rim[], edges: Rim[], mineNormal: Vec3, theirNormal: Vec3): Vec3[] {
  const found: Vec3[] = [];
  for (const rim of rims) {
    for (const edge of edges) {
      const run = parallelRun(rim, edge);
      if (!run) continue;
      const theirsIsWider = dot(run.across, rim.outward) > 0;
      const ledgeNormal = theirsIsWider ? theirNormal : mineNormal;
      const ledge: Vec3 = theirsIsWider ? [run.at[0] + run.across[0] / 2, run.at[1] + run.across[1] / 2, run.at[2] + run.across[2] / 2] : run.at;
      if (ledgeNormal[1] >= UNDERSIDE && seenFrom(faces, ledge, ledgeNormal)) found.push(run.at);
    }
  }
  return found;
}

function buttFaults(model: string, faces: Face[], pairs: PlanePair[]): Fault[] {
  const found = new Map<string, Fault>();
  const touching = new Set<Face>();
  for (const { a, b, sameFacing } of pairs) {
    if (sameFacing || overlapOf(a, b).area < TOUCH) continue;
    touching.add(a);
    touching.add(b);
  }
  const facingFront = (f: Face) => dot(f.normal, f.plane) > 0;
  const grouped = new Set<Face>();
  for (const seed of touching) {
    if (grouped.has(seed)) continue;
    const inPlane = faces.filter((f) => sharesPlane(f, seed));
    inPlane.forEach((f) => grouped.add(f));
    const key = planeKey(seed);
    const overlapping = (f: Face) => touching.has(f);
    const sets = [inPlane.filter(facingFront), inPlane.filter((f) => !facingFront(f))];
    for (let side = 0; side < 2; side++) {
      const mine = sets[side].filter(overlapping);
      const theirs = sets[1 - side].filter(overlapping);
      const onTouching = (rim: Rim, among: Face[]) => among.some((f) => f.points.some((c) => rim.ends.some((e) => quantized(e) === quantized(c))));
      const myRims = boundaryEdges(sets[side]).filter((r) => onTouching(r, mine));
      const theirRims = boundaryEdges(sets[1 - side]).filter((r) => onTouching(r, theirs));
      if (mine.length === 0 || theirs.length === 0) continue;
      const bad = slivers(faces, myRims, theirRims, mine[0].normal, theirs[0].normal);
      if (bad.length === 0) continue;
      const materials = [...new Set([...mine, ...theirs].map((f) => f.material))].sort().join(' + ');
      addFault(found, { model, kind: 'butt', materials, plane: mine[0].normal, offset: mine[0].offset, size: bad.length, low: bounds(bad, Math.min), high: bounds(bad, Math.max) }, key);
    }
  }
  return [...found.values()];
}

const describeFault = (f: Fault) =>
  `${f.model} ${f.kind} ${f.materials}, normal ${f.plane.map((c) => c.toFixed(3)).join(',')}, offset ${f.offset.toFixed(3)}, ${f.kind === 'coplanar' ? `${(f.size * 1e4).toFixed(0)} cm2` : `${f.size} edges closer than ${(MIN_LIP * 1000).toFixed(0)} mm`}, from ${f.low.map((c) => c.toFixed(3))} to ${f.high.map((c) => c.toFixed(3))}`;

function faultsOf(model: string, root: Object3D, anyMaterial: boolean): Fault[] {
  const faces = facesOf(root);
  const pairs = planePairs(faces);
  return [...coplanarFaults(model, faces, pairs, anyMaterial), ...buttFaults(model, faces, pairs)];
}

const fixtureRoot = async (file: string): Promise<Object3D> => {
  const loader = new GLTFLoader().register(() => ({ name: 'blank_textures', loadTexture: async () => new Texture() }));
  const bytes = readFileSync(new URL(`./surface-fault-fixtures/${file}`, import.meta.url));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
  return gltf.scene;
};

describe('no model has faces that fight for a pixel or meet in a sliver', () => {
  it.each(NAMES)('%s', (name) => {
    const truck = SURFACE_MODELS.includes(name);
    const found = faultsOf(name, model(name), truck);
    expect(found, found.map(describeFault).join('\n')).toHaveLength(truck ? 0 : (DEFERRED_FAULTS[name] ?? 0));
  });

  it('still sees glass on the scout and lamps on the Niva', () => {
    const materials = (name: ModelName) => new Set(facesOf(model(name)).map((f) => f.material));
    expect(materials('base_scout').has('glass')).toBe(true);
    expect(materials('base_niva').has('light')).toBe(true);
  });

  it('finds the hood seam and the tow hook pieces of the Longbed as they stood in issue 931', async () => {
    const found = faultsOf('base_longbed', await fixtureRoot('longbed-931.glb'), true);
    const hoodSeam = found.filter((f) => f.kind === 'butt' && Math.abs(f.plane[0]) > 0.99 && Math.abs(f.offset - 3.31) < 0.001);
    const hookPieces = found.filter((f) => f.kind === 'coplanar' && f.materials === 'metal + metal' && f.low[0] > 3.4 && f.high[0] < 3.6);
    expect(hoodSeam.map(describeFault)).not.toEqual([]);
    expect(hookPieces.map(describeFault)).not.toEqual([]);
  });
});
