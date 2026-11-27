import { PHYSICS } from "../data/physics";
import { captureDrive, freeDrive, restoreDrive, type Drive, type DriveSnapshot, type PhysicsRun, type Stick } from "../phys/drive";
import type { VehicleFrame } from "../phys/frames";
import { landPhysics, startPhysics, type PreparedTurn } from "../phys/turn";
import type { World } from "../sim/types";
import { cloneForTurn, closeTurn, openTurn, type OpenedTurn } from "../sim/world";

const MAX_STEPS_PER_FRAME = 8;
const STEP_MS = 1000 / PHYSICS.stepsPerSecond;

type OpenSecond = { draft: World; opened: OpenedTurn; drive: Drive; run: PhysicsRun };

export class LiveClock {
  private open: OpenSecond | null = null;
  private owedMs = 0;
  private stick: Stick = { throttle: 0, steer: 0 };

  isOpen(): boolean {
    return this.open !== null;
  }

  frameOf(id: string): VehicleFrame | undefined {
    return this.open?.run.frames[id]?.at(-1);
  }

  tick(world: World, drive: DriveSnapshot, dtMs: number, stick: Stick): PreparedTurn | null {
    this.stick = stick;
    const second = (this.open ??= this.openSecond(world, drive));
    this.owedMs = Math.min(this.owedMs + dtMs, MAX_STEPS_PER_FRAME * STEP_MS);
    while (this.owedMs >= STEP_MS && !second.run.isDone()) {
      second.run.step();
      this.owedMs -= STEP_MS;
    }
    return second.run.isDone() ? this.closeSecond(second) : null;
  }

  drop(): void {
    if (!this.open) return;
    freeSecond(this.open);
    this.open = null;
    this.owedMs = 0;
  }

  private openSecond(world: World, saved: DriveSnapshot): OpenSecond {
    const draft = cloneForTurn(world);
    const opened = openTurn(draft);
    const drive = restoreDrive(saved);
    const playerId = world.player.vehicleId;
    const run = startPhysics(drive, draft, (id) => (id === playerId ? this.stick : null));
    return { draft, opened, drive, run };
  }

  private closeSecond(second: OpenSecond): PreparedTurn {
    this.open = null;
    try {
      const played = landPhysics(second.draft, second.run);
      closeTurn(second.draft, second.opened);
      const { terrain: _terrain, ...state } = second.draft;
      const { next, sight, ...motion } = played;
      return { world: state, result: { ...motion, next: captureDrive(next) }, sight, tail: null };
    } finally {
      freeSecond(second);
    }
  }
}

function freeSecond(second: OpenSecond): void {
  second.run.events.free();
  second.run.world.free();
  freeDrive(second.drive);
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
