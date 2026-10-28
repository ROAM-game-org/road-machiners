
import { CRATE_MASS } from '../data/goods';
import { partDef } from '../data/parts';
import { skillEffect } from './progress';
import { playerVehicle, truckFor } from './damage';
import { newId } from './factory';
import { cabShieldWith, gunLayoutScore } from './armor';
import { findSpot, freeCells, gridOf, isMounted, itemCells, itemSize, layerOf, layoutError, mountCellsOf, mountSpots, placementError, type Cell, type Grid, type Spot } from './grid';
import { atGarage, requireGarage } from './garage';
import { disarm } from './claymore';
import { workTimeMult } from './utility';
import { startJob } from './jobs';
import { RULES } from '../data/rules';
import { canReachSalvage, dumpOnPile, pickupWork, truckPickupItem } from './salvage';
import { modeRules } from './settings';
import { fitStores } from './resources';
import { itemMass } from './mass';
import { npcMassRoom, vehicleStats } from './stats';
import { inCombat } from './combat';
import type { GridItem, PartInstance, RefitJob, RefitMove, RefitPickup, RefitStep, Refusal, Vehicle, World } from './types';
import { playerCommand, Refused } from './world';
import { requireSpareGoods } from './market';

export function mountPart(world: World, v: Vehicle, part: PartInstance, mount: Cell[] = mountCellsOf(part.defId)): boolean {
  const item: PartItem = { id: newId(world, 'i'), x: 0, y: 0, rot: 0, kind: 'part', part };
  const spot = installSpot(v, item, mount);
  if (!spot) return false;
  v.items.push({ ...item, ...spot });
  return true;
}

type PartItem = Extract<GridItem, { kind: 'part' }>;

export function installSpot(v: Vehicle, item: PartItem, mount: Cell[] = mountCellsOf(item.part.defId)): Spot | null {
  const others = { ...v, items: v.items.filter((it) => it.id !== item.id) };
  const def = partDef(item.part.defId);
  if (def.kind === 'weapon' || def.tall) return bestArcSpot(others, item, mount);
  if (def.kind === 'armor') return bestShieldSpot(others, item, mount);
  if (def.kind === 'accessory') return middleSpot(others, item, mount);
  return findSpot(gridOf(others), others.items, item, mount, null);
}

export function stowSpot(v: Vehicle, item: GridItem): Spot | null {
  const avoid = item.kind === 'part' ? mountCellsOf(item.part.defId) : null;
  return findSpot(gridOf(v), v.items, item, null, avoid);
}

function bestArcSpot(v: Vehicle, item: GridItem, mount: Cell[]): Spot | null {
  let best: Spot | null = null;
  let bestScore = -1;
  for (const spot of mountSpots(gridOf(v), v.items, item, mount)) {
    const score = gunLayoutScore({ ...v, items: [...v.items, { ...item, ...spot }] });
    if (score > bestScore) [best, bestScore] = [spot, score];
  }
  return best;
}

function bestShieldSpot(v: Vehicle, item: GridItem, mount: Cell[]): Spot | null {
  let best: Spot | null = null;
  let bestScore = [-1, -1, -1];
  const g = gridOf(v);
  const shield = cabShieldWith(v);
  const taken = new Set(v.items.filter((it) => layerOf(g, it) === 'base').flatMap(itemCells).map((c) => `${c.x},${c.y}`));
  for (const spot of mountSpots(g, v.items, item, mount)) {
    const placed = { ...item, ...spot };
    const score = [shield(placed), Number(g.cells[spot.y][spot.x] === 'F'), closedEnds(g, taken, placed)];
    if (ranksAbove(score, bestScore)) [best, bestScore] = [spot, score];
  }
  return best;
}

function ranksAbove(a: number[], b: number[]): boolean {
  const at = a.findIndex((n, i) => n !== b[i]);
  return at >= 0 && a[at] > b[at];
}

function closedEnds(g: Grid, taken: Set<string>, item: GridItem): number {
  const cells = itemCells(item);
  const edge = g.cells[cells[0].y][cells[0].x];
  const along = edge === 'F' || edge === 'B' ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 };
  const xs = cells.map((c) => c.x * along.dx + c.y * along.dy);
  const at = (n: number) => (along.dx ? { x: n, y: cells[0].y } : { x: cells[0].x, y: n });
  const closed = (c: { x: number; y: number }) => g.cells[c.y]?.[c.x] !== edge || taken.has(`${c.x},${c.y}`);
  return Number(closed(at(Math.min(...xs) - 1))) + Number(closed(at(Math.max(...xs) + 1)));
}

function middleSpot(v: Vehicle, item: PartItem, mount: Cell[]): Spot | null {
  const g = gridOf(v);
  for (const letter of mount) {
    const spots = mountSpots(g, v.items, item, [letter]);
    const off = (spot: Spot) => offMiddle(g, { ...item, ...spot }, letter);
    if (spots.length) return spots.reduce((best, spot) => (off(spot) < off(best) ? spot : best));
  }
  return null;
}

function offMiddle(g: Grid, item: PartItem, letter: Cell): number {
  const { w, h } = itemSize(item);
  return letter === 'L' || letter === 'R' ? Math.abs(item.y + h / 2 - g.chassisH / 2) : Math.abs(item.x + w / 2 - g.w / 2);
}

export function cargoMassRoom(v: Vehicle): number {
  return v.brain ? npcMassRoom(v) : Infinity;
}

export function cargoRoom(v: Vehicle): number {
  return Math.min(freeCells(v), Math.floor(cargoMassRoom(v) / CRATE_MASS));
}

export function hasCargoRoom(v: Vehicle): boolean {
  return cargoRoom(v) > 0;
}

export function stowPlace(v: Vehicle, item: GridItem): Spot | null {
  return itemMass(item) > cargoMassRoom(v) ? null : stowSpot(v, item);
}

export function canStowPart(v: Vehicle, part: PartInstance): boolean {
  return stowPlace(v, { id: 'probe', x: 0, y: 0, rot: 0, kind: 'part', part }) !== null;
}

export function stowPart(world: World, v: Vehicle, part: PartInstance): boolean {
  const item: GridItem = { id: newId(world, 'i'), x: 0, y: 0, rot: 0, kind: 'part', part };
  const spot = stowPlace(v, item);
  if (!spot) return false;
  v.items.push({ ...item, ...spot });
  return true;
}

export type ParcelItem = Extract<GridItem, { kind: 'parcel' }>;

export function stowParcel(v: Vehicle, parcel: ParcelItem): boolean {
  const spot = findSpot(gridOf(v), v.items, parcel, null, null);
  if (!spot) return false;
  v.items.push({ ...parcel, ...spot });
  return true;
}

export function addGoods(world: World, v: Vehicle, good: string, n: number): number {
  const count = Math.min(n, cargoRoom(v));
  for (let i = 0; i < count; i++) {
    const item: GridItem = { id: newId(world, 'i'), x: 0, y: 0, rot: 0, kind: 'good', good };
    const spot = findSpot(gridOf(v), v.items, item, null, null);
    if (!spot) return i;
    v.items.push({ ...item, ...spot });
  }
  return count;
}

export function removeGoods(v: Vehicle, good: string, n: number): void {
  const held = v.items.filter((it) => it.kind === 'good' && it.good === good);
  if (held.length < n) throw new Error(`Cannot remove ${n} ${good}, holding ${held.length}`);
  const drop = new Set(held.slice(held.length - n).map((it) => it.id));
  v.items = v.items.filter((it) => !drop.has(it.id));
}

export function removeAllGoods(v: Vehicle): void {
  v.items = v.items.filter((it) => it.kind !== 'good');
}

export function spareParts(v: Vehicle): PartInstance[] {
  return v.items.flatMap((it) => (it.kind === 'part' && !isMounted(v.chassisId, it) ? [it.part] : []));
}

function refitTruck(w: World, truckId: string | undefined, atGarageOnly: boolean): Vehicle {
  const truck = truckFor(w, truckId);
  if (atGarageOnly && truck.id !== w.player.vehicleId) requireGarage(w, truck.id);
  return truck;
}

export function moveItem(world: World, itemId: string, to: Spot, truckId?: string): World {
  return playerCommand(world, (w) => {
    const me = refitTruck(w, truckId, true);
    const result = planItemMove(plannedTruck(w, me), itemId, to);
    if (result.error !== null) throw new Refused(result.error);
    commitRefit(w, me, result.plan);
  });
}

export type RefitLayout = Record<string, Spot>;

export function startRefit(world: World, layout: RefitLayout, truckId?: string): World {
  return playerCommand(world, (w) => {
    const me = refitTruck(w, truckId, true);
    commitRefit(w, me, layoutPlan(plannedTruck(w, me), layout));
  });
}

export function plannedRefitTurns(world: World, v: Vehicle, layout: RefitLayout): number {
  const planned = plannedTruck(world, v);
  return movesWork(world, planned, layoutPlan(planned, layout).turns);
}

export function movesWork(world: World, v: Vehicle, planned: number): number {
  return planned > 0 && !atGarage(world, v.id) ? refitTurns(world, v, planned) : 0;
}

function layoutPlan(v: Vehicle, layout: RefitLayout): RefitPlan {
  const moves: RefitMove[] = [];
  for (const [itemId, to] of Object.entries(layout)) {
    const item = findItem(v, itemId);
    if (!matchesSpot(item, to)) moves.push({ itemId, from: getSpot(item), to: getSpot(to) });
  }
  if (moves.length === 0) throw new Error('The layout changes nothing');
  const result = planMoves(v, moves);
  if (result.error !== null) throw new Refused(result.error);
  return result.plan;
}

function commitRefit(w: World, me: Vehicle, plan: RefitPlan): void {
  disarmMoving(me, plan.moves);
  if (me.job?.kind === 'refit' || movesWork(w, me, plan.turns) > 0) queueRefit(w, me, { moves: plan.moves, pickup: null });
  else applyRefitLayout(w, me, plan.items);
}

function disarmMoving(me: Vehicle, moves: RefitMove[]): void {
  for (const move of moves) {
    const moving = me.items.find((it) => it.id === move.itemId);
    if (moving?.kind === 'part') disarm(moving.part);
  }
}

export function queueRefit(world: World, v: Vehicle, step: RefitStep): void {
  requireStepWork(step);
  const job = v.job;
  if (job?.kind !== 'refit') return startRefitStep(world, v, step, []);
  if (inCombat(world, v)) throw new Refused({ id: 'inCombat' });
  const planned = plannedRefit(world, v);
  const result = refitStepLayout(world, { ...v, items: planned.items }, step, planned.taken);
  if (result.error !== null) throw new Refused(result.error);
  job.queue.push(step);
}

export function startRefitStep(world: World, v: Vehicle, step: RefitStep, queue: RefitStep[]): void {
  const result = refitStepLayout(world, v, step, NOTHING_TAKEN);
  if (result.error !== null) throw new Refused(result.error);
  const work = refitStepWork(world, v, step);
  startJob(world, v, { kind: 'refit', moves: step.moves, pickup: step.pickup, queue, turnsLeft: work, total: work });
}

function requireStepWork(step: RefitStep): void {
  if (step.moves.length === 0 && step.pickup === null) throw new Error('The layout changes nothing');
  if (step.moves.length > 0 && step.pickup !== null) throw new Error('A refit step holds moves or one pickup, not both');
}

export function refitStepWork(world: World, v: Vehicle, step: RefitStep, taken: ReadonlySet<string> = NOTHING_TAKEN): number {
  requireStepWork(step);
  if (step.pickup) {
    const placed = getRefitPickup(world, v, step.pickup, taken);
    if (!('kind' in placed)) throw new Refused(placed);
    return pickupWork(world, v, step.pickup, placed);
  }
  const result = planMoves(v, step.moves);
  if (result.error !== null) throw new Refused(result.error);
  return movesWork(world, v, result.plan.turns);
}

export type PlannedStep = { step: RefitStep; work: number };
export type PlannedRefit = { items: GridItem[]; head: GridItem[]; steps: PlannedStep[]; taken: ReadonlySet<string> };

export function plannedRefit(world: World, v: Vehicle): PlannedRefit {
  const job = v.job;
  if (job?.kind !== 'refit') return idleRefit(v);
  const head = refitStepLayout(world, v, job, NOTHING_TAKEN);
  return head.error !== null ? idleRefit(v) : walkQueue(world, v, job, head.items);
}

function idleRefit(v: Vehicle): PlannedRefit {
  return { items: v.items, head: v.items, steps: [], taken: NOTHING_TAKEN };
}

function walkQueue(world: World, v: Vehicle, job: RefitJob, head: GridItem[]): PlannedRefit {
  const taken = new Set(job.pickup ? [job.pickup.partId] : []);
  const steps: PlannedStep[] = [];
  let items = head;
  for (const step of job.queue) {
    const planned = { ...v, items };
    const next = refitStepLayout(world, planned, step, taken);
    if (next.error !== null) continue;
    steps.push({ step, work: refitStepWork(world, planned, step, taken) });
    items = next.items;
    if (step.pickup) taken.add(step.pickup.partId);
  }
  return { items, head, steps, taken };
}

export function refitTurnsLeft(world: World, v: Vehicle): number {
  if (v.job?.kind !== 'refit') return 0;
  return v.job.turnsLeft + plannedRefit(world, v).steps.reduce((sum, step) => sum + step.work, 0);
}

export function plannedTruck(world: World, v: Vehicle): Vehicle {
  return v.job?.kind === 'refit' ? { ...v, items: plannedRefit(world, v).items } : v;
}

export const NOTHING_TAKEN: ReadonlySet<string> = new Set();

export function refitTurns(world: World, v: Vehicle, planned: number): number {
  return Math.max(1, Math.ceil(planned * workTimeMult(v) * (1 - skillEffect(world, v, 'machining', 'refit'))));
}

export function storePart(world: World, itemId: string, truckId?: string): World {
  return playerCommand(world, (w) => {
    requireGarage(w, truckId);
    const me = truckFor(w, truckId);
    requireIdleRefit(me);
    const item = findItem(me, itemId);
    if (item.kind !== 'part') throw new Error('Only parts go into garage storage');
    requireRemovable(item);
    me.items = me.items.filter((it) => it.id !== itemId);
    disarm(item.part);
    w.player.storage.push(item.part);
    afterRefit(w, me);
  });
}

export function takeFromStorage(world: World, partId: string, to: Spot, truckId?: string): World {
  return playerCommand(world, (w) => {
    requireGarage(w, truckId);
    const me = truckFor(w, truckId);
    requireIdleRefit(me);
    const i = w.player.storage.findIndex((p) => p.id === partId);
    if (i < 0) throw new Error(`No stored part ${partId}`);
    const item: GridItem = { id: newId(w, 'i'), kind: 'part', part: w.player.storage[i], ...to };
    const err = placementError(gridOf(me), me.items, item, null);
    if (err) throw new Refused(err);
    w.player.storage.splice(i, 1);
    me.items.push(item);
    afterRefit(w, me);
  });
}

export function dumpItem(world: World, itemId: string, truckId?: string): World {
  return playerCommand(world, (w) => {
    const me = refitTruck(w, truckId, true);
    requireIdleRefit(me);
    const item = findItem(me, itemId);
    if (item.kind === 'parcel') throw new Refused({ id: 'parcelKept' });
    if (item.kind === 'good') requireSpareGoods(w, me, item.good, 1);
    if (isMounted(me.chassisId, item)) throw new Error('Remove an installed part before dumping it');
    if (modeRules(w).looting) dumpOnPile(w, me, item);
    else me.items = me.items.filter((it) => it.id !== item.id);
  });
}

function findItem(v: Vehicle, itemId: string): GridItem {
  const item = v.items.find((it) => it.id === itemId);
  if (!item) throw new Error(`No item ${itemId}`);
  return item;
}

function requireRemovable(item: GridItem): void {
  if (item.kind === 'part' && partDef(item.part.defId).kind === 'core') throw new Refused({ id: 'builtInFixed' });
}

export function afterRefit(w: World, me: Vehicle = playerVehicle(w)): void {
  const error = getLayoutError(me, me.items);
  if (error) throw new Refused(error);
  applyRefitLayout(w, me, me.items);
}

type RefitPlan = { moves: RefitMove[]; items: GridItem[]; turns: number };
type PlanResult = { plan: RefitPlan; error: null } | { plan: null; error: Refusal };

export function requireIdleRefit(v: Vehicle): void {
  if (v.job?.kind === 'refit') throw new Refused({ id: 'refitRunning' });
}

export function getLayoutError(v: Vehicle, items: GridItem[]): Refusal | null {
  const cause = layoutError(gridOf({ ...v, items }), items);
  return cause ? { id: 'badLayout', cause } : null;
}

export function planItemMove(v: Vehicle, itemId: string, to: Spot): PlanResult {
  const item = v.items.find((entry) => entry.id === itemId);
  if (!item) return { plan: null, error: { id: 'itemGone' } };
  const moved = { ...item, ...getSpot(to) };
  const g = gridOf(v);
  const layer = layerOf(g, moved);
  const cells = new Set(itemCells(moved).map((cell) => `${cell.x},${cell.y}`));
  const targets = v.items.filter((other) => other.id !== itemId && layerOf(g, other) === layer && itemCells(other).some((cell) => cells.has(`${cell.x},${cell.y}`)));
  if (targets.length > 1) return { plan: null, error: { id: 'twoInTheWay' } };
  const moves: RefitMove[] = [{ itemId, from: getSpot(item), to: getSpot(to) }];
  const target = targets[0];
  if (target) moves.push({ itemId: target.id, from: getSpot(target), to: getSpot(item) });
  return planMoves(v, moves);
}

export function plannedVehicle(v: Vehicle, layout: RefitLayout): Vehicle {
  if (Object.keys(layout).length === 0) return v;
  return { ...v, items: v.items.map((it) => (layout[it.id] ? { ...it, ...layout[it.id] } : it)) };
}

function sameMoves(a: RefitMove[], b: RefitMove[]): boolean {
  return a.length === b.length && a.every((move, i) => move.itemId === b[i].itemId && move.to.x === b[i].to.x && move.to.y === b[i].to.y && move.to.rot === b[i].to.rot);
}

export function fieldMoveIsInstant(v: Vehicle, layout: RefitLayout, itemId: string, to: Spot): boolean {
  const drawn = planItemMove(plannedVehicle(v, layout), itemId, to);
  const real = planItemMove(v, itemId, to);
  if (drawn.error !== null || real.error !== null) return false;
  if (drawn.plan.turns !== 0 || real.plan.turns !== 0) return false;
  if (!sameMoves(drawn.plan.moves, real.plan.moves)) return false;
  return drawn.plan.moves.every((move) => !layout[move.itemId]);
}

function planMoves(v: Vehicle, moves: RefitMove[]): PlanResult {
  const items = [...v.items];
  let turns = 0;
  for (const move of moves) {
    const index = items.findIndex((item) => item.id === move.itemId);
    const item = items[index];
    const problem = getMoveError(item, move);
    if (problem) return { plan: null, error: problem };
    if (matchesSpot(item, move.to)) continue;
    const moved = { ...item, ...move.to };
    turns += RULES.refitTurnsPerPart * (Number(isMounted(v.chassisId, item)) + Number(isMounted(v.chassisId, moved)));
    items[index] = moved;
  }
  const error = getLayoutError(v, items);
  return error ? { plan: null, error } : { plan: { moves, items, turns }, error: null };
}

function getMoveError(item: GridItem | undefined, move: RefitMove): Refusal | null {
  if (!item || !matchesSpot(item, move.from)) return { id: 'refitItemMoved' };
  if (item.kind === 'part' && partDef(item.part.defId).kind === 'core') return { id: 'builtInFixed' };
  return null;
}

export type StepLayout = { items: GridItem[]; error: null } | { items: null; error: Refusal };

export function getRefitLayout(world: World, v: Vehicle, job: RefitJob): StepLayout {
  return refitStepLayout(world, v, job, NOTHING_TAKEN);
}

export function refitStepLayout(world: World, v: Vehicle, step: RefitStep, taken: ReadonlySet<string>): StepLayout {
  const result = planMoves(v, step.moves);
  if (result.error !== null) return { items: null, error: result.error };
  const items = result.plan.items;
  if (step.pickup) {
    const pickup = getRefitPickup(world, v, step.pickup, taken);
    if (!('kind' in pickup)) return { items: null, error: pickup };
    items.push(pickup);
  }
  const error = getLayoutError(v, items);
  return error ? { items: null, error } : { items, error: null };
}

function getRefitPickup(world: World, v: Vehicle, pickup: RefitPickup, taken: ReadonlySet<string>): GridItem | Refusal {
  return pickup.from === 'truck' ? truckPickupItem(world, v, pickup, taken) : stockPickupItem(world, v, pickup, taken);
}

function stockPickupItem(world: World, v: Vehicle, pickup: Extract<RefitPickup, { from: 'stock' }>, taken: ReadonlySet<string>): GridItem | Refusal {
  const { stockId, partId, itemId, to } = pickup;
  const stock = world.salvage.find((entry) => entry.id === stockId);
  if (!stock || !world.player.scavenged.includes(stockId) || !canReachSalvage(v, stock)) return { id: 'salvageOutOfReach' };
  if (taken.has(partId)) return { id: 'partQueued' };
  const part = stock.parts.find((entry) => entry.id === partId);
  if (!part) return { id: 'salvagePartGone' };
  return { kind: 'part', id: itemId, part, ...to };
}

export function applyRefitLayout(world: World, v: Vehicle, items: GridItem[]): void {
  v.items = items;
  const stats = vehicleStats(world, v);
  for (const id of Object.keys(v.weaponOrders)) {
    if (!stats.weapons.some((mount) => mount.part.id === id)) delete v.weaponOrders[id];
  }
  fitStores(world, v);
}

function getSpot(item: Spot): Spot {
  return { x: item.x, y: item.y, rot: item.rot };
}

function matchesSpot(item: GridItem, spot: Spot): boolean {
  return item.x === spot.x && item.y === spot.y && item.rot === spot.rot;
}
