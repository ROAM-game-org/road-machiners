import type { LandmarkLook } from '../sim/types';
import type { Vec } from '../sim/vec';

export type FarmPiece = { id: string; look: LandmarkLook; pos: Vec; r: number; yaw: number };

export const FARM_TOWER_ID = 'intro-water-tower';

export const ARRIVAL = {
  pose: { pos: { x: 370, y: 540 }, heading: -2.03 },
  wreck: { ahead: 13, side: 0 },
  fuelLiters: 43,
  supplies: 3,
  health: 89,
  farm: [
    { id: FARM_TOWER_ID, look: 'waterTower', pos: { x: 373, y: 548 }, r: 1.2, yaw: 0.4 },
    { id: 'intro-shed', look: 'shack', pos: { x: 377, y: 545 }, r: 2, yaw: 0.15 },
    { id: 'intro-house', look: 'ruin', pos: { x: 365, y: 550 }, r: 1.2, yaw: 1.2 },
    { id: 'intro-woodpile', look: 'woodpile', pos: { x: 368, y: 553 }, r: 0.62, yaw: 0.3 },
    { id: 'intro-drums', look: 'drums', pos: { x: 380, y: 540 }, r: 0.43, yaw: 0 },
    { id: 'intro-fence', look: 'fence', pos: { x: 383, y: 550 }, r: 0.8, yaw: 0.5 },
  ] as FarmPiece[],
};
