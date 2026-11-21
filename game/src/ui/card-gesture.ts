import { TOUCH } from "../config";
import type { Point } from "./card-zoom";

export type GestureSink = { pan: (dx: number, dy: number) => void; zoom: (factor: number, at: Point) => void };

type Finger = Point & { startX: number; startY: number };

function middle(a: Finger, b: Finger): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export class CardGesture {
  private readonly fingers = new Map<number, Finger>();
  private dragging = false;

  constructor(private readonly sink: GestureSink) {}

  down(id: number, x: number, y: number): void {
    this.fingers.set(id, { x, y, startX: x, startY: y });
  }

  move(id: number, x: number, y: number): boolean {
    const finger = this.fingers.get(id);
    if (!finger) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return this.dragging;
    if (this.fingers.size >= 2) return this.pinch(id, finger, x, y);
    return this.drag(finger, x, y);
  }

  up(id: number): boolean {
    this.fingers.delete(id);
    const wasDragging = this.dragging;
    if (this.fingers.size === 0) this.dragging = false;
    return wasDragging;
  }

  private drag(finger: Finger, x: number, y: number): boolean {
    if (!this.dragging && Math.hypot(x - finger.startX, y - finger.startY) <= TOUCH.slopPx) return false;
    const fromX = this.dragging ? finger.x : finger.startX;
    const fromY = this.dragging ? finger.y : finger.startY;
    this.dragging = true;
    finger.x = x;
    finger.y = y;
    this.sink.pan(x - fromX, y - fromY);
    return true;
  }

  private pinch(id: number, finger: Finger, x: number, y: number): boolean {
    const other = [...this.fingers.entries()].find(([key]) => key !== id)?.[1];
    if (!other) return this.dragging;
    const before = { distance: Math.hypot(finger.x - other.x, finger.y - other.y), at: middle(finger, other) };
    finger.x = x;
    finger.y = y;
    const after = { distance: Math.hypot(x - other.x, y - other.y), at: middle(finger, other) };
    this.dragging = true;
    this.sink.pan(after.at.x - before.at.x, after.at.y - before.at.y);
    if (before.distance > 0 && after.distance > 0) this.sink.zoom(after.distance / before.distance, after.at);
    return true;
  }
}
