
import { PAINT } from '../data/chassis';
import * as THREE from 'three';
import { isShield, partDef } from '../data/parts';
import { BODY_PARTS, baseModel, itemLookId, partModel, weaponLook } from '../render/partLooks';
import { aimWithin, gunSpans } from '../sim/armor';
import { cellRect, highestUnder, surfaceSamples, unitOfCells } from '../sim/body';
import { makeVehicle, newId } from '../sim/factory';
import { baseGrid, isMounted, itemCells } from '../sim/grid';
import { emptyWorld } from '../sim/testkit';
import type { GridItem, Vehicle, World } from '../sim/types';
import { loadModels, model, socket } from '../three/render/models';
import { armorPlacement } from '../three/render/armorCut';
import { footprint, itemSpotOf, VehicleView, wouldFloat } from '../three/render/vehicle';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

export const SLOW = 600_000;
const TOLERANCE = 0.01;
type Box = { x0: number; x1: number; z0: number; z1: number; top: number; what: string };

function headVertices(gun: Extract<GridItem, { kind: 'part' }>): THREE.Vector3[] {
  const look = weaponLook(gun.part.id, gun.part.defId);
  const out: THREE.Vector3[] = [];
  const add = (name: Parameters<typeof model>[0], off: THREE.Vector3) => {
    const obj = model(name);
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).add(off));
    });
  };
  add(look.receiver, new THREE.Vector3());
  add(look.barrel, socket(look.receiver, 'muzzle'));
  if (look.extra) add(look.extra, socket(look.receiver, 'extra'));
  return out;
}

function obstacles(v: Vehicle, skip: GridItem): Box[] {
  const g = baseGrid(v.chassisId);
  const out: Box[] = [];
  for (const it of v.items) {
    if (it === skip || itemCells(it).some((c) => c.y >= g.h)) continue;
    if (unitOfCells(v.chassisId, itemCells(it)).index !== unitOfCells(v.chassisId, itemCells(skip)).index) continue;
    let what: string = itemLookId(it);
    if (it.kind === 'part') {
      const d = partDef(it.part.defId);
      if (isShield(d) && isMounted(v.chassisId, it)) {
        const raw = new THREE.Box3().setFromObject(model(partModel(d.id)));
        const at = armorPlacement(v, it, raw, model(baseModel(v.chassisId, unitOfCells(v.chassisId, itemCells(it)).index)));
        const box = raw.clone().applyMatrix4(new THREE.Matrix4().compose(at.pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, at.yaw, 0)), at.scale));
        out.push({ x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z, top: box.max.y, what: d.id });
        continue;
      }
      if (BODY_PARTS.has(d.id) || d.kind === 'weapon' || isShield(d) || d.kind === 'engine') continue;
      if (d.kind === 'core' && (isMounted(v.chassisId, it) || d.role !== 'tank')) continue;
      if (/wheel/i.test(d.id) && isMounted(v.chassisId, it)) continue;
      what = d.id;
    }
    if (wouldFloat(v, it)) continue;
    const spot = itemSpotOf(v, it, model(baseModel(v.chassisId, unitOfCells(v.chassisId, itemCells(it)).index)));
    if (!spot) continue;
    const at = footprint(v, it, spot.y);
    at.pos.x += spot.dx;
    at.pos.z += spot.dz;
    const box = new THREE.Box3().setFromObject(model(partModel(what))).applyMatrix4(new THREE.Matrix4().compose(at.pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, at.yaw, 0)), at.scale));
    out.push({ x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z, top: box.max.y, what });
  }
  return out;
}

export function clips(world: World, v: Vehicle): string[] {
  const view = new VehicleView(v, true, PAINT.standard, 'world');
  const problems: string[] = [];
  for (const gun of v.items.filter((it): it is Extract<GridItem, { kind: 'part' }> => it.kind === 'part' && partDef(it.part.defId).kind === 'weapon')) {
    if (itemCells(gun).some((c) => c.y >= baseGrid(v.chassisId).h)) continue;
    const pivot = view.partPoint(gun.part.id);
    const pts = headVertices(gun);
    const spans = isMounted(v.chassisId, gun) ? gunSpans(v, gun) : [];
    const boxes = obstacles(v, gun);
    const own = cellRect(v.chassisId, itemCells(gun));
    const yaws = Array.from({ length: 360 }, (_, i) => i - 180).filter((a) => spans.length > 0 && aimWithin(spans, a) === a);
    if (yaws.length === 0) yaws.push(0);
    let worst = 0;
    let where = '';
    for (const a of yaws) {
      const r = (a * Math.PI) / 180;
      const c = Math.cos(r);
      const s = Math.sin(r);
      for (const p of pts) {
        if (Math.hypot(p.x, p.z) < 0.25) continue;
        const x = pivot.x + p.x * c - p.z * s;
        const z = pivot.z + p.x * s + p.z * c;
        const y = pivot.y + p.y;
        for (const b of boxes) {
          if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.top - y > worst) { worst = b.top - y; where = `${b.what} at yaw ${a}`; }
        }
        const cell = surfaceSamples(v.chassisId, own.unit, { x, z }, 0.08).find((c) => Math.abs(c.x - x) <= c.half && Math.abs(c.z - z) <= c.half);
        if (cell && cell.x >= own.x0 && cell.x <= own.x1 && cell.z >= own.z0 && cell.z <= own.z1) continue;
        const surface = highestUnder(v.chassisId, { unit: own.unit, x0: x - 0.02, x1: x + 0.02, z0: z - 0.02, z1: z + 0.02 });
        if (surface - y > worst) { worst = surface - y; where = `body at yaw ${a}`; }
      }
    }
    if (worst > TOLERANCE) problems.push(`${v.chassisId} ${gun.part.defId}@${gun.x},${gun.y} cuts ${worst.toFixed(2)} m into ${where}`);
  }
  void world;
  return problems;
}

const BOTH_SIDES = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const EDGE_TOLERANCE = 0.01;
const GUN_ROLES = ['head', 'mount', 'post', 'leg', 'brace'] as const;

function meshesNamed(root: THREE.Object3D, name: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o.name !== name) return;
    o.traverse((m) => {
      if (m instanceof THREE.Mesh && !m.userData.outline) out.push(m);
    });
  });
  return out;
}

function edgesPass(through: readonly THREE.Mesh[], solid: readonly THREE.Mesh[]): boolean {
  const targets = solid.map((m) => {
    const copy = new THREE.Mesh(m.geometry, BOTH_SIDES);
    copy.matrixAutoUpdate = false;
    copy.matrixWorld.copy(m.matrixWorld);
    return copy;
  });
  const caster = new THREE.Raycaster();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const dir = new THREE.Vector3();
  for (const m of through) {
    const p = m.geometry.getAttribute('position');
    const idx = m.geometry.index;
    const count = idx ? idx.count : p.count;
    const at = (i: number) => (idx ? idx.getX(i) : i);
    for (let t = 0; t < count; t += 3) {
      for (let e = 0; e < 3; e++) {
        from.fromBufferAttribute(p, at(t + e)).applyMatrix4(m.matrixWorld);
        to.fromBufferAttribute(p, at(t + ((e + 1) % 3))).applyMatrix4(m.matrixWorld);
        const len = from.distanceTo(to);
        if (len < EDGE_TOLERANCE) continue;
        dir.subVectors(to, from).divideScalar(len);
        caster.set(from, dir);
        caster.far = len;
        if (caster.intersectObjects(targets, false).length > 0) return true;
      }
    }
  }
  return false;
}

export type GunView = 'world' | 'portrait';

export function mountedGuns(v: Vehicle): Extract<GridItem, { kind: 'part' }>[] {
  return v.items.filter((it): it is Extract<GridItem, { kind: 'part' }> => it.kind === 'part' && partDef(it.part.defId).kind === 'weapon' && isMounted(v.chassisId, it));
}

export function headCount(view: VehicleView): number {
  let n = 0;
  view.root.traverse((o) => {
    if (o.name.endsWith(' head')) n++;
  });
  return n;
}

export function gunContacts(v: Vehicle, mode: GunView): string[] {
  const view = new VehicleView(v, true, PAINT.standard, mode);
  view.root.updateMatrixWorld(true);
  const guns = mountedGuns(v);
  const lines: string[] = [];
  for (const a of guns) {
    const heads = meshesNamed(view.root, `${a.id} head`);
    for (const b of guns) {
      if (a === b) continue;
      for (const role of GUN_ROLES) {
        if (edgesPass(heads, meshesNamed(view.root, `${b.id} ${role}`))) lines.push(`${v.chassisId} ${a.part.defId}@${a.x},${a.y} r${a.rot} into ${b.part.defId}@${b.x},${b.y} r${b.rot} ${role}`);
      }
    }
  }
  view.dispose();
  return lines;
}

export function place(world: World, v: Vehicle, defId: string | null, good: string | null, x: number, y: number, rot: 0 | 1): boolean {
  const item = (defId
    ? { id: newId(world, 'i'), kind: 'part', x, y, rot, part: { id: newId(world, 'p'), defId, hp: 1, wear: 0, ...(partDef(defId).kind === 'weapon' ? { gun: { cooldown: 0, ammo: 1, reloadWork: 0 } } : {}) } }
    : { id: newId(world, 'i'), kind: 'good', x, y, rot, good }) as GridItem;
  const g = baseGrid(v.chassisId);
  const cells = itemCells(item);
  const free = cells.every((c) => g.cells[c.y]?.[c.x] && !v.items.some((o) => itemCells(o).some((k) => k.x === c.x && k.y === c.y)));
  if (!free) return false;
  v.items.push(item);
  return true;
}

export function bare(chassisId: string): { world: World; v: Vehicle } {
  const world = emptyWorld();
  const v = makeVehicle(world, { faction: 'player', chassisId, parts: [], spares: [], cargo: {}, pos: { x: 50, y: 50 }, heading: 0, brain: null });
  return { world, v };
}

export function lineWithArmor(world: World, v: Vehicle, defId: string): void {
  const g = baseGrid(v.chassisId);
  let mounted = 0;
  for (let y = 0; y < g.chassisH; y++) {
    for (let x = 0; x < g.w; x++) {
      if (!place(world, v, defId, null, x, y, 0)) continue;
      if (isMounted(v.chassisId, v.items[v.items.length - 1])) mounted++;
      else v.items.pop();
    }
  }
  if (mounted === 0) throw new Error(`${defId} mounts nowhere on ${v.chassisId}`);
}

export function fill(world: World, v: Vehicle): void {
  const g = baseGrid(v.chassisId);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.cells[y][x] === '.' || g.cells[y][x] === 'D') place(world, v, null, 'electronics', x, y, 0);
}


type Plan = { x0: number; x1: number; z0: number; z1: number };

function topOf(root: THREE.Object3D, o: THREE.Object3D): THREE.Object3D {
  let at = o;
  while (at.parent && at.parent !== root) at = at.parent;
  return at;
}

export function headPlan(view: VehicleView, id: string): Plan | null {
  const meshes = meshesNamed(view.root, `${id} head`);
  if (meshes.length === 0) return null;
  const frame = topOf(view.root, meshes[0]);
  frame.updateMatrixWorld(true);
  const inverse = frame.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const p = new THREE.Vector3();
  for (const m of meshes) {
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) box.expandByPoint(p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inverse));
  }
  return { x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z };
}

function planOverlap(a: Plan, b: Plan, shrink: number): boolean {
  return a.x0 + shrink < b.x1 && a.x1 - shrink > b.x0 && a.z0 + shrink < b.z1 && a.z1 - shrink > b.z0;
}

export function gunOverlaps(v: Vehicle, mode: GunView): string[] {
  const view = new VehicleView(v, true, PAINT.standard, mode);
  view.root.updateMatrixWorld(true);
  const guns = mountedGuns(v);
  const heads = new Map(guns.map((g) => [g.id, headPlan(view, g.id)]));
  const lines: string[] = [];
  for (const a of guns) {
    const head = heads.get(a.id);
    if (!head) continue;
    const unit = unitOfCells(v.chassisId, itemCells(a)).index;
    for (const b of guns) {
      if (a === b || unitOfCells(v.chassisId, itemCells(b)).index !== unit) continue;
      const feet = cellRect(v.chassisId, itemCells(b));
      const other = heads.get(b.id);
      const label = `${v.chassisId} ${a.part.defId}@${a.x},${a.y} r${a.rot} over ${b.part.defId}@${b.x},${b.y} r${b.rot}`;
      if (planOverlap(head, feet, EDGE_TOLERANCE)) lines.push(`${label} footprint`);
      if (other && planOverlap(head, other, EDGE_TOLERANCE)) lines.push(`${label} head`);
    }
  }
  view.dispose();
  return lines;
}

export function headY(v: Vehicle, itemId: string, mode: GunView): number {
  const view = new VehicleView(v, true, PAINT.standard, mode);
  view.root.updateMatrixWorld(true);
  const found = view.root.getObjectByName(`${itemId} head`);
  if (!found) throw new Error(`No head for ${itemId}`);
  const y = new THREE.Vector3().setFromMatrixPosition(found.matrixWorld).y;
  view.dispose();
  return y;
}

export function loneHeadY(v: Vehicle, itemId: string, mode: GunView): number {
  const others = new Set(mountedGuns(v).filter((g) => g.id !== itemId));
  return headY({ ...v, items: v.items.filter((it) => !others.has(it as never)) }, itemId, mode);
}
