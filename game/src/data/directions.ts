import type { LandmarkLook } from '../sim/types';

export const DIRECTIONS = {
  joinSnap: 6,
  joinReach: 80,
  onRoad: 8,
  joinCandidates: 6,
  leaveReach: 60,
  directReach: 40,
  cueReach: 25,
  keepAngle: 0.5,
  maxSteps: 5,
  maxCount: 3,
  nodeMerge: 0.3,
  spans: { near: 60, fair: 180 },
  cueLooks: ['waterTower', 'silo', 'gasStation', 'billboard', 'tank', 'barn', 'watchtower', 'glassSpire', 'escapePod'] as LandmarkLook[],
};
