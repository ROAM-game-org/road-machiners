import { PHYSICS } from '../data/physics';
import type { Body } from '../sim/body';

export function turnRadius(body: Body, maxSteer: number): number {
  return (2 * body.wheelX) / Math.tan(maxSteer);
}

export function turnaroundSpeed(body: Body, maxSteer: number, grip: number): number {
  return Math.sqrt(PHYSICS.driver.cornerAccel * grip * turnRadius(body, maxSteer));
}
