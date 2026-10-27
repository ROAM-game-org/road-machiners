import {
  type DriveSnapshot,
  restFrames,
  frameWheels,
  restWheels,
  trailFrames,
  TURN_STEPS,
  type UnitWheels,
  type TurnResult,
} from "../phys/drive";
import type { TurnClock } from "./render/hazards";
import { frameAt, type VehicleFrame } from "../phys/frames";
import { joinTurn, SentObstacles, withTail, type LiveSight, type PreparedTurn, type Tail, type TurnRequest, type TurnResponse } from "../phys/turn";
import { CONFIG, steppedSpeedIndex } from "../config";
import { PHYSICS } from "../data/physics";
import type { QuestLanguage } from "../data/quests";
import { mergePerf } from "../perf";
import { reportError } from "./crash";
import { inCombat } from "../sim/combat";
import { playerVehicle } from "../sim/damage";
import { currentQuestLanguage } from "../sim/quests";
import type { GameEvent, Vehicle, World } from "../sim/types";
import { dist, type Vec } from "../sim/vec";
import { isOnRope, isTowed } from "../sim/tow";
import { playerSees } from "../sim/vision";
import { autoRuns, playerCanAct, threatToPlayer, waitsOnPlayer } from "../sim/world";
import { WorkerLoad, workerFailure } from "./worker-load";
import { HostileSighting } from "./hostile-sighting";

export type LiveVision = {
  visible: Set<number>;
  explored: Uint8Array;
  sight: LiveSight;
  shown: number;
};

export function nextSightSample(live: LiveVision, step: number): number | null {
  let k = live.shown;
  while (k + 1 < live.sight.steps.length && live.sight.steps[k + 1] <= step) k++;
  if (k === live.shown) return null;
  for (let i = live.shown + 1; i <= k; i++) for (const t of live.sight.tiles[i]) live.explored[t] = 1;
  live.shown = k;
  live.visible = new Set(live.sight.tiles[k]);
  return k;
}

const STEP_MS = 1000 / PHYSICS.stepsPerSecond;
const END_SLACK_MS = 1e-6;
export const MOVE_MS = TURN_STEPS * STEP_MS;

export function lightTurnOf(world: World, a: Playback | null): number {
  return a ? world.turn - 1 + Math.min(1, a.elapsed / MOVE_MS) : world.turn;
}

export function turnClockOf(a: Playback | null): TurnClock | null {
  return a ? { before: a.before, progress: Math.min(1, a.elapsed / MOVE_MS), moved: a.moved, hookedLines: a.hookedLines } : null;
}

type Pose = { pos: Vec; heading: number };
type OpenStop = { tail: Tail; ends: Record<string, Pose> };

export class Creep {
  private readonly endMs: number;
  private ms: number;
  private readonly shown = new Map<string, { ms: number; frame: VehicleFrame }>();

  constructor(private readonly tail: Tail, private readonly starts: Record<string, VehicleFrame>, overshootMs: number) {
    if (!(overshootMs >= 0)) throw new Error(`A slowdown starts at or after the turn end, got ${overshootMs} ms`);
    this.ms = overshootMs;
    this.endMs = Math.max(0, ...Object.values(tail.frames).map((fs) => fs.length)) * STEP_MS;
  }

  commit(world: World, ends: Record<string, Pose> | null): { world: World; drive: DriveSnapshot } {
    const poses = ends ? Object.fromEntries(Object.entries(this.tail.poses).filter(([id]) => this.atEnd(world, id, ends[id]))) : this.tail.poses;
    return { world: withTail(world, poses), drive: this.tail.next };
  }

  private atEnd(world: World, id: string, end: Pose | undefined): boolean {
    const v = world.vehicles.find((w) => w.id === id);
    return !!v && !!end && v.pos.x === end.pos.x && v.pos.y === end.pos.y && v.heading === end.heading;
  }

  endDrive(): DriveSnapshot {
    return this.tail.next;
  }

  tick(ms: number): void {
    if (!(ms >= 0)) throw new Error(`A slowdown only moves forward, got ${ms} ms`);
    this.ms += ms;
  }

  frameOf(v: Vehicle): VehicleFrame | undefined {
    const end = this.tail.poses[v.id];
    if (!end || end.pos.x !== v.pos.x || end.pos.y !== v.pos.y || end.heading !== v.heading) return undefined;
    return this.frameAtMs(v.id, this.shownMs());
  }

  private frameAtMs(id: string, ms: number): VehicleFrame | undefined {
    const kept = this.shown.get(id);
    if (kept?.ms === ms) return kept.frame;
    const frame = frameAt(this.tail.frames[id], ms / STEP_MS - 1, this.starts[id]);
    if (frame) this.shown.set(id, { ms, frame });
    return frame;
  }

  isMoving(): boolean {
    return !this.reachedEnd();
  }

  joinOf(world: World, shown: Record<string, VehicleFrame>): { starts: Record<string, VehicleFrame>; elapsed: number } {
    if (!this.reachedEnd()) return { starts: { ...shown }, elapsed: 0 };
    const ends = world.vehicles.flatMap((v) => (this.frameOf(v) ? [[v.id, this.tail.frames[v.id].at(-1)!] as const] : []));
    return { starts: { ...shown, ...Object.fromEntries(ends) }, elapsed: Math.max(0, this.ms - this.endMs) };
  }

  leftMs(): number {
    return Math.max(0, this.endMs - this.ms);
  }

  private reachedEnd(): boolean {
    return this.ms >= this.endMs - END_SLACK_MS;
  }

  private shownMs(): number {
    return Math.min(this.ms, this.endMs);
  }
}

export type Playback = {
  result: PreparedTurn["result"];
  tail: Tail | null;
  starts: Record<string, VehicleFrame>;
  before: World;
  elapsed: number;
  moved: boolean;
  impacts: boolean;
  combat: boolean;
  volley: boolean;
  impactAtMs: number;
  shotAims: Map<string, string>;
  hookedLines: Set<string>;
};

function stopsVehicle(event: GameEvent, id: string): boolean {
  switch (event.t) {
    case "knockout":
    case "death":
      return true;
    case "breakdown":
    case "partDisabled":
    case "destroyed":
      return event.vehicle === id;
    default:
      return false;
  }
}

function crashedIntoTruck(event: Extract<GameEvent, { t: "collision" }>, id: string, world: World): boolean {
  const other = event.a === id ? event.b : event.b === id ? event.a : null;
  return other !== null && world.vehicles.some((v) => v.id === other);
}

function entersTheLight(event: GameEvent): boolean {
  return event.t === "info" && (event.note.id === "hazard" || event.note.id === "core");
}

function interruptsTravel(event: GameEvent, id: string, world: World): boolean {
  switch (event.t) {
    case "collision":
      return crashedIntoTruck(event, id, world);
    case "shot":
      return [event.shooter, event.target].includes(id);
    case "info":
      return entersTheLight(event);
    default:
      return stopsVehicle(event, id);
  }
}

export function overshoots(world: World, next: Pick<World, "events" | "vehicles">): boolean {
  const me = playerVehicle(world);
  if (me.order?.kind !== "through") return false;
  const passed = next.events.some((e) => e.t === "arrived" && e.vehicle === me.id);
  const after = next.vehicles.find((v) => v.id === me.id);
  if (!passed || !after) return false;
  return dist(after.pos, me.order.dest) > dist(me.pos, me.order.dest);
}

const threats = new WeakMap<World, Vehicle[]>();

export function threatsIn(world: World): Vehicle[] {
  const known = threats.get(world);
  if (known) return known;
  const found = world.vehicles.filter((v) => threatToPlayer(world, v));
  threats.set(world, found);
  return found;
}

export function addRopeFrames(before: World, after: World, frames: TurnResult["frames"], shown: Record<string, VehicleFrame>): void {
  for (const v of after.vehicles) {
    if (!isOnRope(after, v.id) && (frames[v.id] || !isOnRope(before, v.id))) continue;
    frames[v.id] = v.trail.length < 2 ? restFrames(after, v) : trailFrames(after, v, startWheels(v, shown));
  }
}

function startWheels(v: Vehicle, shown: Record<string, VehicleFrame>): UnitWheels {
  const frame = shown[v.id];
  return frame && Boolean(frame.rear) === (restWheels(v.chassisId).rear !== null) ? frameWheels(frame) : restWheels(v.chassisId);
}

function farContactsOf(world: World): string[] {
  return world.player.contacts.filter((c) => c.sources.includes("far")).map((c) => c.vehicleId);
}

export function trucksInSightOf(world: World): string[] {
  return world.vehicles.filter((v) => v.id !== world.player.vehicleId && playerSees(world, v.pos)).map((v) => v.id);
}

export function canTravel(world: World): boolean {
  const me = playerVehicle(world);
  if (!playerCanAct(world) || me.direct) return false;
  if (inCombat(world, me)) return false;
  return !world.events.some((event) => interruptsTravel(event, me.id, world));
}

export class Travel {
  private automatic = false;
  private speedIndex = 0;
  private pressedAt: number | null = null;
  private requested = false;
  private autoHalted = false;
  private autoPress = false;
  private tapHalts = false;
  private remainder = 0;
  private readonly turns: TurnPreparation;
  private creep: Creep | null = null;
  private open: OpenStop | null = null;
  private readonly farSighting = new HostileSighting();

  constructor(private readonly holdMs: number, tailSteps: number) {
    this.turns = new TurnPreparation(tailSteps);
  }

  pause(): void {
    this.automatic = false;
    this.requested = false;
    this.dropPress();
  }

  press(now: number, playing: boolean, followWaypoint: boolean): boolean {
    if (this.pressedAt !== null) return false;
    this.pressedAt = now;
    const step = !this.automatic && !playing;
    this.automatic = step && followWaypoint;
    this.requested = false;
    return step;
  }

  pressTurn(playing: boolean, world: World): boolean {
    if (autoRuns(world)) {
      if (this.pressedAt !== null) return false;
      this.tapHalts = !this.autoHalted;
      this.autoHalted = false;
      this.autoPress = true;
      this.pressedAt = performance.now();
      return false;
    }
    const order = playerVehicle(world).order;
    const follow = canTravel(world) && order !== null && order.kind !== "brake";
    return this.press(performance.now(), playing, follow);
  }

  autoAllowed(world: World): boolean {
    if (!autoRuns(world)) this.autoHalted = false;
    return autoRuns(world) && !this.autoHalted;
  }

  isAuto(world: World): boolean {
    return this.automatic || (autoRuns(world) && !this.autoHalted);
  }

  stopAuto(world: World): boolean {
    if (!this.isAuto(world)) return false;
    if (autoRuns(world)) this.autoHalted = true;
    this.pause();
    return true;
  }

  abandon(world: World): void {
    this.stopAuto(world);
    this.pause();
  }

  release(now = performance.now()): void {
    if (this.autoPress && this.tapHalts && !this.isFast(now)) this.autoHalted = true;
    this.dropPress();
  }

  private dropPress(): void {
    this.pressedAt = null;
    this.autoPress = false;
    this.tapHalts = false;
  }

  private deciding(now: number): boolean {
    return this.autoPress && this.tapHalts && this.pressedAt !== null && !this.isFast(now);
  }

  isFast(now: number): boolean {
    return this.pressedAt !== null && now - this.pressedAt >= this.holdMs;
  }

  update(safe: boolean, hasWaypoint: boolean): void {
    if (!safe || !hasWaypoint) this.automatic = false;
  }

  updateWorld(world: World, sighted: boolean): void {
    if (!autoRuns(world) && (this.autoPress || world.events.some(entersTheLight))) this.dropPress();
    const order = playerVehicle(world).order;
    this.update(this.travelsOn(world, sighted), order !== null && order.kind !== "brake");
  }

  private travelsOn(world: World, sighted: boolean): boolean {
    const spotted = this.farSighting.observe(world.turn, farContactsOf(world), trucksInSightOf(world)).sighted && this.fastTravel();
    return canTravel(world) && !sighted && !spotted;
  }

  shouldAdvance(now: number): boolean {
    return this.automatic || this.isFast(now);
  }
  isPlaying(playback: Playback | null): boolean {
    return playback !== null || this.requested;
  }
  isAdvancing(playback: Playback | null, now: number): boolean {
    return this.isPlaying(playback) || this.shouldAdvance(now);
  }

  warm(world: World, drive: DriveSnapshot): Promise<void> {
    return this.turns.warm(world, drive);
  }

  request(world: World, drive: DriveSnapshot): void {
    this.requested = true;
    this.turns.prepare(world, drive, false);
  }

  private fastTravel(): boolean {
    return this.automatic && CONFIG.travelSpeeds[this.speedIndex] > 1;
  }

  private runsOnItsOwn(world: World, now: number): boolean {
    return this.autoAllowed(world) && !this.deciding(now);
  }

  private wantsTurn(world: World, now: number): boolean {
    return !waitsOnPlayer(world) && (this.isAdvancing(null, now) || this.runsOnItsOwn(world, now));
  }

  takeReady(world: World, drive: DriveSnapshot, now: number, held = false): PreparedTurn | null {
    if (world.player.state === "dead" || waitsOnPlayer(world)) {
      this.pause();
      return null;
    }
    if (held || this.deciding(now) || !this.wantsTurn(world, now)) return null;
    this.turns.prepare(world, drive, this.fastTravel());
    return this.creep?.isMoving() ? null : this.takePrepared(world);
  }

  private takePrepared(world: World): PreparedTurn | null {
    const prepared = this.turns.take(world);
    if (!prepared) return null;
    if (this.requested) {
      this.requested = false;
      return prepared;
    }
    if (!overshoots(world, prepared.world)) return prepared;
    this.pause();
    return null;
  }

  continues(world: World, now: number): boolean {
    return !waitsOnPlayer(world) && (this.shouldAdvance(now) || this.runsOnItsOwn(world, now));
  }

  stopAt(playback: Playback, world: World, shown: Record<string, VehicleFrame>, now: number, overshootMs: number): { world: World; drive: DriveSnapshot; leftMs: number } | null {
    const stops = playback.tail !== null && !this.continues(world, now);
    this.open = playback.tail !== null && !stops ? { tail: playback.tail, ends: endPoses(world) } : null;
    this.creep = stops ? new Creep(playback.tail!, { ...shown }, overshootMs) : null;
    return this.creep ? { ...this.creep.commit(world, null), leftMs: this.creep.leftMs() } : null;
  }

  settleStop(world: World, shown: Record<string, VehicleFrame>, now: number): { world: World; drive: DriveSnapshot; leftMs: number } | null {
    const open = this.open;
    if (!open || this.continues(world, now)) return null;
    this.open = null;
    this.creep = new Creep(open.tail, { ...shown }, 0);
    return { ...this.creep.commit(world, open.ends), leftMs: this.creep.leftMs() };
  }

  tickCreep(ms: number): void {
    this.creep?.tick(ms);
  }

  timeWanted(world: World, now: number): boolean {
    return this.open !== null || (this.isAdvancing(null, now) && this.turns.isReady(world) && !waitsOnPlayer(world));
  }

  playedFrame(v: Vehicle, a: Playback | null, at: number | null): VehicleFrame | undefined {
    if (a && at !== null) return frameAt(a.result.frames[v.id], at, a.starts[v.id]);
    return this.creep?.frameOf(v);
  }

  isCreeping(): boolean {
    return this.creep?.isMoving() ?? false;
  }

  prepareNext(world: World, playback: Playback | null, now: number): void {
    if (playback && this.continues(world, now))
      this.turns.prepare(world, this.creep?.endDrive() ?? playback.result.next, this.fastTravel());
  }

  beginPlayback(
    before: World,
    prepared: PreparedTurn,
    elapsed: number,
    shown: Record<string, VehicleFrame>,
  ): { world: World; playback: Playback; towed: boolean } {
    if (waitsOnPlayer(before)) throw new Error(`A turn began while the game waits on the player: ${waitReason(before)}`);
    const world = { ...prepared.world, terrain: before.terrain };
    const join = this.endCreep(before, shown, elapsed);
    addRopeFrames(before, world, prepared.result.frames, join.starts);
    if (playerCanAct(before) && !playerCanAct(world)) this.pause();
    else if (!playerCanAct(world)) {
      this.automatic = false;
      this.requested = false;
    }
    const towed = isTowed(before) || isTowed(world);
    const playback: Playback = {
      result: prepared.result,
      tail: prepared.tail,
      starts: join.starts,
      before,
      elapsed: join.elapsed,
      moved: false,
      impacts: false,
      combat: false,
      volley: false,
      impactAtMs: 0,
      shotAims: new Map(),
      hookedLines: new Set(),
    };
    return { world, playback, towed };
  }

  private endCreep(before: World, shown: Record<string, VehicleFrame>, elapsed: number): { starts: Record<string, VehicleFrame>; elapsed: number } {
    const join = this.creep?.joinOf(before, shown) ?? { starts: { ...shown }, elapsed };
    this.creep = null;
    this.open = null;
    return join;
  }

  getSpeed(now: number, fastSpeed: number): number {
    const picked = CONFIG.travelSpeeds[this.speedIndex];
    if (this.isFast(now)) return Math.min(Math.max(fastSpeed, picked), this.turns.keptSpeed());
    return this.automatic ? Math.min(picked, this.turns.keptSpeed()) : 1;
  }

  getSpeedIndex(): number {
    return this.speedIndex;
  }

  setSpeedIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= CONFIG.travelSpeeds.length) throw new Error(`No travel speed at index ${index}`);
    this.speedIndex = index;
  }

  stepSpeed(delta: 1 | -1): void {
    this.speedIndex = steppedSpeedIndex(this.speedIndex, delta);
  }

  finishClock(elapsed: number, finishAt: number): void {
    this.remainder = elapsed - finishAt;
  }
  getRemainder(wasPlaying: boolean): number {
    return wasPlaying ? this.remainder : 0;
  }
}

function workerErrorHead(workerStack: string): { name: string | null; message: string } {
  const head = workerStack.split("\n")[0];
  const named = /^(\w*Error): (.*)$/.exec(head);
  return named ? { name: named[1], message: named[2] } : { name: null, message: head };
}

export function workerError(workerStack: string): Error {
  const { name, message } = workerErrorHead(workerStack);
  const error = new Error(message);
  if (name) error.name = name;
  error.stack = workerStack;
  return error;
}

function endPoses(world: World): Record<string, Pose> {
  return Object.fromEntries(world.vehicles.map((v) => [v.id, { pos: v.pos, heading: v.heading }]));
}

export class TurnFailure extends Error {
  constructor(workerStack: string, readonly drive: DriveSnapshot) {
    const { name, message } = workerErrorHead(workerStack);
    super(message);
    if (name) this.name = name;
    this.stack = workerStack;
  }
}

export class TurnPreparation {
  private readonly load = new WorkerLoad("turn worker");
  private worker: Worker | null = null;
  private terrain: World["terrain"] | null = null;
  private readonly obstacles = new SentObstacles();
  private serial = 0;
  private warmId = 0;
  private warmed: (() => void) | null = null;
  private prepMs: number | null = null;
  private pending: {
    id: number;
    before: World;
    lang: QuestLanguage;
    drive: DriveSnapshot;
    fastTravel: boolean;
    postedAt: number;
    ready: PreparedTurn | null;
    failure: string | null;
  } | null = null;

  constructor(private readonly tailSteps: number) {}

  private createWorker(): Worker {
    const worker = new Worker(new URL("../phys/turn-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<TurnResponse>) => {
      this.load.loaded();
      const response = event.data;
      if (response.id === this.warmId) this.settleWarm();
      if ("error" in response) return this.fail(response.id, response.error);
      mergePerf(response.id === this.warmId ? { "turn-warm": response.perf.turn } : response.perf);
      if (this.pending?.id !== response.id) return;
      this.pending.ready = joinTurn(response.turn, response.obstacles, this.pending.before);
      this.notePrep(performance.now() - this.pending.postedAt);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      if (worker !== this.worker) return;
      this.settleWarm();
      if (this.load.failed(event, () => this.restart())) return this.dropWorker();
      this.fail(null, workerFailure("Turn worker", event));
    };
    worker.onmessageerror = () => this.fail(null, "Could not read turn worker response");
    return worker;
  }

  private dropWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.terrain = null;
    this.obstacles.forget();
  }

  private restart(): void {
    const pending = this.pending;
    if (!pending || pending.ready || pending.failure) return;
    pending.id = this.post(pending.before, pending.drive, pending.fastTravel);
  }

  private fail(id: number | null, message: string): void {
    if (this.pending && (id === null || this.pending.id === id)) this.pending.failure = message;
    else reportError(new Error(message));
  }

  warm(world: World, drive: DriveSnapshot): Promise<void> {
    if (world.player.call || world.player.state === "dead" || this.load.gaveUp || this.load.waiting) return Promise.resolve();
    this.warmId = this.post(world, drive, false);
    return new Promise((resolve) => (this.warmed = resolve));
  }

  private settleWarm(): void {
    this.warmed?.();
    this.warmed = null;
  }

  private isFresh(world: World): boolean {
    return this.pending?.before === world && this.pending.lang === currentQuestLanguage();
  }

  prepare(world: World, saved: DriveSnapshot, fastTravel: boolean): void {
    if (this.isFresh(world) && this.pending?.fastTravel === fastTravel) return;
    this.pending = { id: this.post(world, saved, fastTravel), before: world, lang: currentQuestLanguage(), drive: saved, fastTravel, postedAt: performance.now(), ready: null, failure: null };
  }

  private notePrep(ms: number): void {
    this.prepMs = this.prepMs === null ? ms : this.prepMs + (ms - this.prepMs) * CONFIG.turnPrepSmoothing;
  }

  keptSpeed(): number {
    return this.prepMs === null ? Infinity : Math.max(1, MOVE_MS / this.prepMs);
  }

  private post(world: World, saved: DriveSnapshot, fastTravel: boolean): number {
    const { terrain, ...state } = world;
    const id = ++this.serial;
    if (this.load.gaveUp || this.load.waiting) return id;
    this.worker ??= this.createWorker();
    const snapshot = saved.snapshot.slice();
    this.worker.postMessage(
      {
        kind: "turn",
        id,
        questLanguage: currentQuestLanguage(),
        tailSteps: this.tailSteps,
        fastTravel,
        ...this.obstacles.split(state),
        drive: { ...saved, snapshot },
        terrain: this.terrain === terrain ? null : terrain,
      } satisfies TurnRequest,
      [snapshot.buffer],
    );
    this.terrain = terrain;
    return id;
  }

  isReady(world: World): boolean {
    return this.isFresh(world) && !!this.pending?.ready;
  }

  take(world: World): PreparedTurn | null {
    const pending = this.pending;
    if (!pending || !this.isFresh(world)) return null;
    if (pending.failure) {
      this.pending = null;
      throw new TurnFailure(pending.failure, pending.drive);
    }
    if (!pending.ready) return null;
    this.pending = null;
    return pending.ready;
  }
}

function waitReason(world: World): string {
  const live = world.player.quests.live;
  return live ? `scene:${live.quest}` : "radio-call";
}
