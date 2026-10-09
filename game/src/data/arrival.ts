import type { LandmarkLook } from '../sim/types';
import type { Vec } from '../sim/vec';

export type FarmPiece = { id: string; look: LandmarkLook; pos: Vec; r: number; yaw: number };

export const FARM_TOWER_ID = 'intro-water-tower';

export const ARRIVAL = {
  pose: { pos: { x: 359, y: 493 }, heading: -1.9 },
  wreck: { ahead: 13, side: 0 },
  farm: [
    { id: FARM_TOWER_ID, look: 'waterTower', pos: { x: 362, y: 501 }, r: 1.2, yaw: 0.4 },
    { id: 'intro-shed', look: 'shack', pos: { x: 366, y: 498 }, r: 2, yaw: 0.15 },
    { id: 'intro-house', look: 'house', pos: { x: 354, y: 503 }, r: 1.2, yaw: 1.2 },
    { id: 'intro-woodpile', look: 'woodpile', pos: { x: 357, y: 506 }, r: 0.62, yaw: 0.3 },
    { id: 'intro-drums', look: 'drums', pos: { x: 369, y: 493 }, r: 0.43, yaw: 0 },
    { id: 'intro-tank', look: 'tank', pos: { x: 372, y: 503 }, r: 1.5, yaw: 0 },
  ] as FarmPiece[],
};
