import type { DriveSnapshot } from "../phys/drive";
import type { PlanFrames } from "../phys/plan";
import { SentObstacles, type PreviewRequest, type PreviewResponse, type TerrainRequest } from "../phys/turn";
import { mergePerf } from "../perf";
import { PAL } from "../render/palette";
import { orderThrottle, playerOrder } from "../sim/steering";
import type { Vehicle, World } from "../sim/types";
import type { Vec } from "../sim/vec";
import { currentQuestLanguage } from "../sim/quests";
import { reportError } from "./crash";
import { workerError } from "./travel";
import { WorkerLoad, workerFailure } from "./worker-load";

export function throttleColor(world: World, me: Vehicle, p: Vec): number {
  return PAL.throttle[orderThrottle(me, playerOrder(world, me, p, false))];
}

export function firstTurnColor(world: World, me: Vehicle): number {
  const order = me.order;
  if (!order || order.kind === "brake") return PAL.plan;
  return order.kind === "through" || order.pace !== undefined ? PAL.throttle[orderThrottle(me, order)] : PAL.plan;
}

type Wanted = { world: World; drive: DriveSnapshot; meId: string };

export class PlanPreparation {
  private readonly load = new WorkerLoad("preview worker");
  private sent: Wanted | null = null;
  private answered = false;
  private worker: Worker | null = null;
  private terrain: World["terrain"] | null = null;
  private readonly obstacles = new SentObstacles();
  private serial = 0;
  private running: number | null = null;
  private queued: Wanted | null = null;
  private latest: { id: number | null; world: World; ready: PlanFrames | null } | null = null;

  request(world: World, drive: DriveSnapshot, meId: string): void {
    this.queued = { world, drive, meId };
    this.latest = { id: null, world, ready: null };
    if (this.running === null) this.postQueued();
  }

  warm(terrain: World["terrain"]): void {
    if (this.load.gaveUp || this.load.waiting || this.terrain === terrain) return;
    this.worker ??= this.createWorker();
    this.worker.postMessage({ kind: "terrain", terrain } satisfies TerrainRequest);
    this.terrain = terrain;
  }

  take(world: World): PlanFrames | null {
    const latest = this.latest;
    if (latest?.world !== world || !latest.ready) return null;
    this.latest = null;
    return latest.ready;
  }

  private postQueued(): void {
    const wanted = this.queued;
    if (!wanted || this.load.gaveUp || this.load.waiting) return;
    this.queued = null;
    this.sent = this.answered ? null : wanted;
    const { terrain, ...state } = wanted.world;
    const snapshot = wanted.drive.snapshot.slice();
    const id = ++this.serial;
    this.worker ??= this.createWorker();
    this.worker.postMessage(
      {
        kind: "preview",
        id,
        ...this.obstacles.split(state),
        drive: { ...wanted.drive, snapshot },
        meId: wanted.meId,
        questLanguage: currentQuestLanguage(),
        terrain: this.terrain === terrain ? null : terrain,
      } satisfies PreviewRequest,
      [snapshot.buffer],
    );
    this.terrain = terrain;
    this.running = id;
    if (this.latest?.world === wanted.world) this.latest.id = id;
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL("../phys/turn-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<PreviewResponse>) => this.receive(event.data);
    worker.onerror = (event) => {
      event.preventDefault();
      if (worker !== this.worker) return;
      if (this.load.failed(event, () => this.postQueued())) return this.dropWorker();
      this.fail(workerFailure("Preview worker", event));
    };
    worker.onmessageerror = () => this.fail("Could not read preview worker response");
    return worker;
  }

  private dropWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.terrain = null;
    this.obstacles.forget();
    this.running = null;
    this.answered = false;
    this.queued ??= this.sent;
    this.sent = null;
  }

  private receive(response: PreviewResponse): void {
    this.load.loaded();
    this.answered = true;
    if ("error" in response) reportError(workerError(response.error));
    else {
      mergePerf(response.perf);
      if (this.latest?.id === response.id) this.latest.ready = response.preview;
    }
    this.finish();
  }

  private fail(message: string): void {
    reportError(new Error(message));
    this.finish();
  }

  private finish(): void {
    this.running = null;
    this.sent = null;
    this.postQueued();
  }
}
