import type { LandmarkLook } from '../sim/types';
import { scalePoint } from './region';
import type { Vec } from '../sim/vec';

export type FarmPiece = { id: string; look: LandmarkLook; pos: Vec; r: number; yaw: number };

export const FARM_TOWER_ID = 'intro-water-tower';

const POSE_POS = scalePoint({ x: 74, y: 108 });

function nearArrival(dx: number, dy: number): Vec {
  return { x: POSE_POS.x + dx, y: POSE_POS.y + dy };
}

export const ARRIVAL = {
  pose: { pos: POSE_POS, heading: -2.03 },
  wreck: { ahead: 13, side: 0 },
  fuelLiters: 43,
  supplies: 3,
  health: 89,
  farm: [
    { id: FARM_TOWER_ID, look: 'waterTower', pos: nearArrival(3, 8), r: 1.2, yaw: 0.4 },
    { id: 'intro-shed', look: 'shack', pos: nearArrival(7, 5), r: 2, yaw: 0.15 },
    { id: 'intro-house', look: 'ruin', pos: nearArrival(-5, 10), r: 1.2, yaw: 1.2 },
    { id: 'intro-woodpile', look: 'woodpile', pos: nearArrival(-2, 13), r: 0.62, yaw: 0.3 },
    { id: 'intro-drums', look: 'drums', pos: nearArrival(10, 0), r: 0.43, yaw: 0 },
    { id: 'intro-fence', look: 'fence', pos: nearArrival(13, 10), r: 0.8, yaw: 0.5 },
  ] as FarmPiece[],
};
