import { beforeAll, describe, expect, it } from 'vitest';
import { NPC_BEHAVIOR } from '../data/npcs';
import { addGoods } from '../sim/inventory';
import { climbGrade } from '../sim/stats';
import { addVehicle, editableTerrain, emptyWorld, npcBrain } from '../sim/testkit';
import type { Vec } from '../sim/vec';
import { dist } from '../sim/vec';
import type { Vehicle, World } from '../sim/types';
import { endTurn } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const WALL = 0.58;
const LIGHT_WALL = 0.5;
const MOUTH = 0.15;
const FOOT = 45;
const TOP = 3.3;
const GOAL: Vec = { x: 85, y: 40 };
const START: Vec = { x: 42, y: 40 };
const FAR: Vec = { x: 200, y: 200 };

function raise(w: World, height: (i: number, j: number) => number): void {
  const t = editableTerrain(w);
  const n = t.size;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) t.heights[j * (n + 1) + i] = height(i, j);
}

function ravineWithMouth(wall: number): (i: number, j: number) => number {
  return (i, j) => {
    const mix = Math.min(1, Math.max(0, (j - 60) / 10));
    const grade = wall + (MOUTH - wall) * mix;
    return Math.min(TOP, Math.max(0, (i - FOOT) * grade));
  };
}

function closedPit(i: number, j: number): number {
  const out = Math.hypot(i - 40, j - 40) - 6;
  return Math.min(TOP, Math.max(0, out * WALL));
}

function trucker(w: World, build: 'hauler' | 'scout'): Vehicle {
  const npc = build === 'hauler' ? addVehicle(w, 'traders', 'hauler', ['mg', 'stockEngine', 'plates', 'trailerBox'], START) : addVehicle(w, 'traders', 'buggy', ['stockEngine'], START);
  npc.brain = npcBrain('trader', START, ['trader']);
  npc.brain.goals = [{ kind: 'explore', targetId: null, destination: { ...GOAL }, reason: 'explore', phase: 'travel' }];
  if (build === 'hauler') addGoods(w, npc, 'scrap', 122);
  return npc;
}

type Run = { w: World; arrived: number | null; trail: Vec[]; stalls: number; jumped: boolean; goalChanged: boolean };

function run(w: World, id: string, turns: number): Run {
  let d: Drive = buildDrive(w);
  const out: Run = { w, arrived: null, trail: [], stalls: 0, jumped: false, goalChanged: false };
  const first = w.vehicles.find((v) => v.id === id)!.brain!.goals[0];
  for (let i = 0; i < turns && out.arrived === null; i++) {
    let next: Drive | null = null;
    const before = out.w.vehicles.find((v) => v.id === id)!.pos;
    out.w = endTurn(out.w, physicsMove(d, (r) => (next = r.next)));
    freeDrive(d);
    d = next!;
    const npc = out.w.vehicles.find((v) => v.id === id)!;
    out.trail.push({ ...npc.pos });
    out.stalls += out.w.events.filter((e) => e.t === 'stall' && e.vehicle === id).length;
    if (dist(before, npc.pos) > 12) out.jumped = true;
    if (npc.brain!.goals[0] !== first && npc.brain!.goals[0]?.destination !== first.destination) out.goalChanged = true;
    if (dist(npc.pos, GOAL) < 6) out.arrived = i + 1;
  }
  freeDrive(d);
  return out;
}

describe('a truck in a ravine', () => {
  it('the light truck plans a climb that the loaded hauler does not', () => {
    const w = emptyWorld(FAR);
    const hauler = trucker(w, 'hauler');
    const buggy = trucker(w, 'scout');
    expect(climbGrade(w, hauler)).toBeLessThan(LIGHT_WALL);
    expect(climbGrade(w, buggy)).toBeGreaterThan(LIGHT_WALL);
  });

  it('a loaded hauler drives out by the gentle mouth and reaches the goal', () => {
    const w = emptyWorld(FAR);
    raise(w, ravineWithMouth(WALL));
    const npc = trucker(w, 'hauler');
    const r = run(w, npc.id, 60);
    expect(r.arrived).not.toBeNull();
    expect(r.stalls).toBe(0);
    expect(Math.max(...r.trail.map((p) => p.y))).toBeGreaterThan(60);
  }, 300_000);

  it('a light truck takes the wall directly', () => {
    const w = emptyWorld(FAR);
    raise(w, ravineWithMouth(LIGHT_WALL));
    const npc = trucker(w, 'scout');
    const r = run(w, npc.id, 60);
    expect(r.arrived).not.toBeNull();
    expect(Math.max(...r.trail.map((p) => p.y))).toBeLessThan(55);
  }, 300_000);

  it('a loaded hauler in a closed pit raises a stall and changes its goal without being moved in sight', () => {
    const w = emptyWorld({ x: 40, y: 44 });
    raise(w, closedPit);
    const npc = trucker(w, 'hauler');
    const r = run(w, npc.id, NPC_BEHAVIOR.stallTurns + 5);
    expect(r.stalls).toBeGreaterThan(0);
    expect(r.goalChanged).toBe(true);
    expect(r.jumped).toBe(false);
  }, 300_000);
});
