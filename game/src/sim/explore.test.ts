import { describe, expect, it } from 'vitest';
import { EXPLORE, NPC_BEHAVIOR } from '../data/npcs';
import { standardWorld } from '../test/world-cache';
import { explorePlace, explorePlaces } from './explore';
import { createActivity, resolveNpcActivities, topGoal } from './npc-activities';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import { dist } from './vec';

function roamerAt(w: ReturnType<typeof emptyWorld>, pos: { x: number; y: number }) {
  const npc = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], pos);
  npc.brain = npcBrain('roamer', pos, ['roamer']);
  return npc;
}

describe('explore places', () => {
  const world = standardWorld(3);
  const places = explorePlaces({ hash: world.mapHash, terrain: world.terrain });

  it('lie on the map and carry a bounded road gap', () => {
    expect(places.length).toBeGreaterThan(0);
    for (const p of places) {
      expect(p.pos.x).toBeGreaterThanOrEqual(0);
      expect(p.pos.x).toBeLessThan(world.size);
      expect(p.roadGap).toBeGreaterThanOrEqual(0);
      expect(p.roadGap).toBeLessThanOrEqual(EXPLORE.gapCap);
    }
  });

  it('include places away from the road', () => {
    expect(places.some((p) => p.roadGap > 0)).toBe(true);
  });

  it('are picked within the hop range of the driver', () => {
    const start = places[0].pos;
    const npc = roamerAt(world, { x: start.x + EXPLORE.minHop * 2, y: start.y });
    for (let i = 0; i < 20; i++) {
      const pick = explorePlace(world, npc)!;
      const hop = dist(npc.pos, pick.pos);
      expect(hop).toBeGreaterThanOrEqual(EXPLORE.minHop);
      expect(hop).toBeLessThanOrEqual(EXPLORE.range);
    }
  });

  it('prefer places farther from the road', () => {
    const inRangeOf = (pos: { x: number; y: number }) => places.filter((p) => dist(pos, p.pos) >= EXPLORE.minHop && dist(pos, p.pos) <= EXPLORE.range);
    const start = places.map((p) => ({ x: p.pos.x, y: p.pos.y + EXPLORE.minHop })).find((pos) => new Set(inRangeOf(pos).map((p) => p.roadGap)).size > 1);
    expect(start).toBeDefined();
    const npc = roamerAt(world, start!);
    const gaps: number[] = [];
    for (let i = 0; i < 200; i++) gaps.push(explorePlace(world, npc)!.roadGap);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(gaps)).toBeGreaterThan(mean(inRangeOf(start!).map((p) => p.roadGap)));
  });

  it('give nothing when no place lies in range', () => {
    const w = emptyWorld({ x: 50, y: 50 });
    const npc = roamerAt(w, { x: 10, y: 10 });
    expect(explorePlace(w, npc)).toBeNull();
  });

  it('are picked the same for the same seed', () => {
    const a = standardWorld(3);
    const b = standardWorld(3);
    const start = places[0].pos;
    const na = roamerAt(a, { x: start.x + EXPLORE.minHop * 2, y: start.y });
    const nb = roamerAt(b, { x: start.x + EXPLORE.minHop * 2, y: start.y });
    expect(explorePlace(a, na)?.id).toBe(explorePlace(b, nb)?.id);
  });
});

describe('looking around', () => {
  it('lasts well under the stall limit', () => {
    expect(EXPLORE.lookTurns).toBeLessThan(NPC_BEHAVIOR.stallTurns);
  });

  it('follows arrival at an explore place and then ends', () => {
    const w = emptyWorld({ x: 100, y: 100 });
    const npc = roamerAt(w, { x: 50, y: 50 });
    npc.brain!.goals = [{ ...createActivity('explore', null, { ...npc.pos }, 'explore'), phase: 'travel' }];
    w.turn = 10;
    resolveNpcActivities(w);
    const top = topGoal(npc)!;
    expect(top.kind).toBe('wait');
    expect(top.reason).toBe('lookAround');
    expect(top.until).toBe(10 + EXPLORE.lookTurns);
    w.turn = 10 + EXPLORE.lookTurns;
    resolveNpcActivities(w);
    expect(topGoal(npc)?.reason).not.toBe('lookAround');
  });

  it('is skipped by sunward explore goals', () => {
    const w = emptyWorld({ x: 100, y: 100 });
    const npc = roamerAt(w, { x: 50, y: 50 });
    npc.brain!.goals = [{ ...createActivity('explore', null, { ...npc.pos }, 'rideHome'), phase: 'travel' }];
    resolveNpcActivities(w);
    expect(topGoal(npc)?.reason).not.toBe('lookAround');
  });
});
