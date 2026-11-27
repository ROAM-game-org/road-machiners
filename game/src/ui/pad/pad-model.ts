import type { Key } from "../../text/msg";

export const PAD_BUTTONS = ["a", "b", "x", "y", "lb", "rb", "lt", "rt", "view", "menu", "l3", "r3", "up", "down", "left", "right"] as const;

export type PadButton = (typeof PAD_BUTTONS)[number];
export type Stick = { x: number; y: number };
export type PadFrame = { down: ReadonlySet<PadButton>; left: Stick; right: Stick };
export type GamepadLike = { readonly buttons: readonly { pressed: boolean; value: number }[]; readonly axes: readonly number[] };
export type PadLimits = { deadzone: number; triggerAt: number };
export type PadRelease = { button: PadButton; heldMs: number; held: boolean };
export type PadEdges = { pressed: PadButton[]; released: PadRelease[]; heldNow: PadButton[] };

const TRIGGERS: ReadonlySet<PadButton> = new Set(["lt", "rt"]);
const STILL: Stick = { x: 0, y: 0 };

export const IDLE_FRAME: PadFrame = { down: new Set(), left: STILL, right: STILL };

export function deadzoned(x: number, y: number, deadzone: number): Stick {
  const length = Math.hypot(x, y);
  if (!(length > deadzone)) return STILL;
  const scaled = Math.min(1, (length - deadzone) / (1 - deadzone));
  return { x: (x / length) * scaled, y: (y / length) * scaled };
}

function isDown(pad: GamepadLike, index: number, button: PadButton, limits: PadLimits): boolean {
  const b = pad.buttons[index];
  if (!b) return false;
  return TRIGGERS.has(button) ? b.value >= limits.triggerAt || (b.pressed && b.value === 0) : b.pressed;
}

export function readPad(pad: GamepadLike, limits: PadLimits): PadFrame {
  const down = new Set<PadButton>();
  PAD_BUTTONS.forEach((button, index) => {
    if (isDown(pad, index, button, limits)) down.add(button);
  });
  const axis = (i: number): number => pad.axes[i] ?? 0;
  return { down, left: deadzoned(axis(0), axis(1), limits.deadzone), right: deadzoned(axis(2), axis(3), limits.deadzone) };
}

export type ConnectedPad = GamepadLike & { readonly connected: boolean; readonly mapping: string };

function stronger(a: Stick, b: Stick): Stick {
  return Math.hypot(b.x, b.y) > Math.hypot(a.x, a.y) ? b : a;
}

export function readPads(pads: readonly (ConnectedPad | null)[], limits: PadLimits): PadFrame {
  const frames = pads.filter((p): p is ConnectedPad => p !== null && p.connected && p.mapping === "standard").map((p) => readPad(p, limits));
  return frames.reduce((all, f) => ({ down: new Set([...all.down, ...f.down]), left: stronger(all.left, f.left), right: stronger(all.right, f.right) }), IDLE_FRAME);
}

export function framesActive(frame: PadFrame): boolean {
  return frame.down.size > 0 || frame.left.x !== 0 || frame.left.y !== 0 || frame.right.x !== 0 || frame.right.y !== 0;
}

export class PadTracker {
  private since = new Map<PadButton, number>();
  private fired = new Set<PadButton>();
  private last: PadFrame = IDLE_FRAME;

  constructor(private readonly holdMs: number) {}

  step(frame: PadFrame, now: number): PadEdges {
    const pressed = PAD_BUTTONS.filter((b) => frame.down.has(b) && !this.last.down.has(b));
    const released = PAD_BUTTONS.filter((b) => !frame.down.has(b) && this.last.down.has(b)).map((b) => this.release(b, now));
    for (const b of pressed) this.since.set(b, now);
    const heldNow = [...frame.down].filter((b) => this.crossesHold(b, now));
    this.last = frame;
    return { pressed, released, heldNow };
  }

  frame(): PadFrame {
    return this.last;
  }

  private release(button: PadButton, now: number): PadRelease {
    const heldMs = now - (this.since.get(button) ?? now);
    const held = this.fired.has(button);
    this.since.delete(button);
    this.fired.delete(button);
    return { button, heldMs, held };
  }

  private crossesHold(button: PadButton, now: number): boolean {
    const from = this.since.get(button);
    if (from === undefined || this.fired.has(button) || now - from < this.holdMs) return false;
    this.fired.add(button);
    return true;
  }
}

export type PadKey = { code: string; key: string };
export type PadPlace = "world" | "screen";

const ESCAPE: PadKey = { code: "Escape", key: "Escape" };
const TURN: PadKey = { code: "Space", key: " " };

export const INVENTORY_KEY: PadKey = { code: "KeyI", key: "i" };

const WORLD_KEYS: Partial<Record<PadButton, PadKey>> = {
  b: ESCAPE,
  menu: ESCAPE,
  x: { code: "KeyE", key: "e" },
  view: { code: "KeyM", key: "m" },
  l3: { code: "KeyV", key: "v" },
  r3: { code: "KeyF", key: "f" },
  lt: { code: "Digit0", key: "0" },
  left: { code: "ArrowLeft", key: "ArrowLeft" },
  right: { code: "ArrowRight", key: "ArrowRight" },
};

const SCREEN_KEYS: Partial<Record<PadButton, PadKey>> = {
  b: ESCAPE,
  menu: ESCAPE,
  x: { code: "KeyR", key: "r" },
};

export function padKeyOf(button: PadButton, place: PadPlace): PadKey | null {
  return (place === "world" ? WORLD_KEYS : SCREEN_KEYS)[button] ?? null;
}

export function turnKey(): PadKey {
  return TURN;
}

const GLYPHS: Readonly<Record<string, string>> = {
  Esc: "B",
  E: "X",
  I: "Y",
  M: "View",
  F: "R3",
  V: "L3",
  "0": "LT",
  Space: "RT",
};

export function padGlyphFor(keyCap: string): string | null {
  return GLYPHS[keyCap] ?? null;
}

export type RadialEntry = { code: string; key: string; label: Key };

export const RADIAL_ENTRIES: readonly RadialEntry[] = [
  { code: "KeyR", key: "r", label: "hud.manual" },
  { code: "KeyL", key: "l", label: "hud.lightsTitle" },
  { code: "KeyO", key: "o", label: "hud.overdrive" },
  { code: "KeyG", key: "g", label: "hud.coolKey" },
  { code: "KeyU", key: "u", label: "hud.firstAid" },
  { code: "KeyP", key: "p", label: "help.does.autoPatch" },
  { code: "KeyQ", key: "q", label: "help.does.autoFire" },
  { code: "BracketLeft", key: "[", label: "turn.speed.slower" },
  { code: "BracketRight", key: "]", label: "turn.speed.faster" },
  { code: "KeyC", key: "c", label: "help.does.character" },
  { code: "KeyJ", key: "j", label: "help.does.journal" },
  { code: "KeyV", key: "v", label: "help.does.camera" },
];

export type Point = { x: number; y: number };
export type Box = { width: number; height: number };
export type PadTargetKind = "control" | "truck" | "own" | "place" | "loot";
export type PadTarget = { key: string; kind: PadTargetKind; x: number; y: number; r: number; label?: string };
export type CursorMove = { stick: Stick; dtMs: number; pxPerS: number; slowNear: number; bounds: Box };

const CONE = Math.PI / 3;
const SIDEWAYS_COST = 2;

export function nearestTarget(at: Point, targets: readonly PadTarget[], reachPx: number): PadTarget | null {
  let best: PadTarget | null = null;
  let bestD = Infinity;
  for (const target of targets) {
    const d = Math.hypot(target.x - at.x, target.y - at.y);
    if (d <= Math.max(reachPx, target.r) && d < bestD) {
      best = target;
      bestD = d;
    }
  }
  return best;
}

export function sameControl(lost: PadTarget, targets: readonly PadTarget[], reachPx: number): PadTarget | null {
  return nearestTarget(lost, targets.filter((t) => t.label === lost.label), reachPx);
}

export function snapTarget(at: Point, targets: readonly PadTarget[], place: PadPlace, reachPx: number): PadTarget | null {
  const over = nearestTarget(at, targets, 0);
  if (over) return over;
  return nearestTarget(at, place === "world" ? targets.filter((t) => t.kind !== "control") : targets, reachPx);
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(0, value), max);
}

export function movedCursor(at: Point, move: CursorMove, over: PadTarget | null): Point {
  const tilt = Math.hypot(move.stick.x, move.stick.y);
  if (tilt === 0) return at;
  const speed = move.pxPerS * tilt * (over ? move.slowNear : 1);
  const step = (speed * move.dtMs) / 1000;
  return { x: clamp(at.x + (move.stick.x / tilt) * step, move.bounds.width), y: clamp(at.y + (move.stick.y / tilt) * step, move.bounds.height) };
}

export function targetToward(from: Point, targets: readonly PadTarget[], direction: Point): PadTarget | null {
  const heading = Math.atan2(direction.y, direction.x);
  let best: PadTarget | null = null;
  let bestCost = Infinity;
  for (const target of targets) {
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) continue;
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - heading), Math.cos(Math.atan2(dy, dx) - heading)));
    if (off > CONE) continue;
    const cost = d * Math.cos(off) + SIDEWAYS_COST * d * Math.sin(off);
    if (cost < bestCost) {
      best = target;
      bestCost = cost;
    }
  }
  return best;
}

export function cycledTarget(targets: readonly PadTarget[], centre: Point, currentKey: string | null, step: 1 | -1): PadTarget | null {
  if (targets.length === 0) return null;
  const around = [...targets].sort((a, b) => Math.atan2(a.y - centre.y, a.x - centre.x) - Math.atan2(b.y - centre.y, b.x - centre.x));
  const index = around.findIndex((t) => t.key === currentKey);
  if (index < 0) return around[step === 1 ? 0 : around.length - 1]!;
  return around[(index + step + around.length) % around.length]!;
}

export function radialPick(stick: Stick, count: number, threshold: number): number | null {
  if (count === 0 || Math.hypot(stick.x, stick.y) < threshold) return null;
  const turn = (Math.atan2(stick.x, -stick.y) + 2 * Math.PI) % (2 * Math.PI);
  return Math.round(turn / ((2 * Math.PI) / count)) % count;
}

export function radialSpot(index: number, count: number, radius: number): Point {
  const turn = (index * 2 * Math.PI) / count;
  return { x: Math.sin(turn) * radius, y: -Math.cos(turn) * radius };
}
