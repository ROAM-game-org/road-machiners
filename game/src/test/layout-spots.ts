import { partDef } from '../data/parts';
import type { FireSpan } from '../sim/armor';
import { makePart } from '../sim/factory';
import { gridOf, itemSize, mountCellsOf, mountSpots, type Spot } from '../sim/grid';
import type { GridItem, Rot, Vehicle, World } from '../sim/types';

export function freeMounts(w: World, v: Vehicle, defId: string, rot: Rot = 0): Spot[] {
  const probe: GridItem = { id: 'probe', x: 0, y: 0, rot, kind: 'part', part: makePart(w, defId, 0) };
  return mountSpots(gridOf(v), v.items, probe, mountCellsOf(defId)).filter((s) => s.rot === rot);
}

export function coreItem(v: Vehicle, role: 'cab' | 'transmission' | 'wheel' | 'tank'): GridItem {
  const item = v.items.find((it) => it.kind === 'part' && coreRole(it.part.defId) === role);
  if (!item) throw new Error(`${v.chassisId} has no ${role}`);
  return item;
}

function coreRole(defId: string): string | null {
  const def = partDef(defId);
  return def.kind === 'core' ? def.role : null;
}

export function rectOf(item: GridItem): { x0: number; y0: number; x1: number; y1: number } {
  const { w, h } = itemSize(item);
  return { x0: item.x, y0: item.y, x1: item.x + w, y1: item.y + h };
}

function bearing(dx: number, dy: number): number {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

function wrap(angle: number): number {
  return angle > 180 ? angle - 360 : angle <= -180 ? angle + 360 : angle;
}

export function shadowOf(gun: GridItem, blocker: GridItem): FireSpan {
  const g = rectOf(gun);
  const b = rectOf(blocker);
  const ox = (g.x0 + g.x1) / 2;
  const oy = (g.y0 + g.y1) / 2;
  const middle = bearing((b.x0 + b.x1) / 2 - ox, (b.y0 + b.y1) / 2 - oy);
  const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([x, y]) => bearing(x - ox, y - oy));
  const off = (a: number) => wrap(a - middle);
  const from = corners.reduce((best, a) => (off(a) < off(best) ? a : best));
  const to = corners.reduce((best, a) => (off(a) > off(best) ? a : best));
  return { from, to: from + off(to) - off(from) };
}

export function shadowHolds(shadow: FireSpan, angle: number): boolean {
  return [angle - 360, angle, angle + 360].some((a) => a > shadow.from && a < shadow.to);
}

export function roundedSpans(spans: FireSpan[]): FireSpan[] {
  return spans.map((s) => ({ from: Math.round(s.from * 10) / 10, to: Math.round(s.to * 10) / 10 }));
}

export const SCOUT_THREE_GUNS: readonly { defId: 'heavyMg'; wear: 0; at: { x: number; y: number; rot: Rot } }[] = [
  { defId: 'heavyMg', wear: 0, at: { x: 4, y: 5, rot: 0 } },
  { defId: 'heavyMg', wear: 0, at: { x: 2, y: 2, rot: 1 } },
  { defId: 'heavyMg', wear: 0, at: { x: 1, y: 9, rot: 3 } },
];
