
import { PERF } from '../data/perf';
import { TERRAIN } from '../data/terrain';
import { playerVehicle } from './damage';
import type { World } from './types';
import { dist, type Vec } from './vec';

let headless = false;

export function setHeadless(on: boolean): void {
  headless = on;
}

export function isHeadless(): boolean {
  return headless;
}

let farTurn = false;

export function inFarTurn<T>(play: () => T): T {
  if (farTurn) throw new Error('A far turn began inside another far turn');
  farTurn = true;
  try {
    return play();
  } finally {
    farTurn = false;
  }
}

export function isFarTurn(): boolean {
  return farTurn;
}

export function keepsPlayerFarRoute(): boolean {
  return headless || farTurn;
}

export function inLiveRange(w: World, p: Vec): boolean {
  return !headless && dist(p, playerVehicle(w).pos) <= TERRAIN.vision.radius + PERF.liveMargin;
}

export function isCheapMeeting(w: World, a: Vec, b: Vec): boolean {
  return headless || (!inLiveRange(w, a) && !inLiveRange(w, b));
}
