import type { TimedRecord } from "../sim/timed-combat";
import type { Vehicle, World } from "../sim/types";
import { cloneForTurn, closeTurn, openTurn, type OpenedTurn } from "../sim/world";
import { captureDrive, freeDrive, restoreDrive, type Drive, type DriveSnapshot, type PhysicsRun, type Stick } from "./drive";
import type { VehicleFrame } from "./frames";
import type { QuestLanguage } from "../data/quests";
import { inQuestLanguage } from "../sim/quests";
import type { Obstacle } from "../sim/types";
import { diffObstacles, landPhysics, startPhysics, type ObstacleSync, type PostedTurn, type PreparedTurn, type TurnState } from "./turn";

export type LivePatch = { keys: Partial<World>; vehicles: Record<string, Partial<Vehicle>> };
export type LiveStepped = { frames: Record<string, VehicleFrame>; records: TimedRecord[]; destroyed: string[]; closed: PreparedTurn | null; open: boolean };

type OpenSecond = { draft: World; opened: OpenedTurn; drive: Drive; run: PhysicsRun; recordsSeen: number; destroyedSeen: Set<string> };

export const LIVE_POSE_FIELDS = ["pos", "heading", "speed", "bend", "trail"] as const;

export class LiveSecond {
  private open: OpenSecond | null = null;
  private stick: Stick = { throttle: 0, steer: 0 };

  begin(world: World, drive: DriveSnapshot): void {
    this.stop();
    this.open = this.openFrom(world, restoreDrive(drive));
  }

  obstacles(): readonly Obstacle[] {
    return this.open?.draft.obstacles ?? [];
  }

  stop(): void {
    if (!this.open) return;
    freeSecond(this.open);
    this.open = null;
  }

  patch(patch: LivePatch): void {
    const draft = this.open?.draft;
    if (!draft) return;
    Object.assign(draft, patch.keys);
    for (const [id, fields] of Object.entries(patch.vehicles)) {
      const v = draft.vehicles.find((x) => x.id === id);
      if (v) Object.assign(v, fields);
    }
  }

  step(steps: number, stick: Stick): LiveStepped {
    this.stick = stick;
    let closed: PreparedTurn | null = null;
    const frames: Record<string, VehicleFrame> = {};
    const records: TimedRecord[] = [];
    const destroyed: string[] = [];
    for (let i = 0; i < steps && this.open && !closed; i++) {
      const current = this.open;
      current.run.step();
      this.collect(current, records, destroyed);
      if (!current.run.isDone()) continue;
      Object.assign(frames, lastFrames(current));
      closed = this.close(current);
    }
    if (this.open) Object.assign(frames, lastFrames(this.open));
    return { frames, records, destroyed, closed, open: this.open !== null };
  }

  private collect(second: OpenSecond, records: TimedRecord[], destroyed: string[]): void {
    const combat = second.draft.combat;
    if (combat.records.length > second.recordsSeen) {
      records.push(...combat.records.slice(second.recordsSeen));
      second.recordsSeen = combat.records.length;
    }
    for (const id of Object.keys(combat.destroyedAt)) {
      if (second.destroyedSeen.has(id)) continue;
      second.destroyedSeen.add(id);
      destroyed.push(id);
    }
  }

  private close(second: OpenSecond): PreparedTurn {
    const played = landPhysics(second.draft, second.run);
    closeTurn(second.draft, second.opened);
    second.run.events.free();
    freeDrive(second.drive);
    const { terrain: _terrain, ...state } = second.draft;
    const { next, sight, ...motion } = played;
    const closed = { world: state, result: { ...motion, next: captureDrive(next) }, sight, tail: null };
    this.open = null;
    if (canOpen(second.draft)) this.open = this.openFrom(second.draft, next);
    else freeDrive(next);
    return closed;
  }

  private openFrom(world: World, drive: Drive): OpenSecond {
    const draft = cloneForTurn(world);
    const opened = openTurn(draft);
    const playerId = world.player.vehicleId;
    const run = startPhysics(drive, draft, (id) => (id === playerId ? this.stick : null));
    return { draft, opened, drive, run, recordsSeen: 0, destroyedSeen: new Set() };
  }
}

function canOpen(w: World): boolean {
  return w.player.state !== "dead" && !w.player.call && !w.player.quests.live;
}

function lastFrames(second: OpenSecond): Record<string, VehicleFrame> {
  return Object.fromEntries(Object.entries(second.run.frames).flatMap(([id, fs]) => (fs.length ? [[id, fs[fs.length - 1]]] : [])));
}

function freeSecond(second: OpenSecond): void {
  second.run.events.free();
  second.run.world.free();
  freeDrive(second.drive);
}

export type LiveOpenRequest = { kind: "live-open"; world: Omit<TurnState, "obstacles">; obstacles: Obstacle[]; drive: DriveSnapshot; questLanguage: QuestLanguage };
export type LiveStepRequest = { kind: "live-step"; steps: number; stick: Stick; questLanguage: QuestLanguage };
export type LivePatchRequest = { kind: "live-patch"; patch: LivePatch };
export type LiveStopRequest = { kind: "live-stop" };
export type LiveRequest = LiveOpenRequest | LiveStepRequest | LivePatchRequest | LiveStopRequest;
export type LiveClosed = { turn: PostedTurn; obstacles: ObstacleSync };
export type LiveFrames = { live: true; frames: Record<string, VehicleFrame>; records: TimedRecord[]; destroyed: string[]; open: boolean; closed: LiveClosed | null };
export type LiveResponse = LiveFrames | { live: true; error: string };

export function isLiveRequest(request: { kind: string }): request is LiveRequest {
  return request.kind.startsWith("live-");
}

export class LiveWorker {
  private readonly second = new LiveSecond();
  private startObstacles: readonly Obstacle[] = [];

  answer(request: LiveRequest, terrain: World["terrain"] | null): LiveFrames | null {
    switch (request.kind) {
      case "live-open": {
        if (!terrain) throw new Error("Live mode needs the worker's terrain");
        const world = { ...request.world, obstacles: request.obstacles, terrain } as World;
        inQuestLanguage(request.questLanguage, () => this.second.begin(world, request.drive));
        this.startObstacles = this.second.obstacles();
        return null;
      }
      case "live-step":
        return inQuestLanguage(request.questLanguage, () => this.stepped(this.second.step(request.steps, request.stick)));
      case "live-patch":
        this.second.patch(request.patch);
        return null;
      case "live-stop":
        this.second.stop();
        return null;
    }
  }

  private stepped(r: LiveStepped): LiveFrames {
    if (!r.closed) return { live: true, ...r, closed: null };
    const { obstacles, ...world } = r.closed.world;
    const sync = diffObstacles(this.startObstacles, obstacles);
    this.startObstacles = this.second.obstacles();
    return { live: true, ...r, closed: { turn: { ...r.closed, world }, obstacles: sync } };
  }
}
