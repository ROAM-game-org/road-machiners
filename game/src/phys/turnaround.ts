import { PHYSICS } from '../data/physics';
import type { Body } from '../sim/body';
import type { Clearance } from '../sim/clearance';
import type { Vec } from '../sim/vec';

export function turnRadius(body: Body, maxSteer: number): number {
  return (2 * body.wheelX) / Math.tan(maxSteer);
}

export function turnaroundSpeed(body: Body, maxSteer: number, grip: number): number {
  return Math.sqrt(PHYSICS.driver.cornerAccel * grip * turnRadius(body, maxSteer));
}

export type Stance = { at: Vec; heading: number };

function arcPoint(stance: Stance, curvature: number, length: number): Vec {
  const { at, heading } = stance;
  if (curvature === 0) return { x: at.x + Math.cos(heading) * length, y: at.y + Math.sin(heading) * length };
  const turned = heading + curvature * length;
  return { x: at.x + (Math.sin(turned) - Math.sin(heading)) / curvature, y: at.y + (Math.cos(heading) - Math.cos(turned)) / curvature };
}

function arcClear(room: Clearance, stance: Stance, curvature: number, length: number, direction: 1 | -1, size: number): boolean {
  const step = PHYSICS.driver.turnSample;
  const limit = Math.max(0, room.depth(stance.at, stance.heading)) + PHYSICS.driver.roomSlack;
  const startCliff = room.nearsCliff(stance.at, stance.heading);
  for (let s = step; s < length + step; s += step) {
    const signed = direction * Math.min(s, length);
    const at = arcPoint(stance, curvature, signed);
    const heading = stance.heading + curvature * signed;
    if (at.x < 0 || at.y < 0 || at.x >= size || at.y >= size) return false;
    if (room.depth(at, heading) > limit) return false;
    if (!startCliff && room.nearsCliff(at, heading)) return false;
  }
  return true;
}

export function forwardTurnClear(room: Clearance, stance: Stance, radiusTiles: number, side: 1 | -1, sweep: number, size: number): boolean {
  return arcClear(room, stance, side / radiusTiles, sweep * radiusTiles, 1, size);
}

export function backUpClear(room: Clearance, stance: Stance, radiusTiles: number, side: 1 | -1, length: number, size: number): boolean {
  return arcClear(room, stance, -side / radiusTiles, length, -1, size);
}
