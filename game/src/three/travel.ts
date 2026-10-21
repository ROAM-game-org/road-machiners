import {
  captureDrive,
  restoreDrive,
  type DriveSnapshot,
  restFrames,
  frameWheels,
  restWheels,
  trailFrames,
  type UnitWheels,
  type Drive,
  type TurnResult,
} from "../phys/drive";
import type { VehicleFrame } from "../phys/frames";
import { SentObstacles, type LiveSight, type PreparedTurn, type TurnRequest, type TurnResponse } from "../phys/turn";
import type { QuestLanguage } from "../data/quests";
import { mergePerf } from "../perf";
import { reportError } from "./crash";
import { inCombat } from "../sim/combat";
import { playerVehicle } from "../sim/damage";
import { currentQuestLanguage } from "../sim/quests";
import type { GameEvent, Vehicle, World } from "../sim/types";
import { dist } from "../sim/vec";
import { isOnRope, isTowed } from "../sim/tow";
import { autoRuns, playerCanAct } from "../sim/world";
import { WorkerLoad, workerFailure } from "./worker-load";

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

export type Playback = {
  result: TurnResult;
  nextSnapshot: DriveSnapshot;
  before: World;
  lastTick: number | null;
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

export function canTravel(world: World): boolean {
  const me = playerVehicle(world);
  if (!playerCanAct(world) || me.direct) return false;
  if (inCombat(world, me)) return false;
  return !world.events.some((event) => interruptsTravel(event, me.id, world));
}

export class Travel {
  private automatic = false;
  private pressedAt: number | null = null;
  private requested = false;
  private autoHalted = false;
  private autoPress = false;
  private tapHalts = false;
  private remainder = 0;
  private readonly turns = new TurnPreparation();

  constructor(private readonly holdMs: number) {}

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
    this.update(
      canTravel(world) && !sighted,
      order !== null && order.kind !== "brake",
    );
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

  warm(world: World, drive: Drive): void {
    this.turns.warm(world, drive);
  }

  request(world: World, drive: Drive): void {
    this.requested = true;
    this.turns.prepare(world, drive);
  }

  private runsOnItsOwn(world: World, now: number): boolean {
    return this.autoAllowed(world) && !this.deciding(now);
  }

  private wantsTurn(world: World, now: number): boolean {
    return this.isAdvancing(null, now) || this.runsOnItsOwn(world, now);
  }

  takeReady(world: World, drive: Drive, now: number, held = false): PreparedTurn | null {
    if (world.player.state === "dead") {
      this.pause();
      return null;
    }
    if (held || this.deciding(now) || !this.wantsTurn(world, now)) return null;
    this.turns.prepare(world, drive);
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

  prepareNext(world: World, playback: Playback | null, now: number): void {
    if (playback && (this.shouldAdvance(now) || this.runsOnItsOwn(world, now)))
      this.turns.prepareFrom(world, playback.nextSnapshot);
  }

  beginPlayback(
    before: World,
    prepared: PreparedTurn,
    now: number,
    elapsed: number,
    shown: Record<string, VehicleFrame>,
  ): { world: World; playback: Playback; towed: boolean } {
    const world = { ...prepared.world, terrain: before.terrain };
    addRopeFrames(before, world, prepared.result.frames, shown);
    const nextSnapshot = prepared.result.next;
    const result: TurnResult = { ...prepared.result, next: restoreDrive(nextSnapshot) };
    if (playerCanAct(before) && !playerCanAct(world)) this.pause();
    else if (!playerCanAct(world)) {
      this.automatic = false;
      this.requested = false;
    }
    const towed = isTowed(before) || isTowed(world);
    const playback: Playback = {
      result,
      nextSnapshot,
      before,
      lastTick: now,
      elapsed,
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

  getSpeed(now: number, fastSpeed: number): number {
    return this.isFast(now) ? fastSpeed : 1;
  }

  advanceClock(playback: Playback, now: number, speed: number, maxFrameMs: number): number {
    if (playback.lastTick !== null)
      playback.elapsed += Math.min(now - playback.lastTick, maxFrameMs) * speed;
    playback.lastTick = now;
    return playback.elapsed;
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
  private pending: {
    id: number;
    before: World;
    lang: QuestLanguage;
    drive: DriveSnapshot;
    ready: PreparedTurn | null;
    failure: string | null;
  } | null = null;

  private createWorker(): Worker {
    const worker = new Worker(new URL("../phys/turn-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<TurnResponse>) => {
      this.load.loaded();
      const response = event.data;
      if ("error" in response) return this.fail(response.id, response.error);
      mergePerf(response.id === this.warmId ? { "turn-warm": response.perf.turn } : response.perf);
      if (this.pending?.id === response.id) this.pending.ready = response.turn;
    };
    worker.onerror = (event) => {
      event.preventDefault();
      if (worker !== this.worker) return;
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
    pending.id = this.post(pending.before, { ...pending.drive, snapshot: pending.drive.snapshot.slice() });
  }

  private fail(id: number | null, message: string): void {
    if (this.pending && (id === null || this.pending.id === id)) this.pending.failure = message;
    else reportError(new Error(message));
  }

  warm(world: World, drive: Drive): void {
    if (world.player.call || world.player.state === "dead") return;
    this.warmId = this.post(world, captureDrive(drive));
  }

  private isFresh(world: World): boolean {
    return this.pending?.before === world && this.pending.lang === currentQuestLanguage();
  }

  prepare(world: World, drive: Drive): void {
    if (!this.isFresh(world)) this.prepareFrom(world, captureDrive(drive));
  }

  prepareFrom(world: World, saved: DriveSnapshot): void {
    if (this.isFresh(world)) return;
    const copy = { ...saved, snapshot: saved.snapshot.slice() };
    this.pending = { id: this.post(world, copy), before: world, lang: currentQuestLanguage(), drive: saved, ready: null, failure: null };
  }

  private post(world: World, saved: DriveSnapshot): number {
    const { terrain, ...state } = world;
    const id = ++this.serial;
    if (this.load.gaveUp || this.load.waiting) return id;
    this.worker ??= this.createWorker();
    this.worker.postMessage(
      {
        kind: "turn",
        id,
        questLanguage: currentQuestLanguage(),
        ...this.obstacles.split(state),
        drive: saved,
        terrain: this.terrain === terrain ? null : terrain,
      } satisfies TurnRequest,
      [saved.snapshot.buffer as ArrayBuffer],
    );
    this.terrain = terrain;
    return id;
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
