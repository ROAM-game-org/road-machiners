import { describe, expect, it } from 'vitest';
import { FISHING } from '../data/fishing';
import { NPCS } from '../data/npcs';
import { advanceFar } from './far';
import { fishLeft, poolIndexOf } from './fishing';
import { getResources } from './resources';
import { suppliesCap } from './stats';
import { addVehicle, editableTerrain, emptyWorld, npcBrain } from './testkit';
import { topGoal } from './npc-activities';
import { endTurn } from './world';
import type { Vec } from './vec';
import type { Vehicle, World } from './types';

const moveAllFar = (w: World) => {
  for (const v of w.vehicles) advanceFar(w, v);
};

function pondWorld(at: Vec = { x: 40, y: 60 }): { w: World; npc: Vehicle } {
  const w = emptyWorld({ x: 5, y: 5 });
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  const terrain = editableTerrain(w);
  for (let y = 58; y < 62; y++) for (let x = 50; x < 54; x++) terrain.types[y * terrain.size + x] = 'dirtyWater';
  const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], at);
  npc.brain = npcBrain('scavenger', at, NPCS.scavenger.traits);
  const r = getResources(w, npc);
  r.money = 0;
  r.fuel = 40;
  r.supplies = 0;
  return { w, npc };
}

function run(w: World, turns: number): World {
  let next = w;
  for (let i = 0; i < turns; i++) next = endTurn(next, moveAllFar);
  return next;
}

function npcOf(w: World, id: string): Vehicle {
  return w.vehicles.find((v) => v.id === id)!;
}

describe('hungry broke drivers fishing', () => {
  it('walk to a pool, fish and gain supplies without a stall', () => {
    const { w, npc } = pondWorld();
    const goals: string[] = [];
    let next = w;
    for (let i = 0; i < 90 && getResources(next, npcOf(next, npc.id)).supplies === 0; i++) {
      next = endTurn(next, moveAllFar);
      const top = topGoal(npcOf(next, npc.id));
      if (top) goals.push(`${top.kind}:${top.reason}`);
      expect(next.events.filter((e) => e.t === 'stall')).toEqual([]);
    }
    expect(goals).toContain('fish:goFishing');
    expect(getResources(next, npcOf(next, npc.id)).supplies).toBeGreaterThan(0);
    expect(Object.values(next.fishTaken).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(getResources(next, npcOf(next, npc.id)).money).toBe(0);
  });

  it('skip a pool they fished out for a day', () => {
    const { w, npc } = pondWorld({ x: 52, y: 60 });
    const pool = poolIndexOf(w.terrain).pools[0];
    w.fishTaken[pool.id] = pool.capacity;
    let next = run(w, 120);
    expect(fishLeft(next, pool)).toBe(0);
    expect(npcOf(next, npc.id).brain!.memories.some((m) => m.fact.kind === 'fishedOut')).toBe(true);
    next = run(next, 20);
    expect(topGoal(npcOf(next, npc.id))?.kind).not.toBe('fish');
  });

  it('get no fishing goal with no pool in range', () => {
    const { w, npc } = pondWorld({ x: 5, y: 150 });
    const next = run(w, 5);
    expect(topGoal(npcOf(next, npc.id))?.kind).not.toBe('fish');
    expect(next.events.some((e) => e.t === 'job')).toBe(false);
    expect(FISHING.npcRange).toBeLessThan(90);
  });

  it('never fish when they can pay', () => {
    const { w, npc } = pondWorld();
    getResources(w, npc).money = 5000;
    const next = run(w, 120);
    expect(next.fishTaken).toEqual({});
  });

  it('never fish when fed', () => {
    const { w, npc } = pondWorld();
    getResources(w, npc).supplies = suppliesCap(npc);
    const next = run(w, 60);
    expect(next.fishTaken).toEqual({});
  });
});
