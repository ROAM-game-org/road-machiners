import * as THREE from 'three';

export type Box2 = { x0: number; x1: number; z0: number; z1: number };

export type RestGun = {
  id: string;
  unit: number;
  col: number;
  row: number;
  pivot: { x: number; z: number };
  cells: Box2;
  receiver: Box2;
  barrel: Box2;
  receiverTop: number;
  barrelTop: number;
};

export type GunStack = {
  order: readonly string[];
  below: ReadonlyMap<string, readonly string[]>;
  levels: ReadonlyMap<string, number>;
  unresolved: readonly [string, string][];
};

export type Seat = { id: string; unit: number; col: number; row: number; pivot: { x: number; z: number }; cells: Box2; head: THREE.Object3D; muzzleX: number; turn: THREE.Quaternion };

const POST_HALF = 0.1;
const PIERCES = 3;
const BARREL_OVER = 2;
const REACH = 1;

export function restGun(seat: Seat): RestGun {
  seat.head.updateMatrixWorld(true);
  const receiver = emptyBox();
  const barrel = emptyBox();
  let receiverTop = -Infinity;
  let barrelTop = -Infinity;
  const v = new THREE.Vector3();
  seat.head.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const p = o.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (v.x < seat.muzzleX) receiverTop = Math.max(receiverTop, v.y);
      else barrelTop = Math.max(barrelTop, v.y);
      const planned = v.clone().applyQuaternion(seat.turn);
      grow(v.x < seat.muzzleX ? receiver : barrel, seat.pivot.x + planned.x, seat.pivot.z + planned.z);
    }
  });
  if (barrel.x0 === Infinity) throw new Error(`The gun head ${seat.id} has no barrel past its muzzle at x ${seat.muzzleX}`);
  return { id: seat.id, unit: seat.unit, col: seat.col, row: seat.row, pivot: seat.pivot, cells: seat.cells, receiver, barrel, receiverTop, barrelTop };
}

function emptyBox(): Box2 {
  return { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
}

function grow(box: Box2, x: number, z: number): void {
  box.x0 = Math.min(box.x0, x);
  box.x1 = Math.max(box.x1, x);
  box.z0 = Math.min(box.z0, z);
  box.z1 = Math.max(box.z1, z);
}

function overlaps(a: Box2, b: Box2): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

function holds(box: Box2, p: { x: number; z: number }): boolean {
  return p.x > box.x0 - POST_HALF && p.x < box.x1 + POST_HALF && p.z > box.z0 - POST_HALF && p.z < box.z1 + POST_HALF;
}

function heads(g: RestGun): Box2[] {
  return [g.receiver, g.barrel];
}

function stand(g: RestGun): Box2[] {
  return [g.cells, g.receiver];
}

function meets(a: RestGun, b: RestGun): boolean {
  const reaches = (x: RestGun, y: RestGun) => heads(x).some((h) => [...stand(y), y.barrel].some((s) => overlaps(h, s)));
  return reaches(a, b) || reaches(b, a);
}

function mustStandOver(a: RestGun, b: RestGun): number {
  if (heads(a).some((h) => holds(h, b.pivot))) return PIERCES;
  if (stand(b).some((s) => overlaps(a.barrel, s))) return BARREL_OVER;
  return 0;
}

function reachOf(g: RestGun): number {
  return Math.hypot(Math.max(Math.abs(g.barrel.x0 - g.pivot.x), Math.abs(g.barrel.x1 - g.pivot.x)), Math.max(Math.abs(g.barrel.z0 - g.pivot.z), Math.abs(g.barrel.z1 - g.pivot.z)));
}

function seatOrder(a: RestGun, b: RestGun): number {
  return a.row - b.row || a.col - b.col || a.id.localeCompare(b.id);
}

type Edge = { low: string; high: string; strength: number };

function edgeOf(a: RestGun, b: RestGun): Edge {
  const ab = mustStandOver(a, b);
  const ba = mustStandOver(b, a);
  if (ab !== ba) return ab > ba ? { low: b.id, high: a.id, strength: ab } : { low: a.id, high: b.id, strength: ba };
  const longer = reachOf(a) - reachOf(b);
  const aHigher = longer !== 0 ? longer > 0 : seatOrder(a, b) > 0;
  return aHigher ? { low: b.id, high: a.id, strength: REACH } : { low: a.id, high: b.id, strength: REACH };
}

export function clearOver(a: RestGun, lower: RestGun, lowerY: number): number {
  const mine = [a.cells, a.receiver, a.barrel];
  const theirs: [Box2, number][] = [[lower.cells, lower.receiverTop], [lower.receiver, lower.receiverTop], [lower.barrel, lower.barrelTop]];
  return Math.max(-Infinity, ...theirs.filter(([box]) => mine.some((m) => overlaps(m, box))).map(([, top]) => lowerY + top));
}

export function gunStack(guns: readonly RestGun[]): GunStack {
  const edges: Edge[] = [];
  const unresolved: [string, string][] = [];
  const related = new Set<string>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (let i = 0; i < guns.length; i++) {
    for (let j = i + 1; j < guns.length; j++) {
      const a = guns[i];
      const b = guns[j];
      if (a.unit !== b.unit || !meets(a, b)) continue;
      related.add(pairKey(a.id, b.id));
      edges.push(edgeOf(a, b));
    }
  }
  const order = sorted(guns, edges, unresolved);
  const placedAt = new Map(order.map((id, i) => [id, i]));
  const below = new Map<string, string[]>();
  const levels = new Map<string, number>();
  for (const id of order) {
    const lower = order.slice(0, placedAt.get(id)).filter((other) => related.has(pairKey(id, other)));
    below.set(id, lower);
    levels.set(id, lower.length === 0 ? 0 : 1 + Math.max(...lower.map((l) => levels.get(l) as number)));
  }
  return { order, below, levels, unresolved };
}

function weaker(a: Edge, b: Edge): boolean {
  if (a.strength !== b.strength) return a.strength < b.strength;
  return `${a.low}|${a.high}` < `${b.low}|${b.high}`;
}

function sorted(guns: readonly RestGun[], edges: readonly Edge[], unresolved: [string, string][]): string[] {
  const left = [...guns].sort(seatOrder);
  const live = [...edges];
  const order: string[] = [];
  while (left.length > 0) {
    const ready = left.find((g) => !live.some((e) => e.high === g.id));
    if (ready) {
      order.push(ready.id);
      left.splice(left.indexOf(ready), 1);
      for (let i = live.length - 1; i >= 0; i--) if (live[i].low === ready.id) live.splice(i, 1);
      continue;
    }
    const weakest = live.filter((e) => left.some((g) => g.id === e.high)).reduce((w, e) => (weaker(e, w) ? e : w));
    unresolved.push([weakest.low, weakest.high]);
    live.splice(live.indexOf(weakest), 1);
  }
  return order;
}
