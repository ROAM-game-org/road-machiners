import { PHYSICS } from '../data/physics';
import type { Body } from '../sim/body';
import { CELL, type NavLayer } from '../sim/nav/layer';
import type { Vec } from '../sim/vec';

export function turnRadius(body: Body, maxSteer: number): number {
  return (2 * body.wheelX) / Math.tan(maxSteer);
}

export function turnaroundSpeed(body: Body, maxSteer: number, grip: number): number {
  return Math.sqrt(PHYSICS.driver.cornerAccel * grip * turnRadius(body, maxSteer));
}

type Grid = Pick<NavLayer, 'n' | 'blocked'>;

export type Stance = { at: Vec; heading: number };

function arcPoint(stance: Stance, curvature: number, length: number): Vec {
  const { at, heading } = stance;
  if (curvature === 0) return { x: at.x + Math.cos(heading) * length, y: at.y + Math.sin(heading) * length };
  const turned = heading + curvature * length;
  return { x: at.x + (Math.sin(turned) - Math.sin(heading)) / curvature, y: at.y + (Math.cos(heading) - Math.cos(turned)) / curvature };
}

function cellBlocked(layer: Grid, p: Vec): boolean {
  const x = Math.floor(p.x / CELL);
  const y = Math.floor(p.y / CELL);
  if (x < 0 || y < 0 || x >= layer.n || y >= layer.n) return true;
  return layer.blocked[y * layer.n + x] === 1;
}

function arcClear(layer: Grid, stance: Stance, curvature: number, length: number, direction: 1 | -1): boolean {
  const step = PHYSICS.driver.turnSample;
  for (let s = step; s < length + step; s += step) if (cellBlocked(layer, arcPoint(stance, curvature, direction * Math.min(s, length)))) return false;
  return true;
}

export function forwardTurnClear(layer: Grid, stance: Stance, radiusTiles: number, side: 1 | -1, sweep: number): boolean {
  return arcClear(layer, stance, side / radiusTiles, sweep * radiusTiles, 1);
}

export function backUpClear(layer: Grid, stance: Stance, radiusTiles: number, side: 1 | -1, length: number): boolean {
  return arcClear(layer, stance, -side / radiusTiles, length, -1);
}
