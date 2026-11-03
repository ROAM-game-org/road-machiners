import { describe, expect, it } from 'vitest';
import { LINGER } from '../data/linger';
import { TIME } from '../data/time';
import type { TraitId } from '../data/npcs';
import { lingerGoal, lingerReasonNow, lootedRoadWreck } from './linger';
import { decide } from './npc-decisions';
import { goalHolds, pushGoal, resolveNpcActivities, idleGoal, topGoal } from './npc-activities';
import { ROAD_INDEX } from './road-index';
import { emptyHidden, nearestRoadPoint } from './salvage';
import { flatTerrain } from '../test/empty-world';
import { layOf } from './survey';
import { inShade, sunAt } from './sun';
import { addVehicle, emptyWorld, forceOption, npcBrain } from './testkit';
import type { Obstacle, Vehicle, World } from './types';
import { dist, type Vec } from './vec';

function turnAt(hour: number): number {
  return Math.ceil(1 + ((hour - TIME.startHour) * TIME.turnsPerDay) / 24);
}

function scene(traits: TraitId[], pos: Vec = { x: 40, y: 30 }): { w: World; npc: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  w.salvage = [];
  w.weather = [];
  const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], pos);
  npc.brain = npcBrain(traits[0], npc.pos, traits, 'kind');
  return { w, npc };
}

function addRoadWreck(w: World, pos: Vec, looted: boolean): Obstacle {
  const wreck: Obstacle = { id: 'wreck9001', kind: 'wreck', pos, r: 1.2 };
  w.obstacles = [...w.obstacles, wreck];
  w.salvage.push({ id: wreck.id, pos, radius: 0.6, goods: {}, parts: [], hidden: looted ? emptyHidden() : { ...emptyHidden(), goods: { scrap: 2 } } });
  return wreck;
}

function raiseHill(w: World, top: Vec): void {
  const terrain = flatTerrain(w.size);
  for (let j = 0; j <= w.size; j++) {
    for (let i = 0; i <= w.size; i++) {
      const d2 = (i - top.x) ** 2 + (j - top.y) ** 2;
      terrain.heights[j * (w.size + 1) + i] = 4 * Math.exp(-d2 / (2 * 8 * 8));
    }
  }
  w.terrain = terrain;
}

function hillBesideRoad(): Vec {
  const road = nearestRoadPoint({ x: 400, y: 400 });
  const top = { x: Math.round(road.x + 4), y: Math.round(road.y) };
  if (ROAD_INDEX.nearestWithin(top.x, top.y, LINGER.sunsetRoadReach) === Infinity) throw new Error('The hill is too far from the road');
  return top;
}

describe('lingering drivers', () => {
  it('opens each reason only in its window of the day', () => {
    const { w, npc } = scene(['roamer']);
    w.turn = turnAt(7.5);
    expect(lingerReasonNow(w, npc)).toBe('tendGrave');
    w.turn = turnAt(12);
    expect(lingerReasonNow(w, npc)).toBe('restShade');
    w.turn = turnAt(19.5);
    expect(lingerReasonNow(w, npc)).toBe('watchSunset');
    w.turn = turnAt(17);
    expect(lingerReasonNow(w, npc)).toBeNull();
  });

  it('keeps raiders, lawmen and guards at their work', () => {
    for (const trait of ['raider', 'lawman', 'guard'] as TraitId[]) {
      const { w, npc } = scene([trait]);
      w.turn = turnAt(12);
      expect(lingerReasonNow(w, npc)).toBeNull();
    }
  });

  it('hides the sunset behind an overcast sky', () => {
    const { w, npc } = scene(['roamer']);
    w.turn = turnAt(19.5);
    w.weather = [{ id: 'oc', kind: 'overcast', turnsLeft: 50 }];
    expect(lingerReasonNow(w, npc)).toBeNull();
  });

  it('tends a looted road wreck in the morning and parks beside it', () => {
    const { w, npc } = scene(['roamer']);
    const wreck = addRoadWreck(w, { x: 48, y: 30 }, true);
    w.turn = turnAt(7.5);
    const goal = lingerGoal(w, npc)!;
    expect(goal).toMatchObject({ kind: 'wait', reason: 'tendGrave', targetId: wreck.id });
    expect(dist(goal.destination!, wreck.pos)).toBeCloseTo(wreck.r + LINGER.graveGap, 5);
    expect(goal.until).toBeGreaterThan(w.turn);
    expect(goal.until).toBeLessThanOrEqual(w.turn + LINGER.maxTurns.tendGrave);
  });

  it('passes a wreck that still holds salvage', () => {
    const { w, npc } = scene(['roamer']);
    addRoadWreck(w, { x: 48, y: 30 }, false);
    w.turn = turnAt(7.5);
    expect(lingerGoal(w, npc)).toBeNull();
  });

  it('finds noon shade by a building', () => {
    const { w, npc } = scene(['roamer'], { x: 43, y: 38 });
    w.obstacles = [...w.obstacles, { id: 'shed-1', kind: 'building', pos: { x: 43, y: 30 }, r: 2 }];
    w.turn = turnAt(12);
    const goal = lingerGoal(w, npc)!;
    expect(goal.reason).toBe('restShade');
    expect(inShade(w, goal.destination!, sunAt(w.turn)!)).toBe(true);
  });

  it('climbs a rise near a road for the sunset', () => {
    const top = hillBesideRoad();
    const { w, npc } = scene(['roamer'], { x: top.x - 8, y: top.y });
    raiseHill(w, top);
    w.turn = turnAt(19.5);
    const goal = lingerGoal(w, npc)!;
    expect(goal.reason).toBe('watchSunset');
    expect(layOf(w.terrain, goal.destination!)).toBe('rise');
    expect(dist(goal.destination!, npc.pos)).toBeLessThanOrEqual(LINGER.searchRadius.watchSunset);
  });

  it('becomes the idle goal when the decision picks it', () => {
    const { w, npc } = scene(['roamer']);
    addRoadWreck(w, { x: 48, y: 30 }, true);
    w.turn = turnAt(7.5);
    forceOption('idle', 'linger');
    expect(idleGoal(w, npc)).toMatchObject({ kind: 'wait', reason: 'tendGrave' });
  });

  it('chooses other work when no spot fits', () => {
    const { w, npc } = scene(['roamer']);
    w.turn = turnAt(7.5);
    forceOption('idle', 'linger');
    expect(lingerGoal(w, npc)).toBeNull();
    for (let i = 0; i < 20; i++) expect(decide(w, npc, 'idle', null, null, ['linger'])).not.toBe('linger');
  });

  it('parks, waits out the window and drives on', () => {
    const { w, npc } = scene(['roamer']);
    addRoadWreck(w, { x: 48, y: 30 }, true);
    w.turn = turnAt(7.5);
    const goal = lingerGoal(w, npc)!;
    pushGoal(w, npc, goal);
    npc.pos = { ...goal.destination! };
    npc.speed = 0;
    resolveNpcActivities(w);
    expect(topGoal(npc)).toMatchObject({ reason: 'tendGrave', phase: 'act' });
    w.turn = goal.until!;
    resolveNpcActivities(w);
    expect(topGoal(npc)).toBeNull();
  });

  it('gives up the wreck once it is gone or restocked', () => {
    const { w, npc } = scene(['roamer']);
    const wreck = addRoadWreck(w, { x: 48, y: 30 }, true);
    w.turn = turnAt(7.5);
    const goal = lingerGoal(w, npc)!;
    pushGoal(w, npc, goal);
    expect(goalHolds(w, npc, goal)).toBe(true);
    w.salvage = w.salvage.filter((s) => s.id !== wreck.id);
    expect(lootedRoadWreck(w, wreck.id)).toBe(false);
    expect(goalHolds(w, npc, goal)).toBe(false);
  });
});
