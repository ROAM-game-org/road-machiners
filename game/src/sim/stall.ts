import { RULES } from '../data/rules';
import type { MoveOrder, Vehicle } from './types';
import { dist, type Vec } from './vec';

export type StallMemory = { lastPos?: Vec; stalled?: number; recovery?: number; recoveryGoal?: Vec };

export function heldAway(v: Vehicle, memory: StallMemory, goal: Vec | null): boolean {
  if (!goal || !memory.lastPos || memory.recovery) return false;
  return dist(v.pos, memory.lastPos) < RULES.arriveRadius / 2 && dist(v.pos, goal) > RULES.arriveRadius * 2;
}

export function straightBack(v: Vehicle): Vec {
  const back = RULES.reverse.distance + RULES.minAimDistance;
  return { x: v.pos.x - Math.cos(v.heading) * back, y: v.pos.y - Math.sin(v.heading) * back };
}

export function startRecovery(v: Vehicle, memory: StallMemory, goal: Vec = straightBack(v)): void {
  memory.recovery = RULES.npcRecoveryTurns;
  memory.recoveryGoal = goal;
  memory.stalled = 0;
}

export function tickRecovery(memory: StallMemory): void {
  if (memory.recovery) memory.recovery--;
}

export function recoveryOrder(memory: StallMemory): MoveOrder | null {
  return memory.recovery && memory.recoveryGoal ? { kind: 'stopAt', dest: memory.recoveryGoal } : null;
}
