import { captureDrive, type Drive, type DriveSnapshot } from "../phys/drive";
import type { PlanFrames } from "../phys/plan";
import type { PreviewRequest, PreviewResponse } from "../phys/turn";
import { mergePerf } from "../perf";
import { PAL } from "../render/palette";
import { throttleFor } from "../sim/steering";
import type { Vehicle, World } from "../sim/types";
import type { Vec } from "../sim/vec";
import { reportError } from "./crash";
import { workerError } from "./travel";

export function throttleColor(me: Vehicle, p: Vec): number {
  return PAL.throttle[throttleFor(Math.hypot(p.x - me.pos.x, p.y - me.pos.y), me.speed)];
}

export function firstTurnColor(me: Vehicle): number {
  return me.order?.kind === "through" ? throttleColor(me, me.order.dest) : PAL.plan;
}

type Wanted = { world: World; drive: DriveSnapshot; meId: string };

export class PlanPreparation {
  private worker: Worker | null = null;
  private terrain: World["terrain"] | null = null;
  private serial = 0;
  private running: number | null = null;
  private queued: Wanted | null = null;
  private latest: { id: number | null; world: World; ready: PlanFrames | null } | null = null;

  request(world: World, drive: Drive, meId: string): void {
    this.queued = { world, drive: captureDrive(drive), meId };
    this.latest = { id: null, world, ready: null };
    if (this.running === null) this.postQueued();
  }

  take(world: World): PlanFrames | null {
    const latest = this.latest;
    if (latest?.world !== world || !latest.ready) return null;
    this.latest = null;
    return latest.ready;
  }

  private postQueued(): void {
    const wanted = this.queued;
    if (!wanted) return;
    this.queued = null;
    const { terrain, ...state } = wanted.world;
    const id = ++this.serial;
    this.worker ??= this.createWorker();
    this.worker.postMessage(
      {
        kind: "preview",
        id,
        world: state,
        drive: wanted.drive,
        meId: wanted.meId,
        terrain: this.terrain === terrain ? null : terrain,
      } satisfies PreviewRequest,
      [wanted.drive.snapshot.buffer as ArrayBuffer],
    );
    this.terrain = terrain;
    this.running = id;
    if (this.latest?.world === wanted.world) this.latest.id = id;
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL("../phys/turn.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<PreviewResponse>) => this.receive(event.data);
    worker.onerror = (event) => this.fail(`Preview worker failed: ${event.message}`);
    worker.onmessageerror = () => this.fail("Could not read preview worker response");
    return worker;
  }

  private receive(response: PreviewResponse): void {
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
    this.postQueued();
  }
}
