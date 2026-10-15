import { TOUCH } from "../config";

export type TouchIntent =
  | { kind: "tap"; x: number; y: number }
  | { kind: "hold"; x: number; y: number }
  | { kind: "pan"; dx: number; dy: number }
  | { kind: "zoom"; factor: number };

type Phase = "down" | "drag" | "held" | "pinch" | "spent";

interface Finger {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startT: number;
  phase: Phase;
}

export class TouchGestures {
  private readonly fingers = new Map<number, Finger>();
  private readonly ignored = new Set<number>();
  private pinchDistance = 0;

  down(id: number, x: number, y: number, t: number): TouchIntent | null {
    if (this.fingers.size >= 2) {
      this.ignored.add(id);
      return null;
    }
    this.fingers.set(id, { x, y, startX: x, startY: y, startT: t, phase: "down" });
    if (this.fingers.size === 2) this.startPinch();
    return null;
  }

  move(id: number, x: number, y: number): TouchIntent | null {
    const finger = this.fingers.get(id);
    if (!finger) return null;
    const dx = x - finger.x;
    const dy = y - finger.y;
    finger.x = x;
    finger.y = y;
    switch (finger.phase) {
      case "down":
        return this.leaveSlop(finger);
      case "drag":
        return { kind: "pan", dx, dy };
      case "pinch":
        return this.pinch();
      case "held":
      case "spent":
        return null;
    }
  }

  up(id: number): TouchIntent | null {
    if (this.ignored.delete(id)) return null;
    const finger = this.fingers.get(id);
    if (!finger) return null;
    this.fingers.delete(id);
    switch (finger.phase) {
      case "down":
        return { kind: "tap", x: finger.x, y: finger.y };
      case "drag":
      case "held":
      case "spent":
        return null;
      case "pinch":
        this.endPinch();
        return null;
    }
  }

  cancel(id: number): void {
    this.ignored.delete(id);
    const finger = this.fingers.get(id);
    if (!finger) return;
    this.fingers.delete(id);
    if (finger.phase === "pinch") this.endPinch();
  }

  tick(t: number): TouchIntent | null {
    if (this.fingers.size !== 1) return null;
    const finger = [...this.fingers.values()][0]!;
    if (finger.phase !== "down" || t - finger.startT < TOUCH.longPressMs) return null;
    finger.phase = "held";
    return { kind: "hold", x: finger.x, y: finger.y };
  }

  holding(): { x: number; y: number } | null {
    if (this.fingers.size !== 1) return null;
    const finger = [...this.fingers.values()][0]!;
    return finger.phase === "down" || finger.phase === "held" ? { x: finger.x, y: finger.y } : null;
  }

  private leaveSlop(finger: Finger): TouchIntent | null {
    if (Math.hypot(finger.x - finger.startX, finger.y - finger.startY) <= TOUCH.slopPx) return null;
    finger.phase = "drag";
    return { kind: "pan", dx: finger.x - finger.startX, dy: finger.y - finger.startY };
  }

  private startPinch(): void {
    for (const finger of this.fingers.values()) finger.phase = "pinch";
    this.pinchDistance = this.spread();
  }

  private endPinch(): void {
    for (const finger of this.fingers.values()) finger.phase = "spent";
  }

  private pinch(): TouchIntent | null {
    const spread = this.spread();
    if (this.pinchDistance <= 0 || spread <= 0) {
      this.pinchDistance = spread;
      return null;
    }
    const factor = spread / this.pinchDistance;
    this.pinchDistance = spread;
    return factor === 1 ? null : { kind: "zoom", factor };
  }

  private spread(): number {
    const [a, b] = [...this.fingers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
