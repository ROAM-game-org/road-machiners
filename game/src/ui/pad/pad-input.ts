import { PAD } from "../../config";
import { setPadMode } from "../input-mode";
import { controlTargets, emulatePadCapture, focusedTarget, hoverAt, PadDrag, PadPress, PadRadial, PadReticle, pressKey, scrollAt, sendKey, stepTab, zoomAt } from "./pad-dom";
import {
  cycledTarget,
  framesActive,
  INVENTORY_KEY,
  movedCursor,
  nearestTarget,
  padKeyOf,
  PadTracker,
  RADIAL_ENTRIES,
  radialPick,
  readPads,
  snapTarget,
  targetToward,
  turnKey,
  type PadButton,
  type PadEdges,
  type PadFrame,
  type PadPlace,
  type PadTarget,
  type Point,
} from "./pad-model";

export type PadWorld = {
  open: () => boolean;
  targets: () => PadTarget[];
  surface: HTMLElement;
};

type Gamepads = () => readonly (Gamepad | null)[];

const DIRECTIONS: Partial<Record<PadButton, Point>> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const CYCLE: Partial<Record<PadButton, 1 | -1>> = { lb: -1, rb: 1 };
const ZOOM: Partial<Record<PadButton, number>> = { up: -1, down: 1 };
const SCROLL_NUDGE_PX = 120;

export class PadInput {
  private readonly tracker = new PadTracker(PAD.holdMs);
  private readonly reticle = new PadReticle();
  private readonly radial = new PadRadial(RADIAL_ENTRIES);
  private readonly press = new PadPress();
  private readonly drag = new PadDrag(() => this.world?.surface ?? null);
  private world: PadWorld | null = null;
  private active = false;
  private place: PadPlace = "screen";
  private controls: PadTarget[] = [];
  private controlsAt = -Infinity;
  private targets: PadTarget[] = [];
  private stuck: string | null = null;
  private worldAt: Point | null = null;
  private waking = new Set<PadButton>();
  private last = 0;

  constructor(private readonly pads: Gamepads) {}

  start(): void {
    emulatePadCapture();
    for (const type of ["pointermove", "pointerdown", "keydown", "wheel"]) window.addEventListener(type, (e) => e.isTrusted && this.leave(), true);
    const loop = (now: number): void => {
      this.tick(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  attachWorld(world: PadWorld): void {
    this.world = world;
  }

  private tick(now: number): void {
    const dt = Math.min(100, now - this.last);
    this.last = now;
    const frame = readPads(this.pads(), PAD);
    const edges = this.awake(this.tracker.step(frame, now));
    if (framesActive(frame)) this.enter(frame);
    if (!this.active) return;
    this.refresh(now);
    if (this.radial.isOpen()) return this.steerRadial(frame, edges);
    this.runEdges(edges);
    this.steer(frame, dt);
  }

  private awake(edges: PadEdges): PadEdges {
    const released = edges.released.filter((r) => !this.waking.delete(r.button));
    return { pressed: edges.pressed, released, heldNow: edges.heldNow.filter((b) => !this.waking.has(b)) };
  }

  private enter(frame: PadFrame): void {
    if (this.active) return;
    this.active = true;
    this.waking = new Set(frame.down);
    this.reticle.show(true);
    setPadMode(true);
  }

  private leave(): void {
    if (!this.active) return;
    this.active = false;
    if (this.tracker.frame().down.has("rt") && !this.waking.has("rt")) sendKey("keyup", turnKey());
    this.press.up(false);
    this.drag.end();
    this.radial.close();
    this.reticle.show(false);
    setPadMode(false);
  }

  private refresh(now: number): void {
    const place: PadPlace = this.world?.open() ? "world" : "screen";
    const moved = place !== this.place;
    if (moved || now - this.controlsAt >= PAD.targetRefreshMs) this.refreshControls(now);
    this.targets = this.targetsIn(place);
    if (moved) this.landOnScreen(place);
    this.place = place;
    this.follow();
  }

  private refreshControls(now: number): void {
    this.controls = controlTargets((node) => node === this.world?.surface);
    this.controlsAt = now;
  }

  private targetsIn(place: PadPlace): PadTarget[] {
    if (place !== "world" || !this.world) return this.controls;
    return [...this.world.targets(), ...this.controls];
  }

  private landOnScreen(place: PadPlace): void {
    if (place === "world") return this.backToWorld();
    this.worldAt = this.reticle.where();
    const land = focusedTarget(this.targets) ?? nearestTarget(this.reticle.where(), this.targets, Infinity);
    if (land) this.moveTo(land);
  }

  private backToWorld(): void {
    if (!this.worldAt) return;
    this.stuck = null;
    this.reticle.place(this.worldAt, false);
    this.worldAt = null;
  }

  private follow(): void {
    if (this.stuck === null) return;
    const target = this.targets.find((t) => t.key === this.stuck);
    if (target) this.reticle.place({ x: target.x, y: target.y }, true);
    else this.stuck = null;
  }

  private moveTo(target: PadTarget): void {
    this.stuck = target.key;
    this.reticle.place({ x: target.x, y: target.y }, true);
    this.hover();
  }

  private runEdges(edges: PadEdges): void {
    for (const button of edges.pressed) if (!this.waking.has(button)) this.pressed(button);
    for (const button of edges.heldNow) if (button === "y") this.openRadial();
    for (const release of edges.released) this.released(release.button, release.held);
  }

  private pressed(button: PadButton): void {
    if (button === "a") return this.pressA();
    if (button === "rt") return sendKey("keydown", turnKey());
    if (button === "y") return;
    if (this.place === "world") return this.pressedInWorld(button);
    this.pressedOnScreen(button);
  }

  private pressA(): void {
    this.reticle.pressed(true);
    this.press.down(this.reticle.where());
  }

  private pressedInWorld(button: PadButton): void {
    const cycle = CYCLE[button];
    if (cycle) return this.cycleTrucks(cycle);
    const zoom = ZOOM[button];
    if (zoom && this.world) return zoomAt(this.world.surface, zoom * PAD.zoomStep);
    const key = padKeyOf(button, "world");
    if (key) pressKey(key);
  }

  private pressedOnScreen(button: PadButton): void {
    const cycle = CYCLE[button];
    if (cycle) return void stepTab(this.reticle.where(), cycle);
    const direction = DIRECTIONS[button];
    if (direction) return this.jump(direction);
    const key = padKeyOf(button, "screen");
    if (key) pressKey(key);
  }

  private jump(direction: Point): void {
    const target = targetToward(this.reticle.where(), this.targets, direction);
    if (target) return this.moveTo(target);
    scrollAt(this.reticle.where(), direction.y * SCROLL_NUDGE_PX);
    this.controlsAt = -Infinity;
  }

  private cycleTrucks(step: 1 | -1): void {
    const trucks = this.targets.filter((t) => t.kind === "truck");
    const own = this.targets.find((t) => t.kind === "own") ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const next = cycledTarget(trucks, own, this.stuck, step);
    if (!next) return;
    this.moveTo(next);
    this.press.down(this.reticle.where());
    this.press.up(true);
  }

  private released(button: PadButton, held: boolean): void {
    if (button === "a") {
      this.reticle.pressed(false);
      return this.press.up(!held);
    }
    if (button === "rt") return sendKey("keyup", turnKey());
    if (button === "y" && !held) pressKey(INVENTORY_KEY);
  }

  private steerRadial(frame: PadFrame, edges: PadEdges): void {
    const pick = radialPick(frame.left, RADIAL_ENTRIES.length, PAD.radialPick);
    this.radial.highlight(pick);
    if (edges.pressed.includes("b")) return this.closeRadial();
    if (!edges.released.some((r) => r.button === "y")) return;
    this.closeRadial();
    const entry = pick === null ? null : RADIAL_ENTRIES[pick];
    if (entry) pressKey(entry);
  }

  private openRadial(): void {
    this.radial.open();
    this.reticle.show(false);
  }

  private closeRadial(): void {
    this.radial.close();
    this.reticle.show(this.active);
  }

  private steer(frame: PadFrame, dt: number): void {
    this.steerReticle(frame, dt);
    this.steerView(frame, dt);
  }

  private steerReticle(frame: PadFrame, dt: number): void {
    const { left } = frame;
    if (left.x === 0 && left.y === 0) return this.settle();
    this.stuck = null;
    const at = this.reticle.where();
    const over = nearestTarget(at, this.targets, 0);
    const next = movedCursor(at, { stick: left, dtMs: dt, pxPerS: PAD.cursorPxPerS, slowNear: PAD.cursorSlowNear, bounds: { width: window.innerWidth, height: window.innerHeight } }, over);
    this.reticle.place(next, nearestTarget(next, this.targets, 0) !== null);
    if (this.press.pressing()) return this.press.move(next);
    this.hover();
  }

  private settle(): void {
    if (this.stuck !== null || this.press.pressing()) return;
    const near = snapTarget(this.reticle.where(), this.targets, this.place, PAD.snapPx);
    if (near) return this.moveTo(near);
    if (this.place === "world") this.hover();
  }

  private steerView(frame: PadFrame, dt: number): void {
    const { right } = frame;
    const still = right.x === 0 && right.y === 0;
    if (this.place !== "world") return still ? undefined : scrollAt(this.reticle.where(), (right.y * PAD.scrollPxPerS * dt) / 1000);
    if (still) return this.drag.end();
    const px = (PAD.panPxPerS * dt) / 1000;
    this.drag.by(-right.x * px, -right.y * px);
  }

  private hover(): void {
    if (!this.press.pressing()) hoverAt(this.reticle.where());
  }
}

export function startPad(): PadInput {
  const input = new PadInput(() => (typeof navigator.getGamepads === "function" ? navigator.getGamepads() : []));
  input.start();
  return input;
}
