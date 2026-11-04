import { beforeAll, describe, expect, it } from 'vitest';
import { RULES } from '../data/rules';
import { addVehicle, editableTerrain, emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { vehicleStats } from '../sim/stats';
import { dist } from '../sim/vec';
import { endTurn, setMoveOrder } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const LANE_Y = 100;
const GOAL = { x: 240, y: LANE_Y };
const TURNS = 10;

function column(leaderPace: number): { w: World; leaderId: string } {
  const w = emptyWorld({ x: 100, y: LANE_Y });
  editableTerrain(w).types.fill('asphalt' as 'road');
  for (let x = 90; x <= 250; x++) {
    w.obstacles = [...w.obstacles, { id: `n${x}`, kind: 'rock', pos: { x, y: LANE_Y - 3 }, r: 1 }, { id: `s${x}`, kind: 'rock', pos: { x, y: LANE_Y + 3 }, r: 1 }];
  }
  const leader = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 110, y: LANE_Y }, 0);
  leader.speed = leaderPace;
  leader.order = { kind: 'through', dest: GOAL, pace: leaderPace };
  w.vehicles[0].speed = 4;
  w.vehicles[0].heading = 0;
  w.player.fuel = 999;
  return { w: setMoveOrder(w, { kind: 'through', dest: GOAL }), leaderId: leader.id };
}

function follow(leaderPace: number): { stoppedTurns: number; impacts: number[]; closest: number } {
  let { w, leaderId } = column(leaderPace);
  let d: Drive = buildDrive(w);
  const impacts: number[] = [];
  let stoppedTurns = 0;
  let closest = Infinity;
  for (let i = 0; i < TURNS; i++) {
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(d, (r) => {
      next = r.next;
      impacts.push(...r.crashes.filter((c) => [w.vehicles[0].id, leaderId].includes(c.a) && [w.vehicles[0].id, leaderId].includes(c.b)).map((c) => c.impact));
    }));
    freeDrive(d);
    d = next!;
    const leader = w.vehicles.find((v) => v.id === leaderId)!;
    if (w.vehicles[0].speed < RULES.parkedSpeed && leader.speed >= RULES.parkedSpeed) stoppedTurns++;
    closest = Math.min(closest, dist(w.vehicles[0].pos, leader.pos) - vehicleStats(w, w.vehicles[0]).radius - vehicleStats(w, leader).radius);
  }
  freeDrive(d);
  return { stoppedTurns, impacts, closest };
}

describe('following a slower truck in a one lane road (issue 1342)', () => {
  it('keeps rolling behind a leader at 4 tiles a turn and never hits it', () => {
    const run = follow(4);
    expect(run.stoppedTurns).toBe(0);
    expect(run.impacts.filter((i) => i >= RULES.collisionMinImpact)).toEqual([]);
  });

  it('keeps a gap behind a leader slower than the old crawl floor', () => {
    const run = follow(0.6);
    expect(run.impacts.filter((i) => i >= RULES.collisionMinImpact)).toEqual([]);
    expect(run.closest).toBeGreaterThan(0);
  });
});
