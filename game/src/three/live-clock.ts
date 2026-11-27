import { PHYSICS } from "../data/physics";
import type { DriveSnapshot, Stick } from "../phys/drive";
import type { VehicleFrame } from "../phys/frames";
import { LIVE_POSE_FIELDS, type LiveClosed, type LivePatch, type LiveResponse } from "../phys/live-second";
import { currentQuestLanguage } from "../sim/quests";
import type { TimedRecord } from "../sim/timed-combat";
import type { Vehicle, World } from "../sim/types";
import type { TurnPreparation } from "./travel";

const MAX_STEPS_PER_POST = 8;
const STEP_MS = 1000 / PHYSICS.stepsPerSecond;
const UNPATCHED_KEYS = new Set(["terrain", "obstacles", "vehicles", "events", "removed", "combat", "turn"]);

export type LiveNews = { records: TimedRecord[]; destroyed: string[]; closed: LiveClosed[] };

export class LiveClock {
  private running = false;
  private inFlight = false;
  private owedMs = 0;
  private frames: Record<string, VehicleFrame> = {};
  private news: LiveNews = { records: [], destroyed: [], closed: [] };
  private failure: string | null = null;

  constructor(private readonly channel: TurnPreparation) {
    channel.onLive = (response) => this.receive(response);
  }

  isRunning(): boolean {
    return this.running;
  }

  start(world: World, drive: DriveSnapshot): void {
    this.reset();
    this.channel.postLive(this.channel.liveOpenRequest(world, drive));
    this.running = true;
  }

  stop(): void {
    if (this.running) this.channel.postLive({ kind: "live-stop" });
    this.running = false;
    this.reset();
  }

  frameOf(id: string): VehicleFrame | undefined {
    return this.running ? this.frames[id] : undefined;
  }

  tick(playMs: number, stick: Stick): void {
    if (!this.running) return;
    this.owedMs = Math.min(this.owedMs + playMs, MAX_STEPS_PER_POST * STEP_MS);
    if (this.inFlight || this.owedMs < STEP_MS) return;
    const steps = Math.floor(this.owedMs / STEP_MS);
    this.owedMs -= steps * STEP_MS;
    this.inFlight = true;
    this.channel.postLive({ kind: "live-step", steps, stick, questLanguage: currentQuestLanguage() });
  }

  patch(before: World, after: World): void {
    if (!this.running || before === after) return;
    const patch = patchOf(before, after);
    if (Object.keys(patch.keys).length || Object.keys(patch.vehicles).length) this.channel.postLive({ kind: "live-patch", patch });
  }

  takeNews(): LiveNews {
    if (this.failure) {
      const failure = this.failure;
      this.failure = null;
      throw new Error(`Live mode failed in the turn worker: ${failure}`);
    }
    const news = this.news;
    this.news = { records: [], destroyed: [], closed: [] };
    return news;
  }

  private receive(response: LiveResponse): void {
    this.inFlight = false;
    if (!this.running) return;
    if ("error" in response) {
      this.failure = response.error;
      this.running = false;
      return;
    }
    Object.assign(this.frames, response.frames);
    this.news.records.push(...response.records);
    this.news.destroyed.push(...response.destroyed);
    if (response.closed) this.news.closed.push(response.closed);
    if (!response.open) this.running = false;
  }

  private reset(): void {
    this.inFlight = false;
    this.owedMs = 0;
    this.frames = {};
    this.news = { records: [], destroyed: [], closed: [] };
  }
}

function patchOf(before: World, after: World): LivePatch {
  const keys: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (UNPATCHED_KEYS.has(key)) continue;
    if (JSON.stringify(value) !== JSON.stringify((before as Record<string, unknown>)[key])) keys[key] = value;
  }
  const vehicles: Record<string, Partial<Vehicle>> = {};
  for (const v of after.vehicles) {
    const old = before.vehicles.find((x) => x.id === v.id);
    const fields = withoutPose(v);
    if (!old || JSON.stringify(fields) !== JSON.stringify(withoutPose(old))) vehicles[v.id] = fields;
  }
  return { keys: keys as Partial<World>, vehicles };
}

function withoutPose(v: Vehicle): Partial<Vehicle> {
  const rest: Record<string, unknown> = { ...v };
  for (const field of LIVE_POSE_FIELDS) delete rest[field];
  return rest as Partial<Vehicle>;
}

const STICK_CODES = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "Space"]);

export class LiveKeys {
  private readonly held = new Set<string>();

  constructor(private readonly listening: (e: KeyboardEvent) => boolean) {
    window.addEventListener("keydown", (e) => {
      if (!STICK_CODES.has(e.code) || !this.listening(e)) return;
      e.preventDefault();
      this.held.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.held.delete(e.code));
    window.addEventListener("blur", () => this.held.clear());
  }

  anyHeld(): boolean {
    return this.held.size > 0;
  }

  stick(): Stick {
    return { throttle: this.axis("KeyW", "KeyS"), steer: this.axis("KeyD", "KeyA") };
  }

  private axis(plus: string, minus: string): -1 | 0 | 1 {
    if (this.held.has(plus) === this.held.has(minus)) return 0;
    return this.held.has(plus) ? 1 : -1;
  }
}
