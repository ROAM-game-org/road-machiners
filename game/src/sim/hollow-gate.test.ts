import { describe, expect, it } from 'vitest';
import { HOLLOW } from '../data/sunward';
import { standardWorld } from '../test/world-cache';
import { playerVehicle } from './damage';
import { insideCurtain } from './fortress';
import { gatePassing, hollowGateLeaf, hollowGateOccupied, hollowGatePose, hollowGateShut, hollowGateWanted, isHollowGate, passesHollowGate, swingHollowGate } from './hollow-gate';
import { route } from './path';
import { rigBoxes } from './rig';
import { duskTurn, hollowBays, hollowObstacles, isHollowObstacle } from './sunward';
import { addState } from './states';
import { addVehicle, furyRoadWorld, npcBrain } from './testkit';
import type { MoveOrder, Vehicle, World } from './types';
import { dist, type Vec } from './vec';
import { refreshVision } from './vision';

const ALONG_GATE = dist(HOLLOW.pos, hollowGatePose().pos);

function at(along: number, across: number = 0): Vec {
  const { yaw } = hollowGatePose();
  return {
    x: HOLLOW.pos.x + Math.cos(yaw) * along - Math.sin(yaw) * across,
    y: HOLLOW.pos.y + Math.sin(yaw) * along + Math.cos(yaw) * across,
  };
}

function dayWorld(): World {
  const w = standardWorld(5);
  w.vehicles = [playerVehicle(w)];
  playerVehicle(w).pos = at(60, 40);
  w.turn = duskTurn(1) - 100;
  w.events = [];
  refreshVision(w);
  swingHollowGate(w);
  return w;
}

function member(w: World, pos: Vec, order: MoveOrder | null = null): Vehicle {
  const v = addVehicle(w, 'sunward', 'buggy', ['stockEngine'], pos, hollowGatePose().yaw);
  v.brain = npcBrain('cavalcade', hollowBays()[0], ['cultist']);
  v.order = order;
  return v;
}

function stranger(w: World, pos: Vec, order: MoveOrder | null = null): Vehicle {
  const v = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], pos, hollowGatePose().yaw);
  v.order = order;
  return v;
}

const through = (dest: Vec): MoveOrder => ({ kind: 'through', dest });

describe('the Hollow gate', () => {
  it('stands shut by day on the resting cars and holds exactly the one gate obstacle', () => {
    const w = dayWorld();
    member(w, hollowBays()[0]);
    swingHollowGate(w);
    expect(hollowGateShut(w)).toBe(true);
    expect(w.obstacles.filter(isHollowGate)).toHaveLength(1);
    expect(w.obstacles.filter(isHollowGate)[0]).toEqual(hollowGateLeaf());
    expect(hollowObstacles().some(isHollowGate)).toBe(false);
    expect(w.obstacles.filter(isHollowObstacle).length).toBe(hollowObstacles().length + 1);
  });

  it('is not built on Chaos Highway', () => {
    const w = furyRoadWorld();
    swingHollowGate(w);
    expect(w.obstacles.some(isHollowGate)).toBe(false);
  });

  it('opens for a member riding out or home within one turn of the gate, and not for one farther away', () => {
    const w = dayWorld();
    const out = member(w, at(3), through(at(40)));
    swingHollowGate(w);
    expect(hollowGateShut(w)).toBe(false);
    expect(w.obstacles.some(isHollowGate)).toBe(false);

    out.pos = at(3);
    out.order = null;
    const home = member(w, at(ALONG_GATE + 4), through(hollowBays()[0]));
    swingHollowGate(w);
    expect(hollowGateShut(w)).toBe(false);

    home.pos = at(ALONG_GATE + 60);
    swingHollowGate(w);
    expect(hollowGateShut(w)).toBe(true);
  });

  it('shuts again once the column is clear of the gateway', () => {
    const w = dayWorld();
    const car = member(w, at(3), through(at(40)));
    swingHollowGate(w);
    expect(hollowGateShut(w)).toBe(false);
    car.pos = at(ALONG_GATE + 12);
    car.order = null;
    swingHollowGate(w);
    expect(hollowGateShut(w)).toBe(true);
  });

  it('stays open while any truck overlaps the leaf footprint', () => {
    const w = dayWorld();
    const parked = stranger(w, hollowGatePose().pos);
    swingHollowGate(w);
    expect(hollowGateOccupied(w)).toBe(true);
    expect(hollowGateShut(w)).toBe(false);
    parked.pos = at(ALONG_GATE + 30);
    swingHollowGate(w);
    expect(hollowGateShut(w)).toBe(true);
  });

  it('never opens for a stranger pressed against the shut leaf from outside', () => {
    const w = dayWorld();
    const pressing = stranger(w, at(ALONG_GATE + 4), through(hollowBays()[0]));
    pressing.heading = hollowGatePose().yaw + Math.PI;
    const reach = rigBoxes(pressing)[0].half.x;
    pressing.pos = at(ALONG_GATE + 0.3 + reach);
    swingHollowGate(w);
    expect(hollowGateOccupied(w)).toBe(false);
    expect(hollowGateWanted(w)).toBe(false);
    expect(hollowGateShut(w)).toBe(true);
  });

  it('opens for the player or any truck inside the yard whose order leads out, and keeps its word for those with no order', () => {
    const w = dayWorld();
    const me = playerVehicle(w);
    me.pos = at(2);
    me.order = null;
    swingHollowGate(w);
    expect(hollowGateShut(w)).toBe(true);
    me.order = through(at(60));
    swingHollowGate(w);
    expect(hollowGateShut(w)).toBe(false);
  });

  it('opens for a rescuer holding a tow deal with a truck stranded inside, and for no stranger without one', () => {
    const w = dayWorld();
    const stranded = stranger(w, at(1));
    const tower = stranger(w, at(ALONG_GATE + 3), through(at(1)));
    swingHollowGate(w);
    expect(hollowGateShut(w)).toBe(true);
    addState(w, 'towPromise', tower.id, stranded.id, { kind: 'towPromise', site: 'bowl', fee: 0 });
    swingHollowGate(w);
    expect(passesHollowGate(w, tower)).toBe(true);
    expect(hollowGateShut(w)).toBe(false);
  });

  it('stays shut for the former members once the order has fallen', () => {
    const w = dayWorld();
    const ex = member(w, at(ALONG_GATE + 4), through(hollowBays()[0]));
    swingHollowGate(w);
    expect(hollowGateShut(w)).toBe(false);
    w.sunward!.collapsed = w.turn;
    swingHollowGate(w);
    expect(passesHollowGate(w, ex)).toBe(false);
    expect(hollowGateShut(w)).toBe(true);
  });

  it('routes a stranger to the gate and no further, and lets a member through to its bay', () => {
    const w = dayWorld();
    const bay = hollowBays()[3];
    const outsider = stranger(w, at(ALONG_GATE + 25, 6));
    const car = member(w, at(ALONG_GATE + 25, -6));
    expect(gatePassing(w, outsider)()).toBe(false);
    expect(gatePassing(w, car)()).toBe(true);
    const radius = 0.8;
    const blocked = route(w, outsider.pos, bay, radius, [], outsider);
    expect(dist(blocked.at(-1)!, bay)).toBeGreaterThan(3);
    expect(insideCurtain(HOLLOW.site, blocked.at(-1)!)).toBe(false);
    const open = route(w, car.pos, bay, radius, [], car);
    expect(dist(open.at(-1)!, bay)).toBeLessThan(1);
  });
});
