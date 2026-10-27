
import { PERF } from '../data/perf';
import { TERRAIN } from '../data/terrain';
import { playerVehicle } from './damage';
import type { Vehicle, World } from './types';
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

let thinning = false;

export function setThinning(on: boolean): void {
  thinning = on;
}

export function thinksThisTurn(w: World, v: Vehicle): boolean {
  if (!thinning || (w.turn + slotOf(v.id)) % PERF.lone.every === 0) return true;
  return dist(v.pos, playerVehicle(w).pos) <= PERF.lone.playerReach || hasCompany(w, v);
}

function slotOf(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return sum;
}

function hasCompany(w: World, v: Vehicle): boolean {
  if (v.brain && Object.keys(v.brain.attackers).length > 0) return true;
  if (w.states.some((s) => s.holder === v.id || s.other === v.id)) return true;
  return w.vehicles.some((o) => o.id !== v.id && dist(o.pos, v.pos) <= PERF.lone.reach);
}
