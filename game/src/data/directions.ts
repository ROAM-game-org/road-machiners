import type { LandmarkLook } from '../sim/types';
import { MAP_SPREAD } from './region';

export const DIRECTIONS = {
  joinSnap: 6,
  joinReach: 80,
  onRoad: 8,
  joinCandidates: 6,
  leaveReach: 100,
  leanAngle: Math.PI / 16,
  directReach: 40,
  placeSlack: 15,
  cueReach: 25,
  headingReach: 25 * MAP_SPREAD,
  keepAngle: 0.5,
  maxSteps: 5,
  maxCount: 3,
  nodeMerge: 0.3,
  spans: { near: 60, fair: 180 },
  cueLooks: ['waterTower', 'silo', 'gasStation', 'billboard', 'tank', 'barn', 'watchtower', 'glassSpire', 'escapePod'] as LandmarkLook[],
};
