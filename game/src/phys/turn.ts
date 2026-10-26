
import { PHYSICS } from '../data/physics';
import { RULES } from '../data/rules';
import { CHASSIS } from '../data/chassis';
import { warmRoutes } from '../sim/path';
import { endTurn } from '../sim/world';
import { inQuestLanguage } from '../sim/quests';
import { QUEST_LANGUAGES, type QuestLanguage } from '../data/quests';
import { perfSnapshot, resetPerf, timed, type PerfStat } from '../perf';
import { playerVehicle } from '../sim/damage';
import { advanceFar } from '../sim/far';
import { applyContactCrash, applyGroundCrash, applyLanding } from '../sim/crash-contact';
import { tearLine } from '../sim/harpoon';
import { breakProp } from '../sim/salvage';
import { isOnRope } from '../sim/tow';
import { burnFuel } from '../sim/resources';
import { setDown } from '../sim/steering';
import { clearanceFor } from '../sim/clearance';
import type { MoveOrder, Obstacle, Pose, Vehicle, World } from '../sim/types';
import { angleDiff, dist, lerp, type Vec } from '../sim/vec';
import { exploreFrom, visibleTiles } from '../sim/vision';
import { bodyState, buildDrive, GROUND, isLifted, captureDrive, freeDrive, initPhysics, restoreDrive, restWheels, simulateSteps, simulateTurn, syncDrive, toTilesPerTurn, trailFrames, TURN_STEPS, type Drive, type DriveSnapshot, type TurnResult, type VehicleResult } from './drive';
import { frameBend, headingOf, toMap, type TurnFrames, type VehicleFrame, type WheelFrame } from './frames';
import { bendField, checkBend, heldBend, poseOf } from '../sim/rig';
import { planTurns, type PlanFrames } from './plan';

export type TurnState = Omit<World, 'terrain'>;
export type WorldTask = { world: TurnState; drive: DriveSnapshot };
type LanguageTask = WorldTask & { questLanguage: QuestLanguage };
export type TurnTask = LanguageTask & { tailSteps: number };
export type LiveSight = { steps: number[]; tiles: number[][] };
export type TailPose = { pos: Vec; heading: number; speed: number; bend?: number };
export type Tail = { frames: TurnFrames; next: DriveSnapshot; poses: Record<string, TailPose> };
export type PreparedTurn = {
  world: TurnState;
  result: Omit<TurnResult, 'next'> & { next: DriveSnapshot };
  sight: LiveSight;
  tail: Tail | null;
};

export const LIVE_SIGHT_STEP = 0.35;

export function liveSightOf(world: World, frames: readonly VehicleFrame[] | undefined): LiveSight {
  const sight: LiveSight = { steps: [], tiles: [] };
  let from: Vec | null = null;
  (frames ?? []).forEach((f, step) => {
    const at = toMap(f.pos);
    if (from && dist(from, at) < LIVE_SIGHT_STEP) return;
    from = at;
    sight.steps.push(step);
    sight.tiles.push([...visibleTiles(world, at)].sort((a, b) => a - b));
  });
  return sight;
}
export type PreviewTask = LanguageTask & { meId: string };
type Posted<T extends WorldTask> = Omit<T, 'world'> & { world: Omit<TurnState, 'obstacles'>; obstacles: Obstacle[] | null; terrain: World['terrain'] | null };
export type TurnRequest = Posted<TurnTask> & { kind: 'turn'; id: number };
export type PreviewRequest = Posted<PreviewTask> & { kind: 'preview'; id: number };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => sameData(a[k], b[k]));
}

export class SentObstacles {
  private last: readonly Obstacle[] | null = null;

  split(world: TurnState): { world: Omit<TurnState, 'obstacles'>; obstacles: Obstacle[] | null } {
    const { obstacles, ...rest } = world;
    if (this.last && sameData(this.last, obstacles)) return { world: rest, obstacles: null };
    this.last = obstacles;
    return { world: rest, obstacles };
  }

  forget(): void {
    this.last = null;
  }
}
export type TerrainRequest = { kind: 'terrain'; terrain: World['terrain'] };
export type WorkerRequest = TurnRequest | PreviewRequest | TerrainRequest;
export type WorkerFailure = { id: number; error: string };
export type PostedTurn = Omit<PreparedTurn, 'world'> & { world: Omit<TurnState, 'obstacles'> };
export type TurnResponse = { id: number; turn: PostedTurn; obstacles: Obstacle[] | null; perf: Record<string, PerfStat> } | WorkerFailure;

export function joinTurn(turn: PostedTurn, obstacles: Obstacle[] | null, before: TurnState): PreparedTurn {
  return { ...turn, world: { ...turn.world, obstacles: obstacles ?? before.obstacles } };
}
export type PreviewResponse = { id: number; preview: PlanFrames; perf: Record<string, PerfStat> } | WorkerFailure;

function freezeTerrain(terrain: World['terrain']): void {
  Object.freeze(terrain.heights);
  Object.freeze(terrain.types);
  Object.freeze(terrain);
}

function requireQuestLanguage(lang: QuestLanguage): void {
  if (!QUEST_LANGUAGES.includes(lang)) throw new Error(`Turn task has no quest language ${lang}`);
}

export function driveSnapshotOf(w: World): DriveSnapshot {
  const drive = buildDrive(w);
  try {
    return captureDrive(drive);
  } finally {
    freeDrive(drive);
  }
}

export function computePreview(task: PreviewTask, terrain: World['terrain']): PlanFrames {
  requireQuestLanguage(task.questLanguage);
  return inQuestLanguage(task.questLanguage, () => previewIn(task, terrain));
}

function previewIn(task: PreviewTask, terrain: World['terrain']): PlanFrames {
  freezeTerrain(terrain);
  const drive = restoreDrive(task.drive);
  const world = { ...task.world, terrain };
  try {
    syncDrive(drive, world);
    return timed('preview', () => planTurns(drive, world, task.meId));
  } finally {
    freeDrive(drive);
  }
}

export function computeRequestedTurn(request: TurnTask, terrain: World['terrain']): PreparedTurn {
  return computeTurn(request, terrain);
}

export function computeTurn(task: TurnTask, terrain: World['terrain']): PreparedTurn {
  return inQuestLanguage(task.questLanguage, () => computeTurnIn(task, terrain));
}

function computeTurnIn(task: TurnTask, terrain: World['terrain']): PreparedTurn {
  requireQuestLanguage(task.questLanguage);
  freezeTerrain(terrain);
  const drive = restoreDrive(task.drive);
  let result: TurnResult | null = null;
  try {
    const world = endTurn({ ...task.world, terrain }, physicsMove(drive, (next) => { result = next; }));
    if (!result) throw new Error('Turn ran without physics');
    const { terrain: _terrain, ...state } = world;
    const { next, ...motion } = result as TurnResult;
    const sight = timed('live-sight', () => liveSightOf(world, motion.frames[world.player.vehicleId]));
    const captured = captureDrive(next);
    return { world: state, result: { ...motion, next: captured }, sight, tail: timed('tail', () => tailOf(next, world, task.tailSteps)) };
  } finally {
    freeDrive(drive);
    if (result) freeDrive((result as TurnResult).next);
  }
}

function tailOf(d: Drive, w: World, steps: number): Tail | null {
  if (w.vehicles.some((v) => isOnRope(w, v.id))) return null;
  syncDrive(d, w);
  const r = simulateSteps(d, w, steps);
  try {
    if (!isCleanTail(w, r)) return null;
    const poses = Object.fromEntries(w.vehicles.filter((v) => r.frames[v.id]).map((v) => [v.id, bodyPose(r.next, v)]));
    return { frames: r.frames, next: captureDrive(r.next), poses };
  } finally {
    freeDrive(r.next);
  }
}

export function isCleanTail(w: World, r: TurnResult): boolean {
  const touched = r.crashes.length + r.breaks.length + r.landings.length + r.tears.length > 0;
  return !touched && !Object.values(r.results).some((res) => res.passed) && !w.vehicles.some((v) => isOnRope(w, v.id));
}

export function withTail<T extends TurnState>(world: T, poses: Record<string, TailPose>): T {
  return { ...world, vehicles: world.vehicles.map((v) => (poses[v.id] ? { ...v, ...poses[v.id] } : v)) };
}

function bodyPose(d: Drive, v: Vehicle): TailPose {
  const s = bodyState(d, v.id);
  return { pos: s.pos, heading: s.heading, speed: Math.max(0, toTilesPerTurn(s.speed)), ...bendField(heldBend(v.chassisId, s.bend)) };
}

export function startTurnWorker(): void {
  let terrain: World['terrain'] | null = null;
  let obstacles: Obstacle[] | null = null;
  const ready = initPhysics();
  self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const request = event.data;
    if (request.kind === 'terrain') {
      terrain = request.terrain;
      return;
    }
    obstacles = request.obstacles ?? obstacles;
    try {
      await ready;
      terrain = request.terrain ?? terrain;
      const task = taskOf(request, obstacles, terrain);
      resetPerf();
      answer(task, task.terrain);
    } catch (error) {
      self.postMessage({ id: request.id, error: describeWorkerError(error) } satisfies WorkerFailure);
    }
  };
}

type Answerable = (TurnTask & { kind: 'turn'; id: number }) | (PreviewTask & { kind: 'preview'; id: number });

function taskOf(request: TurnRequest | PreviewRequest, obstacles: Obstacle[] | null, terrain: World['terrain'] | null): Answerable & { terrain: World['terrain'] } {
  if (!obstacles) throw new Error('Turn worker has no obstacles');
  if (!terrain) throw new Error('Turn worker has no terrain');
  const world = { ...request.world, obstacles };
  if (request.terrain && request.kind === 'turn') warmRoutes({ ...world, terrain }, [...new Set(Object.values(CHASSIS).map((chassis) => chassis.radius))]);
  return { ...request, world, terrain };
}

function answer(request: Answerable, terrain: World['terrain']): void {
  switch (request.kind) {
    case 'turn': {
      const { world: { obstacles, ...world }, ...turn } = computeRequestedTurn(request, terrain);
      const changed = sameData(obstacles, request.world.obstacles) ? null : obstacles;
      self.postMessage({ id: request.id, turn: { ...turn, world }, obstacles: changed, perf: perfSnapshot() } satisfies TurnResponse, {
        transfer: [turn.result.next.snapshot, turn.tail?.next.snapshot].flatMap((s) => (s ? [s.buffer as ArrayBuffer] : [])),
      });
      return;
    }
    case 'preview':
      self.postMessage({ id: request.id, preview: computePreview(request, terrain), perf: perfSnapshot() } satisfies PreviewResponse);
      return;
    default:
      throw new Error(`Unknown worker request kind ${(request as { kind: unknown }).kind}`);
  }
}

function describeWorkerError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}


const EXPLORE_EVERY = 4;
const STOPPED = 0.05;

export function physicsMove(d: Drive, done: (r: TurnResult) => void): (w: World) => void {
  return (w) => {
    syncDrive(d, w);
    const r = simulateTurn(d, w);
    const far = w.vehicles.filter((v) => !r.frames[v.id] && !isOnRope(w, v.id));
    applyTurn(w, r);
    for (const v of far) {
      advanceFar(w, v);
      r.frames[v.id] = trailFrames(w, v, restWheels(v.chassisId));
    }
    exploreAlong(w);
    done(r);
  };
}

export function applyTurn(w: World, r: TurnResult): void {
  applyBreaks(w, r);
  for (const v of w.vehicles) {
    const frames = r.frames[v.id];
    if (frames) applyDriven(w, r, v, frames);
  }
  applyCrashes(w, r);
  applyLandings(w, r);
  for (const t of r.tears) tearLine(w, t.line);
}

function applyCrashes(w: World, r: TurnResult): void {
  for (const c of r.crashes) {
    const a = w.vehicles.find((v) => v.id === c.a);
    if (!a) throw new Error(`Crash with unknown vehicle ${c.a}`);
    if (c.b === GROUND) applyGroundCrash(w, a, c.b, toTilesPerTurn(c.impact), c.contact.a);
    else applyContactCrash(w, a, w.vehicles.find((v) => v.id === c.b) ?? null, c.b, toTilesPerTurn(c.impact), c.contact, c.approach && { a: toTilesPerTurn(c.approach.a), b: toTilesPerTurn(c.approach.b) });
  }
}

function applyLandings(w: World, r: TurnResult): void {
  for (const l of r.landings) {
    const v = w.vehicles.find((x) => x.id === l.vehicle);
    if (!v) throw new Error(`Landing of unknown vehicle ${l.vehicle}`);
    applyLanding(w, v, GROUND, toTilesPerTurn(l.impact));
  }
}

function applyBreaks(w: World, r: TurnResult): void {
  for (const b of r.breaks) breakProp(w, b.prop, b.vehicle, toTilesPerTurn(b.impact));
}

function applyDriven(w: World, r: TurnResult, v: Vehicle, frames: TurnResult['frames'][string]): void {
  if (v.brain) delete v.brain.farRoute;
  const s = bodyState(r.next, v.id);
  const start = poseOf(v);
  Object.assign(v, bodyPose(r.next, v));
  checkBend(v);
  if ((v.strandedTurns ?? 0) >= RULES.stranded.turns) v.strandedTurns = 0;
  const held = heldTurn(w, r, v, s, frames);
  if (held) holdAt(v);
  else releaseHold(v);
  if ((v.strandedTurns ?? 0) >= RULES.stranded.turns) setDown(w, v);
  v.trail = trailOf(start, frames);
  burnFuel(w, v, pathLength(v.trail));
  settleOrder(w, v, r.results[v.id]);
}

function holdAt(v: Vehicle): void {
  v.strandedTurns = (v.strandedTurns ?? 0) + 1;
  v.strandedAt ??= { x: v.pos.x, y: v.pos.y };
}

function releaseHold(v: Vehicle): void {
  v.strandedTurns = 0;
  delete v.strandedAt;
}

function heldTurn(w: World, r: TurnResult, v: Vehicle, s: ReturnType<typeof bodyState>, frames: TurnResult['frames'][string]): boolean {
  const last = frames.at(-1);
  if (!last) throw new Error(`Driven vehicle ${v.id} has no frames`);
  const started = (v.strandedTurns ?? 0) > 0;
  if (started !== (v.strandedAt !== undefined)) throw new Error(`Vehicle ${v.id} has a stranded count without an anchor, or an anchor without a count`);
  if (v.strandedAt && dist(v.pos, v.strandedAt) >= RULES.stranded.reach) return false;
  if (!s.upright || isLifted(r.next, w, v)) return true;
  if (!unmetOrder(v, r.results[v.id])) return false;
  return started || isHung(last) || isPinned(w, v, r.results[v.id]);
}

function unmetOrder(v: Vehicle, res: VehicleResult): boolean {
  return !!v.order && v.order.kind !== 'brake' && !res.arrived && !res.passed;
}

function isHung(last: VehicleFrame): boolean {
  return allWheels(last).some((wheel) => !wheel.ground);
}

function allWheels(f: VehicleFrame): WheelFrame[] {
  return f.rear ? [...f.wheels, ...f.rear.wheels] : f.wheels;
}

function isPinned(w: World, v: Vehicle, res: VehicleResult): boolean {
  if (res.pushedSteps < TURN_STEPS * PHYSICS.driver.pinnedShare) return false;
  return clearanceFor(w, v, []).touches(v.pos, v.heading, v.bend);
}

function settleOrder(w: World, v: Vehicle, res: VehicleResult): void {
  if (!v.order || !orderDone(v.order, res, v.speed < STOPPED)) return;
  if (v.order.kind !== 'brake') w.events.push({ t: 'arrived', vehicle: v.id });
  v.order = null;
}

function orderDone(order: MoveOrder, res: VehicleResult, stopped: boolean): boolean {
  switch (order.kind) {
    case 'through':
      return res.passed;
    case 'stopAt':
      return res.arrived && stopped;
    case 'brake':
      return stopped;
  }
}

function exploreAlong(w: World): void {
  const me = playerVehicle(w);
  for (let i = 0; i < me.trail.length; i += EXPLORE_EVERY) {
    exploreFrom(w, me.trail[i]);
  }
}

export function trailOf(start: Pose, frames: TurnResult['frames'][string]): Pose[] {
  const trail: Pose[] = [start];
  for (let i = 1; i <= RULES.substeps; i++) trail.push(poseAt(start, frames, (i * TURN_STEPS) / RULES.substeps));
  return trail;
}

function poseAt(start: Pose, frames: TurnResult['frames'][string], step: number): Pose {
  const poseOfFrame = (k: number): Pose => {
    if (k === 0) return start;
    const f = frames[k - 1];
    const p = toMap(f.pos);
    return { x: p.x, y: p.y, heading: headingOf(f.rot), ...bendField(frameBend(f)) };
  };
  const lo = Math.min(Math.floor(step), TURN_STEPS);
  const hi = Math.min(lo + 1, TURN_STEPS);
  const t = step - lo;
  const a = poseOfFrame(lo);
  if (t === 0 || hi === lo) return a;
  const b = poseOfFrame(hi);
  const bend = a.bend === undefined || b.bend === undefined ? undefined : lerp(a.bend, b.bend, t);
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), heading: a.heading + angleDiff(a.heading, b.heading) * t, ...bendField(bend) };
}

function pathLength(trail: Pose[]): number {
  let total = 0;
  for (let i = 1; i < trail.length; i++) total += dist(trail[i - 1], trail[i]);
  return total;
}
