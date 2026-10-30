import { RULES } from '../data/rules';
import { PHYSICS } from '../data/physics';
import { chassisDef } from '../data/chassis';
import { GRID_CELL, cellCenter, cellRect, cellSteps, spanOf, unitOfRow, unitsOf, type CellRect } from './body';
import { footprint, nearestUnit, poseToWorld, sideReach, unitPose, worldToPose, type UnitPose } from './rig';

import { isShield, partDef, type PartDef } from '../data/parts';
import { chassisAbility, partArmorBonus } from './chassis-features';
import { weaponArc } from './stats';
import { wornDef } from './wear';
import { damagePart } from './damage';
import { baseGrid, cellKey, facingOf, hitGridOf, itemCells, isMounted, itemSize, mountedItems, shieldParts, sideOf, type Grid, type SideLetter } from './grid';
import type { Loadout } from './loadout-memo';
import type { GridItem, PartInstance, Vehicle, World } from './types';
import { angleDiff, bearing, dist, type Vec } from './vec';

export type Side = 'front' | 'rear' | 'left' | 'right';
export type PartHit = { part: string; damage: number };
export type Round = { damage: number; pen: number; blast: boolean; armorShare: number };

const QUARTER = Math.PI / 4;

export function sideToward(v: Vehicle, p: Vec): Side {
  const unit = nearestUnit(v, p);
  const rel = angleDiff(unit.heading, bearing(unit.pos, p));
  if (Math.abs(rel) <= QUARTER) return 'front';
  if (Math.abs(rel) >= 3 * QUARTER) return 'rear';
  return rel > 0 ? 'right' : 'left';
}

const LETTER: Record<Side, SideLetter> = { front: 'F', rear: 'B', left: 'L', right: 'R' };

export function ramMult(v: Vehicle, contact: { side: Side; lanes: readonly number[] }): number {
  let mult = 1;
  for (const item of mountedItems(v)) {
    const def = partDef(item.part.defId);
    if (!isShield(def) || item.part.hp <= 0 || !coversSide(v, item.part, contact.side)) continue;
    if (itemLanes(item, contact.side).some((lane) => contact.lanes.includes(lane))) mult = Math.max(mult, def.ramMult);
  }
  return mult;
}

function itemLanes(item: GridItem, side: Side): number[] {
  return itemCells(item).map((c) => (side === 'front' || side === 'rear' ? c.x : c.y));
}

export function coversSide(v: Vehicle, part: PartInstance, side: Side): boolean {
  return sideOf(v, part) === LETTER[side];
}

export function bareSides(v: Vehicle): Side[] {
  const mounts = new Set(baseGrid(v.chassisId).cells.flat());
  const shields = shieldParts(v).filter((p) => p.hp > 0);
  return (Object.keys(LETTER) as Side[]).filter((side) => mounts.has(LETTER[side]) && !shields.some((p) => coversSide(v, p, side)));
}

export function cabShield(v: Vehicle): number {
  return cabShieldWith(v)(null);
}

const LANE_ROW = 1024;
const LANE_SIDE_CODE: Record<string, number> = { F: 1, B: 2, L: 3, R: 4 };

export function cabShieldWith(v: Vehicle): (extra: GridItem | null) => number {
  const g = hitGridOf(v);
  const cab = mountedItems(v, 'core').filter((it) => isCab(partDef(it.part.defId))).flatMap(itemCells);
  const cabLanes = new Set(cab.flatMap((c) => [laneNumber('F', c.x), laneNumber('B', c.x), laneNumber('L', c.y), laneNumber('R', c.y)]));
  const lanesOf = (item: GridItem) => itemCells(item).map((c) => laneKey(g, c)).filter((key) => cabLanes.has(key));
  const armor = mountedItems(v, 'armor');
  const armorLanes = armor.map(lanesOf);
  const held = new Set(armorLanes.flat());
  const heldCounts = countBySide(held);
  return (extra) => {
    const added = extra ? extraLanes(v, extra, lanesOf) : null;
    if (!added || added.length === 0) return sideRootSum(armorLanes, heldCounts);
    const counts = countBySide(new Set([...held, ...added]));
    return sideRootSum(withLanesAt(armor, armorLanes, extra!, added), counts);
  };
}

function extraLanes(v: Vehicle, extra: GridItem, lanesOf: (item: GridItem) => number[]): number[] | null {
  if (extra.kind !== 'part' || partDef(extra.part.defId).kind !== 'armor') throw new Error('cabShieldWith takes an armor item as its extra');
  return isMounted(v.chassisId, extra) ? lanesOf(extra) : null;
}

function withLanesAt(armor: readonly GridItem[], armorLanes: number[][], extra: GridItem, lanes: number[]): number[][] {
  const at = armor.findIndex((it) => it.y > extra.y || (it.y === extra.y && it.x > extra.x));
  return at < 0 ? [...armorLanes, lanes] : [...armorLanes.slice(0, at), lanes, ...armorLanes.slice(at)];
}

function sideOfLane(key: number): number {
  return Math.floor(key / LANE_ROW);
}

function countBySide(keys: Iterable<number>): Map<number, number> {
  const counts = new Map<number, number>();
  for (const key of keys) counts.set(sideOfLane(key), (counts.get(sideOfLane(key)) ?? 0) + 1);
  return counts;
}

function sideRootSum(lanes: number[][], counts: Map<number, number>): number {
  const order = new Set<number>();
  for (const list of lanes) {
    for (const key of list) order.add(sideOfLane(key));
    if (order.size === counts.size) break;
  }
  return [...order].reduce((sum, side) => sum + Math.sqrt(counts.get(side)!), 0);
}

function laneNumber(letter: string, at: number): number {
  return LANE_SIDE_CODE[letter] * LANE_ROW + at;
}

function laneKey(g: Grid, c: { x: number; y: number }): number {
  const letter = g.cells[c.y]?.[c.x] ?? '';
  const code = LANE_SIDE_CODE[letter];
  if (!code) return 0;
  return code * LANE_ROW + (letter === 'F' || letter === 'B' ? c.x : c.y);
}

function isCab(def: PartDef): boolean {
  return def.kind === 'core' && def.role === 'cab';
}

type Local = { fwd: number; right: number };

function alongRow(chassisId: string, lane: number): number {
  const { half } = spanOf(chassisId);
  if (lane <= 0) return half.x;
  if (lane >= baseGrid(chassisId).h - 1) return -half.x;
  const { row } = cellSteps(chassisId);
  return ((baseGrid(chassisId).h - 2) * row) / 2 - (lane - 0.5) * row;
}

function acrossColumn(chassisId: string, lane: number): number {
  const { half } = spanOf(chassisId);
  const last = baseGrid(chassisId).w - 1;
  if (lane <= 0) return -half.z;
  if (lane >= last) return half.z;
  const { col } = cellSteps(chassisId);
  return -((last - 1) * col) / 2 + (lane - 0.5) * col;
}

function laneFace(v: Vehicle, side: Side, lane: number): { unit: number; at: Local } {
  const { center, half } = spanOf(v.chassisId);
  const n = laneCount(v, side);
  const all = unitsOf(v.chassisId);
  const face = (unit: number, fwd: number, right: number) => ({ unit, at: { fwd: fwd - all[unit].offset, right } });
  const row = () => unitOfRow(v.chassisId, Math.min(n - 1, Math.max(0, Math.round(lane)))).index;
  switch (side) {
    case 'front': return face(0, center + half.x, acrossColumn(v.chassisId, lane));
    case 'rear': return face(all.length - 1, center - half.x, acrossColumn(v.chassisId, lane));
    case 'left': return face(row(), center + alongRow(v.chassisId, lane), -half.z);
    case 'right': return face(row(), center + alongRow(v.chassisId, lane), half.z);
  }
}

export function lanePoint(v: Vehicle, side: Side, lane: number): Vec {
  const face = laneFace(v, side, lane);
  return poseToWorld(unitPose(v, face.unit), { x: face.at.fwd, z: face.at.right });
}

type BlastCell = { part: PartInstance; pose: UnitPose; center: Vec; rect: CellRect };

export function planBlast(v: Vehicle, p: Vec, radius: number, round: Round, skip: string | null): { part: PartInstance; amount: number }[] {
  checkRound(round);
  if (dist(v.pos, p) > radius + Math.hypot(footprint(v.chassisId), sideReach(v.chassisId))) return [];
  const cells = blastCells(v);
  const nearest = new Map<string, BlastCell>();
  for (const c of cells) {
    const best = nearest.get(c.part.id);
    if (!best || meters(p, c.center) < meters(p, best.center)) nearest.set(c.part.id, c);
  }
  return [...nearest.values()]
    .filter((c) => c.part.id !== skip && meters(p, c.center) <= radius)
    .map((c) => ({ part: c.part, amount: blastAmount(v, c, shields(cells, p, c), round, 1 - meters(p, c.center) / radius) }));
}

function blastCells(v: Vehicle): BlastCell[] {
  return mountedItems(v).filter((it) => it.part.hp > 0).flatMap((it) => itemCells(it).map((cell) => {
    const center = cellCenter(v.chassisId, cell.x, cell.y);
    const pose = unitPose(v, center.unit);
    return { part: it.part, pose, center: poseToWorld(pose, center), rect: cellRect(v.chassisId, [cell]) };
  }));
}

function meters(a: Vec, b: Vec): number {
  return dist(a, b) * PHYSICS.metersPerTile;
}

function localOf(pose: UnitPose, p: Vec): Local {
  const l = worldToPose(pose, p);
  return { fwd: l.x, right: l.z };
}

function shields(cells: BlastCell[], from: Vec, target: BlastCell): PartInstance[] {
  const entries = new Map<PartInstance, number>();
  for (const c of cells) {
    if (c.part.id === target.part.id) continue;
    const t = segmentEntry(localOf(c.pose, from), localOf(c.pose, target.center), c.rect);
    if (t !== null && t < (entries.get(c.part) ?? Infinity)) entries.set(c.part, t);
  }
  return [...entries.entries()].sort((a, b) => a[1] - b[1]).map(([part]) => part);
}

function segmentEntry(a: Local, b: Local, r: CellRect): number | null {
  let lo = 0;
  let hi = 1;
  for (const [start, delta, min, max] of [[a.fwd, b.fwd - a.fwd, r.x0, r.x1], [a.right, b.right - a.right, r.z0, r.z1]]) {
    if (delta === 0) {
      if (start < min || start > max) return null;
      continue;
    }
    const t0 = (min - start) / delta;
    const t1 = (max - start) / delta;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
    if (lo > hi) return null;
  }
  return lo;
}

function blastAmount(v: Vehicle, target: BlastCell, between: PartInstance[], round: Round, near: number): number {
  const left = { pen: round.pen, damage: round.damage * near };
  for (const part of between) {
    left.pen -= RULES.cellPen;
    if (left.pen <= 0) return 0;
    spendRound(v, part, left, round);
    if (left.pen <= 0) return 0;
  }
  left.pen -= RULES.cellPen;
  if (left.pen <= 0) return 0;
  const def = wornDef(target.part);
  return left.damage * shareOf(def, round) * Math.min(1, left.pen / armorOn(v, target.part, round.blast));
}

export function laneCount(v: Vehicle, side: Side): number {
  const g = hitGridOf(v);
  return side === 'front' || side === 'rear' ? g.w : g.h;
}

export function partLane(v: Vehicle, partId: string, side: Side): number {
  const item = mountedItems(v).find((it) => it.part.id === partId);
  if (!item) throw new Error(`${v.id} has no mounted part ${partId}`);
  const size = itemSize(item);
  return side === 'front' || side === 'rear' ? item.x + Math.floor(size.w / 2) : item.y + Math.floor(size.h / 2);
}

const laneCache = new WeakMap<Grid, Map<string, readonly { x: number; y: number }[]>>();

function laneCells(g: Grid, side: Side, lane: number): readonly { x: number; y: number }[] {
  let lanes = laneCache.get(g);
  if (!lanes) laneCache.set(g, (lanes = new Map()));
  const key = `${side}${lane}`;
  let cells = lanes.get(key);
  if (!cells) lanes.set(key, (cells = buildLaneCells(g, side, lane)));
  return cells;
}

function buildLaneCells(g: Grid, side: Side, lane: number): { x: number; y: number }[] {
  const lengthwise = side === 'front' || side === 'rear';
  checkLane(lane, lengthwise ? g.w : g.h, side);
  return Array.from({ length: lengthwise ? g.h : g.w }, (_, i) => LANE_STEP[side](g, lane, i));
}

const LANE_STEP: Record<Side, (g: Grid, lane: number, i: number) => { x: number; y: number }> = {
  front: (_g, lane, i) => ({ x: lane, y: i }),
  rear: (g, lane, i) => ({ x: lane, y: g.h - 1 - i }),
  left: (_g, lane, i) => ({ x: i, y: lane }),
  right: (g, lane, i) => ({ x: g.w - 1 - i, y: lane }),
};

function checkLane(lane: number, across: number, side: Side): void {
  if (!Number.isInteger(lane) || lane < 0 || lane >= across) throw new Error(`Lane ${lane} is outside the ${side} side (${across} lanes)`);
}

export function walkLane(world: World, v: Vehicle, side: Side, lane: number, round: Round): PartHit[] {
  return planLane(v, side, lane, round).map((h) => ({ part: h.part.id, damage: damagePart(world, v, h.part, h.amount) }));
}

export function planLane(v: Vehicle, side: Side, lane: number, round: Round): { part: PartInstance; amount: number }[] {
  return walkCells(laneOwners(hitGridOf(v), cellOwners(v), side, lane), round, 1, laneCellShare(v.chassisId, side), spenderOf(v));
}

export function planCrashLane(v: Vehicle, side: Side, lane: number, round: Round, falloff = RULES.crashFalloff): { part: PartInstance; amount: number }[] {
  return walkCells(laneOwners(hitGridOf(v), cellOwners(v), side, lane), round, falloff, laneCellShare(v.chassisId, side), hitterOf(v));
}

export function sidePlanner(v: Vehicle): (side: Side, round: Round) => { part: PartInstance; amount: number }[][] {
  const g = hitGridOf(v);
  const owner = cellOwners(v);
  const sides = new Map<Side, LaneCell[][]>();
  const spend = spenderOf(v);
  return (side, round) => {
    const share = laneCellShare(v.chassisId, side);
    let lanes = sides.get(side);
    if (!lanes) sides.set(side, (lanes = Array.from({ length: laneCount(v, side) }, (_, lane) => laneOwners(g, owner, side, lane))));
    return lanes.map((cells) => walkCells(cells, round, 1, share, spend));
  };
}

type LaneCell = { parts: readonly PartInstance[] } | null;

const NO_PARTS: readonly PartInstance[] = [];

function laneOwners(g: Grid, owner: Map<number, PartInstance[]>, side: Side, lane: number): LaneCell[] {
  return laneCells(g, side, lane).map((c) => (isRingCorner(g, c) ? null : { parts: owner.get(cellKey(c.x, c.y)) ?? NO_PARTS }));
}

function isRingCorner(g: Grid, c: { x: number; y: number }): boolean {
  return (c.x === 0 || c.x === g.w - 1) && (c.y === 0 || c.y === g.chassisH - 1) && g.cells[c.y][c.x] === null;
}

type Spend = (part: PartInstance, left: { pen: number; damage: number }, round: Round) => { part: PartInstance; amount: number };

export function laneCellShare(chassisId: string, side: Side): number {
  const { row, col } = chassisDef(chassisId).oldGrid;
  return GRID_CELL / (side === 'front' || side === 'rear' ? row : col);
}

function walkCells(cells: LaneCell[], round: Round, falloff: number, share: number, spend: Spend): { part: PartInstance; amount: number }[] {
  checkRound(round);
  const hits: { part: PartInstance; amount: number }[] = [];
  const struck = new Set<string>();
  const left = { pen: round.pen, damage: round.damage };
  for (const cell of cells) {
    if (left.pen <= 0) break;
    if (cell === null) continue;
    if (hits.length > 0) left.damage *= falloff ** share;
    left.pen -= RULES.cellPen * share;
    strikeCell(cell.parts, { left, round, struck, hits, spend });
  }
  return hits;
}

type Strike = { left: { pen: number; damage: number }; round: Round; struck: Set<string>; hits: { part: PartInstance; amount: number }[]; spend: Spend };

function strikeCell(parts: readonly PartInstance[], s: Strike): void {
  for (const part of parts) {
    if (!takesHit(part, s.left.pen, s.struck)) continue;
    s.struck.add(part.id);
    s.hits.push(s.spend(part, s.left, s.round));
  }
}

const spenderOf = (v: Vehicle): Spend => (part, left, round) => spendRound(v, part, left, round);
const hitterOf = (v: Vehicle): Spend => (part, left, round) => hitPart(v, part, left, round);

function spendRound(v: Vehicle, part: PartInstance, left: { pen: number; damage: number }, round: Round): { part: PartInstance; amount: number } {
  const def = wornDef(part);
  const armor = armorAgainst(def, round.blast);
  const absorbed = Math.min(1, (armor + RULES.cellPen) / (left.pen + RULES.cellPen));
  const amount = left.damage * shareOf(def, round) * absorbed * Math.min(1, left.pen / armorOn(v, part, round.blast));
  left.damage *= 1 - absorbed;
  left.pen -= armor;
  return { part, amount };
}

export function heldPart(v: Vehicle, side: Side, lane: number): PartInstance | null {
  const owner = cellOwners(v);
  const g = hitGridOf(v);
  const working = (at: number) => laneCells(g, side, at).flatMap((c) => owner.get(cellKey(c.x, c.y)) ?? []).find((p) => p.hp > 0);
  for (const at of lanesOutFrom(lane, laneCount(v, side))) {
    const part = working(at);
    if (part) return part;
  }
  return null;
}

function lanesOutFrom(lane: number, lanes: number): number[] {
  const all = Array.from({ length: lanes }, (_, at) => at);
  return all.sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane) || a - b);
}

function cellOwners(v: Vehicle): Map<number, PartInstance[]> {
  const owner = new Map<number, PartInstance[]>();
  for (const it of outerFirst(mountedItems(v))) {
    for (const c of itemCells(it)) {
      const key = cellKey(c.x, c.y);
      owner.set(key, [...(owner.get(key) ?? []), it.part]);
    }
  }
  return owner;
}

function outerFirst<T extends GridItem & { kind: 'part' }>(items: readonly T[]): T[] {
  const outer = (it: T) => (partDef(it.part.defId).kind === 'accessory' ? 0 : 1);
  return [...items].sort((a, b) => outer(a) - outer(b));
}

function takesHit(part: PartInstance, pen: number, struck: Set<string>): boolean {
  return pen > 0 && part.hp > 0 && !struck.has(part.id);
}

function hitPart(v: Vehicle, part: PartInstance, left: { pen: number; damage: number }, round: Round): { part: PartInstance; amount: number } {
  const def = wornDef(part);
  const armor = armorAgainst(def, round.blast);
  const amount = left.damage * shareOf(def, round) * Math.min(1, left.pen / armorOn(v, part, round.blast));
  left.damage *= Math.max(0, left.pen - armor) / left.pen;
  left.pen -= armor;
  return { part, amount };
}

function checkRound(round: Round): void {
  if (!(round.damage >= 0 && round.pen >= 0 && round.armorShare >= 0)) throw new Error(`Bad round ${JSON.stringify(round)}`);
}

function shareOf(def: PartDef, round: Round): number {
  return isShield(def) ? round.armorShare : 1;
}

export function passShare(v: Vehicle, side: Side, round: { pen: number; blast: boolean }): number {
  const g = hitGridOf(v);
  const owner = cellOwners(v);
  const lanes = Array.from({ length: laneCount(v, side) }, (_, lane) => firstParts(g, owner, side, lane));
  const pass = (part: PartInstance) => {
    const def = wornDef(part);
    if (!isShield(def)) return 1;
    return round.pen <= 0 ? 0 : Math.max(0, round.pen - armorOn(v, part, round.blast)) / round.pen;
  };
  return lanes.reduce((sum, parts) => sum + parts.reduce((share, part) => share * pass(part), 1), 0) / lanes.length;
}

function firstParts(g: Grid, owner: Map<number, PartInstance[]>, side: Side, lane: number): PartInstance[] {
  for (const c of laneCells(g, side, lane)) {
    const parts = (owner.get(cellKey(c.x, c.y)) ?? []).filter((part) => part.hp > 0);
    if (parts.length) return parts;
  }
  return [];
}

function armorAgainst(def: PartDef, blast: boolean): number {
  return blast && isShield(def) ? def.blastArmor : def.armor;
}

export function armorOn(v: Vehicle, part: PartInstance, blast: boolean): number {
  const def = wornDef(part);
  return armorAgainst(def, blast) + partArmorBonus(v.chassisId, def, sitsOnDeck(v, part));
}

function sitsOnDeck(v: Vehicle, part: PartInstance): boolean {
  if (!chassisAbility(v.chassisId)?.deckArmor) return false;
  const item = v.items.find((it) => it.kind === 'part' && it.part.id === part.id);
  if (!item) throw new Error(`Part ${part.id} is not on ${v.id}`);
  const base = baseGrid(v.chassisId);
  return itemCells(item).every((c) => base.cells[c.y]?.[c.x] === 'D');
}

export const SIDES: readonly Side[] = ['front', 'rear', 'left', 'right'];

export type FireSpan = { from: number; to: number };

const SIDE_CENTER: Record<Side, number> = { front: 0, right: 90, rear: 180, left: -90 };

export function gunSpans(v: Loadout, item: GridItem): FireSpan[] {
  return spansIn(v, tallItems(v), item);
}

export function gunBlockers(v: Vehicle, item: GridItem): GridItem[] {
  const arc = arcPieces(v, item);
  const out = new Set<GridItem>();
  for (const s of shadowsOf(tallItems(v), item)) if (overlaps(s.pieces, arc)) out.add(s.blocker);
  return [...out];
}

export function spanSides(spans: readonly FireSpan[]): Side[] {
  const pieces = spans.flatMap((s) => splitAtBack(s.from, s.to));
  return SIDES.filter((side) => {
    const from = wrapFrom(SIDE_CENTER[side] - 45);
    return overlaps(splitAtBack(from, from + 90), pieces);
  });
}

function overlaps(a: readonly FireSpan[], b: readonly FireSpan[]): boolean {
  return a.some((p) => b.some((q) => p.to > q.from && p.from < q.to));
}

export function spanDegrees(spans: readonly FireSpan[]): number {
  return spans.reduce((sum, s) => sum + s.to - s.from, 0);
}

export function gunLayoutKey(v: Vehicle): string {
  const placed = v.items.flatMap((it) => (it.kind === 'part' && isGunOrTall(it) ? [`${it.x},${it.y},${it.rot},${it.part.defId},${it.part.wear},${it.part.hp > 0 ? 1 : 0}`] : []));
  return `${v.chassisId};${placed.join(';')}`;
}

function isGunOrTall(it: Extract<GridItem, { kind: 'part' }>): boolean {
  const def = partDef(it.part.defId);
  return def.kind === 'weapon' || Boolean(def.tall);
}

const OPEN_ARCS_KEPT = 512;
const openArcCache = new Map<string, number[]>();

export function openArcShares(v: Vehicle): number[] {
  const key = gunLayoutKey(v);
  const known = openArcCache.get(key);
  if (known) return known;
  const tall = tallItems(v);
  const shares = mountedItems(v, 'weapon').map((item) => shareOpen(v, tall, item));
  if (openArcCache.size >= OPEN_ARCS_KEPT) openArcCache.clear();
  openArcCache.set(key, shares);
  return shares;
}

function shareOpen(v: Vehicle, tall: readonly GridItem[], item: GridItem): number {
  return spanDegrees(spansIn(v, tall, item)) / spanDegrees(arcPieces(v, item));
}

export function gunLayoutScore(v: Vehicle): number {
  const guns = mountedItems(v, 'weapon');
  const tall = tallItems(v);
  const covered = new Set<Side>();
  let sum = 0;
  for (const item of guns) {
    const spans = spansIn(v, tall, item);
    for (const side of spanSides(spans)) covered.add(side);
    sum += spanDegrees(spans);
  }
  return covered.size * (360 * guns.length + 1) + sum;
}

function spansIn(v: Loadout, tall: readonly GridItem[], item: GridItem): FireSpan[] {
  const shadows = shadowsOf(tall, item).flatMap((s) => s.pieces);
  const open = arcPieces(v, item).flatMap((piece) => shadows.reduce((left, cut) => left.flatMap((p) => subtract(p, cut)), [piece]));
  return joinAcrossBack(mergeSpans(open));
}

function arcPieces(v: Loadout, item: GridItem): FireSpan[] {
  if (item.kind !== 'part') throw new Error(`${item.id} is not a part`);
  const arc = weaponArc(v.chassisId, item.part.defId);
  if (arc >= 360) return [{ from: -180, to: 180 }];
  const from = wrapFrom(facingOf(item) - arc / 2);
  return splitAtBack(from, from + arc);
}

function shadowsOf(tall: readonly GridItem[], item: GridItem): { blocker: GridItem; pieces: FireSpan[] }[] {
  const { w, h } = itemSize(item);
  const ox = item.x + w / 2;
  const oy = item.y + h / 2;
  return tall.filter((blocker) => blocker.id !== item.id).map((blocker) => ({
    blocker,
    pieces: itemCells(blocker).flatMap(({ x, y }) => cellShadow(x, y, ox, oy)),
  }));
}

const SHADOW_KEY_RANGE = 128;
const cellShadows = new Map<number, readonly FireSpan[]>();

function cellShadow(x: number, y: number, ox: number, oy: number): readonly FireSpan[] {
  const parts = [x, y, ox * 2, oy * 2];
  if (!parts.every((n) => Number.isInteger(n) && n >= 0 && n < SHADOW_KEY_RANGE)) throw new Error(`Shadow cell ${x},${y} from ${ox},${oy} is off the grid`);
  const key = parts.reduce((acc, n) => acc * SHADOW_KEY_RANGE + n, 0);
  let pieces = cellShadows.get(key);
  if (!pieces) {
    pieces = Object.freeze(buildCellShadow(x, y, ox, oy).map((piece) => Object.freeze(piece)));
    cellShadows.set(key, pieces);
  }
  return pieces;
}

function buildCellShadow(x: number, y: number, ox: number, oy: number): FireSpan[] {
  const center = gridAngle(x + 0.5 - ox, y + 0.5 - oy);
  const off = (a: number) => wrapDegrees(a - center);
  const corners = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].map(([cx, cy]) => gridAngle(cx - ox, cy - oy));
  const left = corners.reduce((best, a) => (off(a) < off(best) ? a : best));
  const right = corners.reduce((best, a) => (off(a) > off(best) ? a : best));
  const from = wrapFrom(left);
  return splitAtBack(from, from + off(right) - off(left));
}

function gridAngle(dx: number, dy: number): number {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

function wrapFrom(angle: number): number {
  return angle >= 180 ? angle - 360 : angle < -180 ? angle + 360 : angle;
}

function subtract(p: FireSpan, cut: FireSpan): FireSpan[] {
  if (cut.to <= p.from || cut.from >= p.to) return [p];
  return [{ from: p.from, to: cut.from }, { from: cut.to, to: p.to }].filter((s) => s.to > s.from);
}

function mergeSpans(pieces: FireSpan[]): FireSpan[] {
  const merged: FireSpan[] = [];
  for (const p of [...pieces].sort((a, b) => a.from - b.from)) {
    const last = merged.at(-1);
    if (last && p.from <= last.to) last.to = Math.max(last.to, p.to);
    else merged.push({ ...p });
  }
  return merged;
}

function tallItems(v: Loadout): GridItem[] {
  return v.items.filter((it) => it.kind === 'part' && Boolean(partDef(it.part.defId).tall));
}

export function aimWithin(spans: readonly FireSpan[], rel: number): number {
  if (spans.length === 0) throw new Error('aimWithin needs at least one span');
  if (spansHold(spans, rel)) return rel;
  const edges = spans.flatMap((span) => [span.from, span.to]);
  const apart = (edge: number) => Math.abs(((edge - rel + 540) % 360) - 180);
  const nearest = edges.reduce((best, edge) => (apart(edge) < apart(best) ? edge : best));
  return wrapDegrees(nearest);
}

export function spansHold(spans: readonly FireSpan[], rel: number): boolean {
  return spans.some((span) => spanHolds(span, rel) || spanHolds(span, rel + 360));
}

function spanHolds(span: FireSpan, angle: number): boolean {
  return angle >= span.from && angle <= span.to;
}

function wrapDegrees(angle: number): number {
  return angle > 180 ? angle - 360 : angle <= -180 ? angle + 360 : angle;
}

function splitAtBack(from: number, to: number): FireSpan[] {
  return to <= 180 ? [{ from, to }] : [{ from, to: 180 }, { from: -180, to: to - 360 }];
}

function joinAcrossBack(spans: FireSpan[]): FireSpan[] {
  const first = spans[0];
  const last = spans.at(-1);
  if (spans.length < 2 || !first || !last || first.from !== -180 || last.to !== 180) return spans;
  return [{ from: last.from, to: first.to + 360 }, ...spans.slice(1, -1)];
}
