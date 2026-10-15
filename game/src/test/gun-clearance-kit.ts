
import * as THREE from 'three';
import { partDef } from '../data/parts';
import { BODY_PARTS, itemLookId, partModel, weaponLook } from '../render/partLooks';
import { aimWithin, gunSpans } from '../sim/armor';
import { cellRect, highestUnder, restOn, surfaceSamples } from '../sim/body';
import { makeVehicle, newId } from '../sim/factory';
import { baseGrid, isMounted, itemCells } from '../sim/grid';
import { emptyWorld } from '../sim/testkit';
import type { GridItem, Vehicle, World } from '../sim/types';
import { loadModels, model, socket } from '../three/render/models';
import { footprint, VehicleView, wouldFloat } from '../three/render/vehicle';

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
    let what: string = itemLookId(it);
    if (it.kind === 'part') {
      const d = partDef(it.part.defId);
      if (BODY_PARTS.has(d.id) || d.kind === 'weapon' || d.kind === 'armor' || d.kind === 'engine') continue;
      if (d.kind === 'core' && (isMounted(v.chassisId, it) || d.role !== 'tank')) continue;
      if (/wheel/i.test(d.id) && isMounted(v.chassisId, it)) continue;
      what = d.id;
    }
    if (wouldFloat(v, it)) continue;
    const rest = restOn(v.chassisId, cellRect(v.chassisId, itemCells(it)));
    const at = footprint(v, it, rest.y);
    const box = new THREE.Box3().setFromObject(model(partModel(what))).applyMatrix4(new THREE.Matrix4().compose(at.pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, at.yaw, 0)), at.scale));
    out.push({ x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z, top: box.max.y, what });
  }
  return out;
}

export function clips(world: World, v: Vehicle): string[] {
  const view = new VehicleView(v, true);
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
        const cell = surfaceSamples(v.chassisId, { x, z }, 0.08).find((c) => Math.abs(c.x - x) <= c.half && Math.abs(c.z - z) <= c.half);
        if (cell && cell.x >= own.x0 && cell.x <= own.x1 && cell.z >= own.z0 && cell.z <= own.z1) continue;
        const surface = highestUnder(v.chassisId, { x0: x - 0.02, x1: x + 0.02, z0: z - 0.02, z1: z + 0.02 });
        if (surface - y > worst) { worst = surface - y; where = `body at yaw ${a}`; }
      }
    }
    if (worst > TOLERANCE) problems.push(`${v.chassisId} ${gun.part.defId}@${gun.x},${gun.y} cuts ${worst.toFixed(2)} m into ${where}`);
  }
  void world;
  return problems;
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

export function fill(world: World, v: Vehicle): void {
  const g = baseGrid(v.chassisId);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.cells[y][x] === '.' || g.cells[y][x] === 'D') place(world, v, null, 'electronics', x, y, 0);
}

