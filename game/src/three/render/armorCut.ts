import * as THREE from 'three';
import { isShield, partDef, type ShieldDef } from '../../data/parts';
import { PHYSICS } from '../../data/physics';
import { TRUCK_LOOK } from '../../render/partLooks';
import { CLIP_TOLERANCE, cellRect, cellSteps, restOn, unitBody, type Body, type CellRect } from '../../sim/body';
import { isMounted, itemCells, itemSize, plateSide, type SideLetter } from '../../sim/grid';
import type { GridItem, Vehicle } from '../../sim/types';
import { bodyFace, FACE_COLUMN, faceProfile, lowestFace, profileFace, profileGlassLine, type FaceProfile } from './gunStand';

export type WheelCut = { center: THREE.Vector3; radius: number; halfWidth: number };
export type CutSpec = { wheels: WheelCut[]; lamps: THREE.Box3[] };

const CORNER_DIGITS = 3;

export const CUT_SLOTS = { wheels: 6, lamps: 8 };

type Positions = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

export function cutSpec(wheels: readonly THREE.Box3[], lamps: readonly THREE.Box3[], half: Body['half'], look: typeof TRUCK_LOOK): CutSpec {
  return {
    wheels: wheels.map((box) => wheelCut(box, look)),
    lamps: lamps.filter((island) => atEnd(island, half, look)).map((island) => lampWindow(island, look)),
  };
}

function wheelCut(box: THREE.Box3, look: typeof TRUCK_LOOK): WheelCut {
  const size = box.getSize(new THREE.Vector3());
  return { center: box.getCenter(new THREE.Vector3()), radius: (size.y / 2) * look.cutScale, halfWidth: size.z / 2 };
}

function atEnd(island: THREE.Box3, half: Body['half'], look: typeof TRUCK_LOOK): boolean {
  return Math.abs(island.getCenter(new THREE.Vector3()).x) > half.x * look.lampEndShare;
}

function lampWindow(island: THREE.Box3, look: typeof TRUCK_LOOK): THREE.Box3 {
  const c = island.getCenter(new THREE.Vector3());
  const reach = island.getSize(new THREE.Vector3()).multiplyScalar(look.cutScale / 2);
  const front = c.x > 0;
  const x0 = front ? c.x - reach.x : c.x - look.lampReach;
  const x1 = front ? c.x + look.lampReach : c.x + reach.x;
  return new THREE.Box3(new THREE.Vector3(x0, c.y - reach.y, c.z - reach.z), new THREE.Vector3(x1, c.y + reach.y, c.z + reach.z));
}

class DisjointSet {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root];
    return root;
  }

  join(a: number, b: number): void {
    this.parent[this.find(b)] = this.find(a);
  }
}

function cornersOf(pos: Positions): { cornerOf: number[]; count: number } {
  const known = new Map<string, number>();
  const cornerOf = Array.from({ length: pos.count }, (_, i) => {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((n) => n.toFixed(CORNER_DIGITS)).join(',');
    const id = known.get(key) ?? known.size;
    known.set(key, id);
    return id;
  });
  return { cornerOf, count: known.size };
}

function vertexOrder(geo: THREE.BufferGeometry, vertexCount: number): ArrayLike<number> {
  return geo.index ? geo.index.array : Array.from({ length: vertexCount }, (_, i) => i);
}

export function lampIslands(geo: THREE.BufferGeometry): THREE.Box3[] {
  const pos = geo.getAttribute('position');
  const { cornerOf, count } = cornersOf(pos);
  const order = vertexOrder(geo, pos.count);
  const sets = new DisjointSet(count);
  for (let n = 0; n + 2 < order.length; n += 3) {
    sets.join(cornerOf[order[n]], cornerOf[order[n + 1]]);
    sets.join(cornerOf[order[n]], cornerOf[order[n + 2]]);
  }
  const boxes = new Map<number, THREE.Box3>();
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const root = sets.find(cornerOf[i]);
    boxes.set(root, (boxes.get(root) ?? new THREE.Box3()).expandByPoint(p.fromBufferAttribute(pos, i)));
  }
  return [...boxes.values()];
}

const VERTEX_DECLARE = 'varying vec3 vCutPos;';
const VERTEX_SET = 'vCutPos = transformed;';
const FRAGMENT_DECLARE = `varying vec3 vCutPos;
uniform vec4 cutWheelAt[CUT_WHEELS];
uniform float cutWheelHalfWidth[CUT_WHEELS];
uniform vec3 cutLampMin[CUT_LAMPS];
uniform vec3 cutLampMax[CUT_LAMPS];`;
const FRAGMENT_DISCARD = `for (int i = 0; i < CUT_WHEELS; i++) {
  if (length(vCutPos.xy - cutWheelAt[i].xy) < cutWheelAt[i].w && sign(cutWheelAt[i].z) * (vCutPos.z - cutWheelAt[i].z) > -cutWheelHalfWidth[i]) discard;
}
for (int i = 0; i < CUT_LAMPS; i++) {
  if (all(greaterThan(vCutPos, cutLampMin[i])) && all(lessThan(vCutPos, cutLampMax[i]))) discard;
}`;

type CutUniforms = Record<string, THREE.IUniform>;

const uniformsOfSpec = new WeakMap<CutSpec, CutUniforms>();

function padded<T>(values: T[], slots: number, empty: () => T, what: string): T[] {
  if (values.length > slots) throw new Error(`Armor cut has ${values.length} ${what}, more than its ${slots} shader slots`);
  return [...values, ...Array.from({ length: slots - values.length }, empty)];
}

function uniformsOf(spec: CutSpec): CutUniforms {
  const known = uniformsOfSpec.get(spec);
  if (known) return known;
  const wheels = padded(spec.wheels, CUT_SLOTS.wheels, () => ({ center: new THREE.Vector3(), radius: 0, halfWidth: 0 }), 'wheels');
  const lamps = padded(spec.lamps, CUT_SLOTS.lamps, () => new THREE.Box3(), 'lamps');
  const uniforms: CutUniforms = {
    cutWheelAt: { value: wheels.map((w) => new THREE.Vector4(w.center.x, w.center.y, w.center.z, w.radius)) },
    cutWheelHalfWidth: { value: wheels.map((w) => w.halfWidth) },
    cutLampMin: { value: lamps.map((b) => b.min.clone()) },
    cutLampMax: { value: lamps.map((b) => b.max.clone()) },
  };
  uniformsOfSpec.set(spec, uniforms);
  return uniforms;
}

function insertAfter(source: string, token: string, extra: string): string {
  if (!source.includes(token)) throw new Error(`Shader has no ${token} to cut at`);
  return source.replace(token, () => `${token}\n${extra}`);
}

export function withCut<M extends THREE.Material>(source: M, spec: CutSpec): M {
  const own = source.clone() as M;
  const before = source.onBeforeCompile;
  const sourceKey = source.customProgramCacheKey;
  const uniforms = uniformsOf(spec);
  own.defines = { ...source.defines, CUT_WHEELS: CUT_SLOTS.wheels, CUT_LAMPS: CUT_SLOTS.lamps };
  own.onBeforeCompile = (shader, renderer) => {
    before.call(own, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = insertAfter(insertAfter(shader.vertexShader, '#include <common>', VERTEX_DECLARE), '#include <project_vertex>', VERTEX_SET);
    shader.fragmentShader = insertAfter(insertAfter(shader.fragmentShader, '#include <common>', FRAGMENT_DECLARE), '#include <clipping_planes_fragment>', FRAGMENT_DISCARD);
  };
  own.customProgramCacheKey = () => `${sourceKey.call(source)}|armor-cut`;
  return own;
}

type PartItem = Extract<GridItem, { kind: 'part' }>;
export type Placement = { pos: THREE.Vector3; yaw: number; scale: THREE.Vector3 };

const CELL = PHYSICS.cell;

const SIDE_YAW: Record<SideLetter, number> = { F: 0, B: Math.PI, R: -Math.PI / 2, L: Math.PI / 2 };

const SIDE_FACE: Record<SideLetter, { axis: 'x' | 'z'; outward: 1 | -1 }> = {
  F: { axis: 'x', outward: 1 },
  B: { axis: 'x', outward: -1 },
  R: { axis: 'z', outward: 1 },
  L: { axis: 'z', outward: -1 },
};

export function armorPlacement(v: Pick<Vehicle, 'chassisId' | 'items'>, item: PartItem, box: THREE.Box3, body: THREE.Object3D): Placement {
  const def = partDef(item.part.defId);
  if (!isShield(def)) throw new Error(`Part ${def.id} is not armor or an accessory`);
  const side = armorSide(v, item);
  return isMounted(v.chassisId, item) ? mountedArmorPlacement(v, item, def, side, box, body) : spareArmorPlacement(v, item, side, box);
}

function armorSide(v: Pick<Vehicle, 'chassisId'>, item: PartItem): SideLetter {
  const size = itemSize(item);
  const side = plateSide(v.chassisId, item);
  const depthCells = ['F', 'B'].includes(side) ? size.h : size.w;
  if (depthCells !== 1) throw new Error(`Armor ${item.part.id} is ${depthCells} cells deep on side ${side}, expected 1`);
  return side;
}

const CUT_EDGE_INSET = 0.1;

function backedOffFromCuts(rested: CellRect, whole: CellRect): CellRect {
  const back = (lo: number, hi: number, wholeLo: number, wholeHi: number): [number, number] => {
    const cutLo = lo - wholeLo > 1e-6;
    const cutHi = wholeHi - hi > 1e-6;
    const inset = Math.min(CUT_EDGE_INSET, (hi - lo) / 4);
    return [cutLo ? lo + inset : lo, cutHi ? hi - inset : hi];
  };
  const [x0, x1] = back(rested.x0, rested.x1, whole.x0, whole.x1);
  const [z0, z1] = back(rested.z0, rested.z1, whole.z0, whole.z1);
  return { unit: rested.unit, x0, x1, z0, z1 };
}

function spareArmorPlacement(v: Pick<Vehicle, 'chassisId'>, item: PartItem, side: SideLetter, box: THREE.Box3): Placement {
  const whole = cellRect(v.chassisId, itemCells(item));
  const { rect: rested, y } = restOn(v.chassisId, whole);
  const rect = backedOffFromCuts(rested, whole);
  const dx = rect.x1 - rect.x0;
  const dz = rect.z1 - rect.z0;
  const size = box.getSize(new THREE.Vector3());
  const middle = box.getCenter(new THREE.Vector3());
  const scale = SIDE_FACE[side].axis === 'x' ? new THREE.Vector3(dx / size.x, 1, dz / size.z) : new THREE.Vector3(dz / size.x, 1, dx / size.z);
  const yaw = SIDE_YAW[side];
  const shiftX = middle.x * scale.x;
  const shiftZ = middle.z * scale.z;
  const pos = new THREE.Vector3((rect.x0 + rect.x1) / 2 - (shiftX * Math.cos(yaw) + shiftZ * Math.sin(yaw)), y, (rect.z0 + rect.z1) / 2 - (shiftZ * Math.cos(yaw) - shiftX * Math.sin(yaw)));
  return { pos, yaw, scale };
}

function mountedArmorPlacement(v: Pick<Vehicle, 'chassisId' | 'items'>, item: PartItem, def: ShieldDef, side: SideLetter, box: THREE.Box3, body: THREE.Object3D): Placement {
  const { axis, outward } = SIDE_FACE[side];
  const across = axis === 'x';
  const depthScale = Math.max(across && def.look !== 'plates' ? 1 : 0, TRUCK_LOOK.armorDepth / thinDepthOf(def, box));
  const rect = cellRect(v.chassisId, itemCells(item));
  const half = unitBody(v.chassisId, rect.unit).half;
  const span = across ? rect.z1 - rect.z0 : rect.x1 - rect.x0;
  const scale = new THREE.Vector3(depthScale, 1, span / (Math.max(def.bulk.w, def.bulk.h) * CELL.across));
  const snug = half[axis] - TRUCK_LOOK.armorInset;
  const lateral: [number, number] = across ? [rect.z0, rect.z1] : [rect.x0, rect.x1];
  const seat = def.look === 'ram' ? ramSeat(body, axis, outward, lateral, box, half.y) : half.y - box.max.y;
  const pos = new THREE.Vector3((rect.x0 + rect.x1) / 2, seat + TRUCK_LOOK.armorRise, (rect.z0 + rect.z1) / 2);
  pos[axis] = outward * (snug - depthScale * box.min.x);
  const at = { pos, yaw: SIDE_YAW[side], scale };
  const placed = placedBounds(at, box);
  const placedLateral: [number, number] = across ? [placed.min.z, placed.max.z] : [placed.min.x, placed.max.x];
  const profile = faceProfile(body, axis, outward, placedLateral);
  const touchAt = (shift: number): number | null => bodyFace(body, axis, outward, placedLateral, [placed.min.y + shift, placed.max.y + shift]);
  const failure = `Armor ${def.id} on side ${side} of ${v.chassisId} finds no height at its face`;
  const shift = standShift({ profile, placed, touchAt, floor: -half.y + TRUCK_LOOK.armorRise, glassMatters: ['F', 'B'].includes(side), row: cellSteps(v.chassisId).row, failure });
  pos.y += shift;
  pos[axis] += outward * (Math.min(0, outward * (touchAt(shift) as number) - snug) + overArmor(v, item, def));
  return at;
}

function placedBounds(at: Placement, box: THREE.Box3): THREE.Box3 {
  return box.clone().applyMatrix4(new THREE.Matrix4().compose(at.pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, at.yaw, 0)), at.scale));
}

type Stand = { profile: FaceProfile; placed: THREE.Box3; touchAt: (shift: number) => number | null; floor: number; glassMatters: boolean; row: number; failure: string };

function standShift({ profile, placed, touchAt, floor, glassMatters, row, failure }: Stand): number {
  const face = profileFace(profile, floor);
  if (face === null) throw new Error(failure);
  const glass = glassMatters ? profileGlassLine(profile, floor, row) : null;
  const stands = (shift: number): boolean => {
    const touch = touchAt(shift);
    const atFace = touch !== null && profile.outward * (face - touch) <= row;
    return atFace && (glass === null || placed.max.y + shift <= glass + row);
  };
  const shifts = candidateShifts(profile, placed);
  const found = shifts.find(stands);
  if (found === undefined) throw new Error(failure);
  return found;
}

function candidateShifts(profile: FaceProfile, placed: THREE.Box3): number[] {
  const top = profile.bottom + profile.reach.length * FACE_COLUMN;
  const down: number[] = [0];
  for (let shift = -FACE_COLUMN; placed.min.y + shift >= profile.bottom; shift -= FACE_COLUMN) down.push(shift);
  const up: number[] = [];
  for (let shift = FACE_COLUMN; placed.max.y + shift <= top + TRUCK_LOOK.armorRise; shift += FACE_COLUMN) up.push(shift);
  return [...down, ...up];
}

function ramSeat(body: THREE.Object3D, axis: 'x' | 'z', outward: number, lateral: [number, number], box: THREE.Box3, hull: number): number {
  const low = lowestFace(body, axis, outward, lateral);
  if (low === null) throw new Error(`Ram on the ${axis} axis has no body face in its span`);
  const height = box.max.y - box.min.y;
  const highest = Math.max(low, -hull + TRUCK_LOOK.armorRise);
  let best = { seat: low, air: Infinity };
  for (let bottom = low; bottom <= highest + 1e-6; bottom += RAM_SEAT_STEP) {
    const air = airBehind(body, axis, outward, lateral, [bottom, bottom + height]);
    if (air < best.air) best = { seat: bottom, air };
  }
  return best.seat - box.min.y;
}

const RAM_SEAT_STEP = 0.05;

function airBehind(body: THREE.Object3D, axis: 'x' | 'z', outward: number, lateral: [number, number], height: [number, number]): number {
  const outer = bodyFace(body, axis, outward, lateral, height);
  if (outer === null) return Infinity;
  let air = 0;
  for (let y = height[0]; y < height[1] - 1e-6; y += RAM_ROW) {
    const face = bodyFace(body, axis, outward, lateral, [y, Math.min(y + RAM_ROW, height[1])]);
    if (face === null || outward * (outer - face) > CLIP_TOLERANCE) air++;
  }
  return air;
}

const RAM_ROW = 0.1;

function overArmor(v: Pick<Vehicle, 'chassisId' | 'items'>, item: PartItem, def: ShieldDef): number {
  return def.kind === 'accessory' && armorUnder(v, item) ? TRUCK_LOOK.armorDepth : 0;
}

function armorUnder(v: Pick<Vehicle, 'chassisId' | 'items'>, item: PartItem): boolean {
  const cells = new Set(itemCells(item).map((c) => `${c.x},${c.y}`));
  return v.items.some((it) => it.kind === 'part' && partDef(it.part.defId).kind === 'armor' && isMounted(v.chassisId, it) && itemCells(it).some((c) => cells.has(`${c.x},${c.y}`)));
}

function thinDepthOf(def: ShieldDef, box: THREE.Box3): number {
  const depth = box.max.x - box.min.x;
  const width = box.max.z - box.min.z;
  if (!(depth < width)) throw new Error(`Armor model of ${def.id} is ${depth.toFixed(2)} m deep and ${width.toFixed(2)} m wide, expected its thin axis along x`);
  return depth;
}
