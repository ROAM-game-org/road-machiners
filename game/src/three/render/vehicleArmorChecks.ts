import * as THREE from 'three';
import { expect } from 'vitest';
import { isShield, PARTS } from '../../data/parts';
import { TRUCK_LOOK } from '../../render/partLooks';
import { baseModel, itemLookId, partModel } from '../../render/partLooks';
import { bodyOf, cellRect, cellSteps, CLIP_TOLERANCE, restOn, unitBody } from '../../sim/body';
import { baseGrid, isMounted, itemCells, placementError, plateSide } from '../../sim/grid';
import type { GridItem } from '../../sim/types';
import { GLASS, loadModels, model, type ModelName } from './models';
import { armorPlacement } from './armorCut';
import { lowestFace } from './gunStand';
import { footprint, wouldFloat } from './vehicle';

const FILES = import.meta.glob<string>('/public/models/*.glb', { query: '?inline', import: 'default', eager: true });
await loadModels(async (name) => {
  const url = FILES[`/public/models/${name}.glb`];
  if (!url) throw new Error(`Missing model file for ${name}`);
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
});

const ARMOR = Object.values(PARTS).filter(isShield);
const EPS = 1e-6;
const LOOSE_PARTS = ['panniers', 'rack', 'trailerBox'];
const PROBE = 0.1;
const RAM_FOOT_REACH = 0.25;
const FAR = 20;

type PartItem = Extract<GridItem, { kind: 'part' }>;
type Half = { x: number; z: number };

function memo<K, V>(cache: Map<K, V>, key: K, make: () => V): V {
  const known = cache.get(key);
  if (known !== undefined) return known;
  const made = make();
  cache.set(key, made);
  return made;
}

const sharedModels = new Map<string, THREE.Object3D>();
const rawBoxes = new Map<string, THREE.Box3>();
const mountedCache = new Map<string, PartItem[]>();
const placedBoxes = new Map<string, THREE.Box3>();
const probeReach = new Map<string, number | null>();
const probeGlass = new Map<string, boolean>();

function shared(name: ModelName): THREE.Object3D {
  return memo(sharedModels, name, () => {
    const made = model(name);
    made.updateMatrixWorld(true);
    return made;
  });
}

function rawBox(name: ModelName): THREE.Box3 {
  return memo(rawBoxes, name, () => new THREE.Box3().setFromObject(shared(name)));
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, at) => at);
}

function armorAt(defId: string, rot: 0 | 1, x: number, y: number): PartItem {
  return { id: 'g', kind: 'part', x, y, rot, part: { id: 'p', defId, hp: 1, wear: 0 } } as unknown as PartItem;
}

function mountedArmor(chassisId: string): PartItem[] {
  return memo(mountedCache, chassisId, () => {
    const { w, h } = baseGrid(chassisId);
    const cells = range(h).flatMap((y) => range(w).map((x) => ({ x, y })));
    const all = ARMOR.flatMap((def) => ([0, 1] as const).flatMap((rot) => cells.map(({ x, y }) => armorAt(def.id, rot, x, y))));
    return all.filter((item) => isMounted(chassisId, item));
  });
}

function plateUnder(item: PartItem): PartItem {
  const [cell] = itemCells(item);
  return { ...item, id: 'under', x: cell.x, y: cell.y, rot: 0, part: { id: 'under', defId: 'steelPlate', hp: 1, wear: 0 } };
}

function placedBox(chassisId: string, item: PartItem, items: GridItem[] = []): THREE.Box3 {
  const key = `${chassisId}|${item.part.defId}|${item.x}|${item.y}|${item.rot}|${items.length}`;
  return memo(placedBoxes, key, () => {
    const base = shared(baseModel(chassisId, cellRect(chassisId, itemCells(item)).unit));
    const placement = armorPlacement({ chassisId, items }, item, rawBox(partModel(item.part.defId)), base);
    const obj = shared(partModel(item.part.defId)).clone(true);
    obj.position.copy(placement.pos);
    obj.rotation.set(0, placement.yaw, 0);
    obj.scale.copy(placement.scale);
    obj.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(obj);
  });
}

function innerFace(box: THREE.Box3, side: string): number {
  return { F: box.min.x, B: -box.max.x, R: box.min.z, L: -box.max.z }[side] as number;
}

function isAcross(side: string): boolean {
  return side === 'F' || side === 'B';
}

function bodyHalf(half: Half, side: string): number {
  return isAcross(side) ? half.x : half.z;
}

function depthOf(box: THREE.Box3, side: string): number {
  return isAcross(side) ? box.max.x - box.min.x : box.max.z - box.min.z;
}

type Probe = { baseName: ModelName; base: THREE.Object3D; side: string; across: boolean; outward: number; raycaster: THREE.Raycaster };

function probeOf(baseName: ModelName, side: string): Probe {
  const across = isAcross(side);
  const outward = side === 'F' || side === 'R' ? 1 : -1;
  const raycaster = new THREE.Raycaster();
  raycaster.ray.direction.set(across ? -outward : 0, 0, across ? 0 : -outward);
  return { baseName, base: shared(baseName), side, across, outward, raycaster };
}

function castAt(probe: Probe, u: number, y: number): { reach: number | null; glass: boolean } {
  const { across, outward, raycaster } = probe;
  raycaster.ray.origin.set(across ? outward * FAR : u, y, across ? u : outward * FAR);
  const hit = raycaster.intersectObject(probe.base, true)[0];
  if (!hit) return { reach: null, glass: false };
  const material = (hit.object as THREE.Mesh).material as THREE.Material;
  return { reach: outward * (across ? hit.point.x : hit.point.z), glass: material.name === GLASS };
}

function reachAt(probe: Probe, u: number, y: number): number | null {
  const key = `${probe.baseName}|${probe.side}|${u}|${y}`;
  return memo(probeReach, key, () => {
    const cast = castAt(probe, u, y);
    probeGlass.set(key, cast.glass);
    return cast.reach;
  });
}

function glassAt(probe: Probe, u: number, y: number): boolean {
  reachAt(probe, u, y);
  return probeGlass.get(`${probe.baseName}|${probe.side}|${u}|${y}`) as boolean;
}

function steps(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let u = lo + PROBE / 2; u < hi; u += PROBE) out.push(u);
  return out;
}

function outermostBody(chassisId: string, item: PartItem, box: THREE.Box3, side: string): number {
  const probe = probeOf(baseModel(chassisId, cellRect(chassisId, itemCells(item)).unit), side);
  const [lo, hi] = probe.across ? [box.min.z, box.max.z] : [box.min.x, box.max.x];
  const heights = steps(box.min.y, box.max.y);
  let best = -Infinity;
  for (const u of steps(lo, hi)) {
    for (const y of heights) best = Math.max(best, reachAt(probe, u, y) ?? -Infinity);
  }
  return best;
}

function outermostFace(chassisId: string, item: PartItem, box: THREE.Box3, side: string): number {
  const probe = probeOf(baseModel(chassisId, cellRect(chassisId, itemCells(item)).unit), side);
  const [lo, hi] = probe.across ? [box.min.z, box.max.z] : [box.min.x, box.max.x];
  const whole = rawBox(probe.baseName);
  const floor = -unitBody(chassisId, cellRect(chassisId, itemCells(item)).unit).half.y + TRUCK_LOOK.armorRise;
  const heights = steps(whole.min.y, whole.max.y).filter((y) => y >= floor);
  let best = -Infinity;
  for (const u of steps(lo, hi)) {
    for (const y of heights) best = Math.max(best, reachAt(probe, u, y) ?? -Infinity);
  }
  return best;
}

function glassLine(chassisId: string, item: PartItem, box: THREE.Box3, side: string): number {
  const probe = probeOf(baseModel(chassisId, cellRect(chassisId, itemCells(item)).unit), side);
  const [lo, hi] = probe.across ? [box.min.z, box.max.z] : [box.min.x, box.max.x];
  const face = outermostFace(chassisId, item, box, side);
  const row = cellSteps(chassisId).row;
  for (const y of steps(rawBox(probe.baseName).min.y, rawBox(probe.baseName).max.y)) {
    if (steps(lo, hi).some((u) => glassAt(probe, u, y) && face - (reachAt(probe, u, y) as number) > row)) return y - PROBE / 2;
  }
  return Infinity;
}

function overhangOf(box: THREE.Box3, half: Half): number {
  return Math.max(0, box.max.x - half.x, -half.x - box.min.x, box.max.z - half.z, -half.z - box.min.z);
}

function armorProblems(id: string, item: PartItem, under: PartItem[]): string[] {
  const side = plateSide(id, item);
  const box = placedBox(id, item, under);
  const label = `${item.part.defId} rot ${item.rot} at ${item.x},${item.y} side ${side} over ${under.length} plates`;
  const inner = innerFace(box, side) - (under.length ? TRUCK_LOOK.armorDepth : 0);
  const snug = bodyHalf(unitBody(id, cellRect(id, itemCells(item)).unit).half, side) - TRUCK_LOOK.armorInset;
  const depth = depthOf(box, side);
  const measures: { over: number; limit: number; text: string }[] = [
    { over: inner - snug, limit: EPS, text: `inner face ${inner.toFixed(3)} past ${snug.toFixed(3)}` },
    { over: inner - outermostBody(id, item, box, side), limit: CLIP_TOLERANCE, text: 'of air between armor and body' },
    { over: outermostFace(id, item, box, side) - inner, limit: cellSteps(id).row + EPS, text: 'behind the outermost body face' },
    { over: glassGapOf(id, item, box, side), limit: EPS, text: 'above the glass line' },
    { over: TRUCK_LOOK.armorDepth - depth, limit: EPS, text: `short of the ${TRUCK_LOOK.armorDepth} depth` },
  ];
  return measures.filter((m) => m.over > m.limit).map((m) => `${label}: ${m.text.startsWith('inner') ? m.text : `${m.over.toFixed(3)} m ${m.text}`}`);
}

function glassGapOf(id: string, item: PartItem, box: THREE.Box3, side: string): number {
  return isAcross(side) ? box.max.y - cellSteps(id).row - glassLine(id, item, box, side) : 0;
}

export function frontArmorStaysUnderLongHood(id: string): void {
  const problems: string[] = [];
  for (const item of mountedArmor(id).filter((it) => plateSide(id, it) === 'F')) {
    const box = placedBox(id, item);
    const over = box.max.y - TRUCK_LOOK.armorRise - glassLine(id, item, box, 'F');
    if (over > EPS) problems.push(`${item.part.defId} at ${item.x},${item.y}: ${over.toFixed(3)} m above the windshield's lower edge`);
  }
  expect(problems).toEqual([]);
}

export function armorSitsOnBody(id: string): void {
  const items = mountedArmor(id);
  expect(items.length).toBeGreaterThan(0);
  const cases = items.flatMap((item) => (PARTS[item.part.defId].kind === 'accessory' ? [{ item, under: [plateUnder(item)] }, { item, under: [] }] : [{ item, under: [] }]));
  expect(cases.flatMap(({ item, under }) => armorProblems(id, item, under))).toEqual([]);
}

function rams(id: string): PartItem[] {
  return mountedArmor(id).filter((item) => (PARTS[item.part.defId] as { look?: string }).look === 'ram');
}

export function ramsAreBacked(id: string): void {
  const problems: string[] = [];
  for (const item of rams(id)) {
    const side = plateSide(id, item);
    const box = placedBox(id, item);
    const probe = probeOf(baseModel(id, cellRect(id, itemCells(item)).unit), side);
    const [lo, hi] = probe.across ? [box.min.z, box.max.z] : [box.min.x, box.max.x];
    const inner = innerFace(box, side);
    const backed = steps(box.min.y, box.max.y).map((y) => {
      const reaches = steps(lo, hi).map((u) => reachAt(probe, u, y)).filter((r): r is number => r !== null);
      return reaches.length > 0 && inner - Math.max(...reaches) <= CLIP_TOLERANCE;
    });
    if (!backed[0] && !backed[1]) {
      problems.push(`${item.part.defId} at ${item.x},${item.y} side ${side}: rows from the foot ${backed.map((b) => (b ? 'body' : 'air')).join(' ')}`);
    }
  }
  expect(problems).toEqual([]);
}

function expectRaised(id: string, item: PartItem): void {
  const def = PARTS[item.part.defId];
  if (!isShield(def)) return;
  const half = bodyOf(id).half.y;
  const box = placedBox(id, item);
  if (def.look !== 'ram') expect(box.max.y, def.id).toBeCloseTo(half + TRUCK_LOOK.armorRise, 5);
}

export function armorRisesOverBody(): void {
  for (const item of mountedArmor('scout')) expectRaised('scout', item);
}

function armorBoxes(id: string) {
  return mountedArmor(id).map((item) => {
    const box = placedBox(id, item);
    const unit = cellRect(id, itemCells(item)).unit;
    const side = plateSide(id, item);
    const sunk = bodyHalf(unitBody(id, unit).half, side) - TRUCK_LOOK.armorInset - innerFace(box, side);
    return { box, unit, sunk, cells: new Set(itemCells(item).map((c) => `${c.x},${c.y}`)) };
  });
}

function looseLooks(id: string): GridItem[] {
  const grid = baseGrid(id);
  const looks: GridItem[] = [];
  for (const y of range(grid.chassisH)) {
    for (const x of range(grid.w)) {
      for (const rot of [0, 1] as const) {
        for (const defId of LOOSE_PARTS) looks.push({ id: 'g', kind: 'part', x, y, rot, part: { id: 'p', defId, hp: 1, wear: 0 } } as unknown as GridItem);
        looks.push({ id: 'g', kind: 'good', x, y, rot, good: 'scrap' } as GridItem);
      }
    }
  }
  return looks;
}

function drawnBox(id: string, item: GridItem): THREE.Box3 {
  const at = footprint({ chassisId: id }, item, restOn(id, cellRect(id, itemCells(item))).y);
  return rawBox(partModel(itemLookId(item))).clone().applyMatrix4(new THREE.Matrix4().compose(at.pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, at.yaw, 0)), at.scale));
}

type ArmorBox = ReturnType<typeof armorBoxes>[number];

function worstReach(id: string, item: GridItem, armor: ArmorBox[]): number {
  const drawn = drawnBox(id, item);
  const mine = itemCells(item).map((c) => `${c.x},${c.y}`);
  const unit = cellRect(id, itemCells(item)).unit;
  const half = unitBody(id, unit).half;
  let worst = 0;
  for (const a of armor.filter((o) => o.unit === unit && !mine.some((k) => o.cells.has(k)))) {
    const reach = Math.min(drawn.max.x - a.box.min.x, a.box.max.x - drawn.min.x, drawn.max.z - a.box.min.z, a.box.max.z - drawn.min.z, drawn.max.y - a.box.min.y, a.box.max.y - drawn.min.y);
    worst = Math.max(worst, reach - overhangOf(drawn, half) - a.sunk);
  }
  return worst;
}

export function looseItemsStayOutOfArmor(id: string): void {
  const grid = baseGrid(id);
  const armor = armorBoxes(id);
  const placed = looseLooks(id).filter((item) => !placementError(grid, [], item, null) && !wouldFloat({ chassisId: id }, item));
  const worst = placed.reduce((most, item) => Math.max(most, worstReach(id, item, armor)), 0);
  expect(placed.length).toBeGreaterThan(0);
  expect(worst).toBeLessThanOrEqual(TRUCK_LOOK.armorInset + EPS);
}

export function armorModelsAreThin(): void {
  for (const def of ARMOR) {
    const box = rawBox(partModel(def.id));
    expect(box.max.x - box.min.x, def.id).toBeLessThan(box.max.z - box.min.z);
  }
}

export function lowNosesCarryRamsLow(id: string): void {
  for (const item of rams(id)) {
    const side = plateSide(id, item);
    const box = placedBox(id, item);
    const base = shared(baseModel(id, cellRect(id, itemCells(item)).unit));
    const across = isAcross(side);
    const outward = side === 'F' || side === 'R' ? 1 : -1;
    const lateral: [number, number] = across ? [box.min.z, box.max.z] : [box.min.x, box.max.x];
    const low = lowestFace(base, across ? 'x' : 'z', outward, lateral);
    expect(low, item.part.defId).not.toBeNull();
    expect(box.min.y - (low as number), `${item.part.defId} at ${item.x},${item.y}`).toBeLessThanOrEqual(RAM_FOOT_REACH);
  }
}
