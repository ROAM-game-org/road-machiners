import type { MoveOrder } from '../sim/types';
import type { Vec } from '../sim/vec';
import type { Viewport } from './map-geometry';
import { toPx } from './map-geometry';
import { token } from './tokens';

export type Waypoint = Exclude<MoveOrder, { kind: 'brake' }>;

const RING = { radius: 9, width: 3 };
const SIGN = { radius: 5, sides: 8 };
const ARROW = { length: 5, wing: 4 };

function ring(ctx: CanvasRenderingContext2D, at: Vec, color: string): void {
  ctx.beginPath();
  ctx.arc(at.x, at.y, RING.radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = RING.width;
  ctx.stroke();
}

function sign(ctx: CanvasRenderingContext2D, at: Vec): void {
  ctx.beginPath();
  for (let k = 0; k < SIGN.sides; k++) {
    const angle = ((k + 0.5) / SIGN.sides) * Math.PI * 2;
    ctx.lineTo(at.x + Math.cos(angle) * SIGN.radius, at.y + Math.sin(angle) * SIGN.radius);
  }
  ctx.closePath();
  ctx.fillStyle = token('--path-dest');
  ctx.fill();
}

function arrow(ctx: CanvasRenderingContext2D, at: Vec, from: Vec): void {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(Math.atan2(at.y - from.y, at.x - from.x));
  ctx.beginPath();
  ctx.moveTo(ARROW.length, 0);
  ctx.lineTo(-ARROW.length, ARROW.wing);
  ctx.lineTo(-ARROW.length, -ARROW.wing);
  ctx.closePath();
  ctx.fillStyle = token('--path-plan');
  ctx.fill();
  ctx.restore();
}

export function drawWaypoint(ctx: CanvasRenderingContext2D, view: Viewport, order: Waypoint, truck: Vec): void {
  const at = toPx(view, order.dest);
  ctx.save();
  if (order.kind === 'stopAt') {
    ring(ctx, at, token('--path-dest'));
    sign(ctx, at);
  } else {
    ring(ctx, at, token('--path-plan'));
    arrow(ctx, at, toPx(view, truck));
  }
  ctx.restore();
}
