import { describe, expect, it } from 'vitest';
import { PERF } from '../data/perf';
import { RULES } from '../data/rules';
import { TERRAIN } from '../data/terrain';
import { givesWayTo, planNpcOrders, routeBlockers, settleMeetings, trafficStops, yieldsToTraffic } from './ai';
import { topGoal } from './npc-activities';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import { startEscort } from './tow';
import type { Vehicle, World } from './types';
import { dist } from './vec';

function lowerIdFirst(first: Vehicle, second: Vehicle): void {
  if (first.id < second.id) return;
  [first.id, second.id] = [second.id, first.id];
}

describe('NPC driving', () => {
  it('uses the obstacle-aware driver on every turn', () => {
    const w = emptyWorld({ x: 40, y: 30 });
    const npc = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 30, y: 30 });
    npc.brain = npcBrain('buggy', npc.pos, ['raider']);
    planNpcOrders(w);
    expect(npc.direct).toBe(false);
  });

  it('a parked truck ahead whose loot is gone before it thinks gives no face off', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const first = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 100, y: 100 });
    first.brain = npcBrain('trader', first.pos, ['trader']);
    first.heading = 0;
    const second = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 103, y: 100 });
    second.brain = npcBrain('trader', second.pos, ['trader']);
    second.heading = Math.PI;
    second.brain.goals.push({ kind: 'loot', targetId: 'cargo-gone', destination: { x: 130, y: 100 }, phase: 'travel', reason: 'takeHandedCargo' });
    lowerIdFirst(first, second);
    planNpcOrders(w);
    expect(topGoal(second)?.kind).not.toBe('loot');
  });
});

describe('face offs', () => {
  function noseToNose(): { w: World; first: Vehicle; second: Vehicle } {
    const w = emptyWorld({ x: 30, y: 30 });
    const first = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 100, y: 100 });
    first.brain = npcBrain('trader', first.pos, ['trader']);
    first.heading = 0;
    first.brain.goals.push({ kind: 'explore', targetId: null, destination: { x: 150, y: 100 }, phase: 'travel', reason: 'tripToSite' });
    const second = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 104, y: 100 });
    second.brain = npcBrain('trader', second.pos, ['trader']);
    second.heading = Math.PI;
    lowerIdFirst(first, second);
    return { w, first, second };
  }

  it('of two parked trucks that both set off, only the higher id drives on the first turn', () => {
    const { w, first, second } = noseToNose();
    second.brain!.goals.push({ kind: 'explore', targetId: null, destination: { x: 40, y: 100 }, phase: 'travel', reason: 'tripToSite' });
    planNpcOrders(w);
    expect(first.order?.kind).toBe('brake');
    expect(second.order?.kind).toBe('stopAt');
  });

  it('a driver waits for a parked truck ahead that holds a move order', () => {
    const { w, first, second } = noseToNose();
    second.order = { kind: 'stopAt', dest: { x: 60, y: 100 } };
    expect(trafficStops(w, first, { x: 150, y: 100 })).toBe(true);
  });

  it('a driver does not wait for a parked truck ahead that holds no move order, like one waiting for a tow', () => {
    const { w, first, second } = noseToNose();
    second.brain!.goals.push({ kind: 'resupply', targetId: 'bowl', destination: { x: 60, y: 100 }, phase: 'travel', reason: 'lowFuel' });
    second.order = null;
    expect(trafficStops(w, first, { x: 150, y: 100 })).toBe(false);
  });
});

function scene(x: number, y: number, heading: number, speed: number): { w: World; npc: Vehicle } {
  const w = emptyWorld({ x, y });
  const me = w.vehicles[0];
  me.heading = heading;
  me.speed = speed;
  const npc = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 100, y: 100 });
  npc.brain = npcBrain('trader', npc.pos, ['trader']);
  npc.heading = 0;
  npc.speed = 4;
  settleMeetings(w);
  return { w, npc };
}

const DEST = { x: 130, y: 100 };

function corridor(w: World): void {
  for (let x = 90; x <= 140; x++) {
    w.obstacles = [...w.obstacles, { id: `n${x}`, kind: 'rock', pos: { x, y: 97 }, r: 1 }, { id: `s${x}`, kind: 'rock', pos: { x, y: 103 }, r: 1 }];
  }
}

describe('the player on a route in traffic', () => {
  function meeting(): { w: World; me: Vehicle; npc: Vehicle } {
    const { w, npc } = scene(118, 100, Math.PI, 7);
    const me = w.vehicles[0];
    me.pos = { x: 100, y: 100 };
    me.heading = 0;
    me.speed = 4;
    npc.pos = { x: 114, y: 100.5 };
    npc.heading = Math.PI;
    npc.speed = 4;
    npc.brain!.goals.push({ kind: 'explore', targetId: null, destination: { x: 60, y: 100 }, phase: 'travel', reason: 'tripToSite' });
    npc.order = { kind: 'through', dest: { x: 60, y: 100 }, pace: 4 };
    me.order = { kind: 'through', dest: DEST, pace: 4 };
    settleMeetings(w);
    return { w, me, npc };
  }

  it('the lower id goes around and the other holds its line', () => {
    const { w, me, npc } = meeting();
    expect(me.id < npc.id).toBe(true);
    expect(yieldsToTraffic(w, me)).toBe(false);
    expect(routeBlockers(w, me).length).toBeGreaterThan(1);
    expect(routeBlockers(w, npc).every((b) => b.pos === me.pos)).toBe(true);
    expect(trafficStops(w, npc, { x: 60, y: 100 })).toBe(false);
  });

  it('the lower id still brakes when the way around is blocked', () => {
    const { w, me } = meeting();
    corridor(w);
    expect(yieldsToTraffic(w, me)).toBe(true);
  });

  it('a stopped player does not wait for a truck passing five tiles to the side', () => {
    const { w, me, npc } = meeting();
    me.speed = 0;
    npc.pos = { x: 110, y: 105 };
    expect(yieldsToTraffic(w, me)).toBe(false);
  });

  it('a stopped player does not wait for a truck crossing far ahead', () => {
    const { w, me, npc } = meeting();
    me.speed = 0;
    npc.pos = { x: 112, y: 94 };
    npc.heading = Math.PI / 2;
    expect(yieldsToTraffic(w, me)).toBe(false);
  });

  it('keeps its order while it waits', () => {
    const { w, me } = meeting();
    const before = structuredClone(me.order);
    yieldsToTraffic(w, me);
    expect(me.order).toEqual(before);
  });

  it('never yields when driven by hand', () => {
    const { w, me } = meeting();
    me.direct = true;
    expect(yieldsToTraffic(w, me)).toBe(false);
  });

  it('never yields to a NPC driver, which holds its own brake order', () => {
    const { w, npc } = meeting();
    expect(yieldsToTraffic(w, npc)).toBe(false);
  });
});

describe('crossing traffic', () => {
  it.each([
    ['converging from 70 degrees to the side', -Math.PI / 2, true],
    ['diverging at the same angle', Math.PI / 2, false],
  ])('counts a truck as a conflict only when its path meets: %s', (_name, heading, avoids) => {
    const w = emptyWorld({ x: 60, y: 60 });
    const subject = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 100, y: 100 });
    subject.brain = npcBrain('trader', subject.pos, ['trader']);
    subject.heading = 0;
    subject.speed = 4;
    const other = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 100 + 6 * Math.cos(1.22), y: 100 + 6 * Math.sin(1.22) }, heading);
    other.brain = npcBrain('trader', other.pos, ['trader']);
    other.speed = 4;
    expect(routeBlockers(w, subject).filter((b) => dist(b.pos, w.vehicles[0].pos) > 0).length > 0).toBe(avoids);
  });
});

describe('NPC traffic', () => {
  it.each([
    ['oncoming in its lane', 118, 100, Math.PI, 7, true],
    ['crossing into its path', 108, 94, Math.PI / 2, 4, true],
    ['oncoming 4 tiles to the side', 118, 104, Math.PI, 7, false],
    ['crossing ahead and driving off to the side', 110, 104, Math.PI / 2, 7, false],
    ['ahead in the next lane, slower', 106, 103, 0, 2, false],
  ])('routes around a moving truck only when their paths meet: %s', (_name, x, y, heading, speed, avoids) => {
    const { w, npc } = scene(x, y, heading, speed);
    w.vehicles[0].direct = true;
    expect(routeBlockers(w, npc).length > 0).toBe(avoids);
  });

  it.each([
    ['oncoming in its lane', 118, 100, Math.PI, 7],
    ['crossing into its path', 108, 94, Math.PI / 2, 4],
  ])('keeps driving on open ground: %s', (_name, x, y, heading, speed) => {
    const { w, npc } = scene(x, y, heading, speed);
    expect(trafficStops(w, npc, DEST)).toBe(false);
  });

  it('stops when an oncoming truck that gives no way fills its only lane', () => {
    const { w, npc } = scene(112, 100, Math.PI, 5);
    w.vehicles[0].direct = true;
    corridor(w);
    expect(trafficStops(w, npc, DEST)).toBe(true);
  });

  it('holds its line for an oncoming truck that gives way, even in its only lane', () => {
    const { w, npc } = scene(112, 100, Math.PI, 5);
    corridor(w);
    expect(trafficStops(w, npc, DEST)).toBe(false);
  });

  it('stops behind a slower truck in its only lane', () => {
    const { w, npc } = scene(106, 100, 0, 2);
    corridor(w);
    expect(trafficStops(w, npc, DEST)).toBe(true);
  });

  it('overtakes a slower truck ahead on open ground', () => {
    const { w, npc } = scene(106, 100, 0, 2);
    expect(routeBlockers(w, npc).length).toBeGreaterThan(0);
    expect(trafficStops(w, npc, DEST)).toBe(false);
  });

  it('routes around the stretch a truck ahead still covers when the driver gets there', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const driver = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { x: 100, y: 100 }, (-53 * Math.PI) / 180);
    driver.brain = npcBrain('scavenger', driver.pos, ['scavenger']);
    driver.speed = 5.73;
    const ahead = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { x: 100.35, y: 96.19 }, (-9 * Math.PI) / 180);
    ahead.brain = npcBrain('roamer', ahead.pos, ['roamer']);
    ahead.speed = 4.19;
    const merge = { x: ahead.pos.x + Math.cos(ahead.heading) * 2.3, y: ahead.pos.y + Math.sin(ahead.heading) * 2.3 };
    expect(routeBlockers(w, driver).some((b) => dist(b.pos, merge) <= b.r)).toBe(true);
  });

  it('a far driver does not stop for a moving truck, since far travel stops short of any truck in its way', () => {
    const oncoming = (playerAt: { x: number; y: number }) => {
      const { w, npc } = scene(playerAt.x, playerAt.y, 0, 0);
      corridor(w);
      const other = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 112, y: 100 }, Math.PI);
      other.brain = npcBrain('trader', other.pos, ['trader']);
      other.speed = 5;
      return trafficStops(w, npc, DEST);
    };
    expect(oncoming({ x: 100, y: 110 })).toBe(true);
    expect(oncoming({ x: 100, y: 100 + TERRAIN.vision.radius + PERF.liveMargin + 10 })).toBe(false);
  });

  it('the player routes around the swept path of an oncoming trader', () => {
    const w = emptyWorld({ x: 100, y: 100 });
    const me = w.vehicles[0];
    me.speed = 4;
    const npc = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 118, y: 100 }, Math.PI);
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    npc.speed = 7;
    expect(routeBlockers(w, me).length).toBeGreaterThan(0);
  });

  it('a brainless truck the player does not drive routes around parked vehicles only', () => {
    const w = emptyWorld({ x: 100, y: 100 });
    const hauler = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 100, y: 120 }, 0);
    hauler.speed = 4;
    const npc = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 118, y: 120 }, Math.PI);
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    npc.speed = 7;
    expect(routeBlockers(w, hauler)).toEqual([{ pos: w.vehicles[0].pos, r: expect.any(Number) }]);
  });
});

describe('oncoming NPCs', () => {
  function headOn(): { w: World; first: Vehicle; second: Vehicle } {
    const w = emptyWorld({ x: 100, y: 130 });
    const first = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 100, y: 100 });
    first.brain = npcBrain('trader', first.pos, ['trader']);
    first.heading = 0;
    first.speed = 4;
    first.brain.goals.push({ kind: 'explore', targetId: null, destination: { x: 150, y: 100 }, phase: 'travel', reason: 'tripToSite' });
    const second = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 114, y: 100.5 }, Math.PI);
    second.brain = npcBrain('trader', second.pos, ['trader']);
    second.speed = 4;
    second.brain.goals.push({ kind: 'explore', targetId: null, destination: { x: 50, y: 100 }, phase: 'travel', reason: 'tripToSite' });
    lowerIdFirst(first, second);
    settleMeetings(w);
    return { w, first, second };
  }

  it('of two NPCs closing head-on, the lower id goes around and the higher holds its line', () => {
    const { w, first, second } = headOn();
    planNpcOrders(w);
    expect(first.order?.kind).not.toBe('brake');
    expect(second.order?.kind).toBe('stopAt');
    expect(routeBlockers(w, first).some((b) => dist(b.pos, second.pos) < 0.5)).toBe(true);
    expect(routeBlockers(w, second).some((b) => dist(b.pos, first.pos) < 0.5)).toBe(false);
  });

  it('of two NPCs head-on in a corridor with no way around, the lower id brakes', () => {
    const { w, first, second } = headOn();
    corridor(w);
    planNpcOrders(w);
    expect(first.order?.kind).toBe('brake');
    expect(second.order?.kind).toBe('stopAt');
  });

  it('a lower id at rest sets off around the higher id closing on it', () => {
    const w = emptyWorld({ x: 270, y: 190 });
    const first = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { x: 268.77, y: 160.4 }, (-40.78 * Math.PI) / 180);
    first.brain = npcBrain('scavenger', first.pos, ['scavenger']);
    first.brain.goals.push({ kind: 'explore', targetId: null, destination: { x: 317, y: 102.75 }, phase: 'travel', reason: 'tripToSite' });
    const second = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { x: 270.6, y: 156.71 }, (141.44 * Math.PI) / 180);
    second.brain = npcBrain('roamer', second.pos, ['roamer']);
    second.speed = 3.22;
    second.brain.goals.push({ kind: 'explore', targetId: null, destination: { x: 223.7, y: 194.2 }, phase: 'travel', reason: 'tripToSite' });
    lowerIdFirst(first, second);
    settleMeetings(w);
    planNpcOrders(w);
    expect(first.order?.kind).not.toBe('brake');
    expect(second.order?.kind).toBe('stopAt');
  });

  it('a lower id at rest sets off when the higher id passes in the next lane', () => {
    const { w, first, second } = headOn();
    first.speed = 0;
    second.pos = { x: 107, y: 104 };
    planNpcOrders(w);
    expect(first.order?.kind).toBe('stopAt');
  });

  it.each(['first', 'second'] as const)('a fleeing truck is not yielded to and does not yield: %s flees', (who) => {
    const { w, first, second } = headOn();
    const fleer = who === 'first' ? first : second;
    fleer.brain!.goals.push({ kind: 'flee', targetId: null, destination: { x: 100, y: 60 }, phase: 'travel', reason: 'escapeAttacker' });
    expect(trafficStops(w, first, DEST)).toBe(false);
  });

  it('a far pair does not use the rule', () => {
    const { w, first } = headOn();
    w.vehicles[0].pos = { x: 100, y: 100 + TERRAIN.vision.radius + PERF.liveMargin + 10 };
    expect(trafficStops(w, first, DEST)).toBe(false);
  });

  it('a truck behind on the same heading does not make the leader brake', () => {
    const { w, first, second } = headOn();
    second.pos = { x: 94, y: 100 };
    second.heading = 0;
    second.speed = 5;
    expect(trafficStops(w, first, DEST)).toBe(false);
  });
});

describe('getting unstuck', () => {
  function waitingLeader(): { w: World; leader: Vehicle } {
    const w = emptyWorld({ x: 30, y: 30 });
    const leader = addVehicle(w, 'bowl', 'hauler', ['mg', 'workhorseDiesel'], { x: 100, y: 100 });
    leader.brain = npcBrain('convoy', leader.pos, ['supplier']);
    leader.brain.goals = [{ kind: 'explore', targetId: null, destination: { x: 170, y: 100 }, phase: 'travel', reason: 'tripToSite' }];
    const guard = addVehicle(w, 'bowl', 'scout', ['mg', 'stockEngine'], { x: 60, y: 100 });
    guard.brain = npcBrain('convoyGuard', guard.pos, ['guard']);
    startEscort(w, guard, leader, null, 0);
    return { w, leader };
  }

  it('a driver held in place drives to a free spot nearby after the unstick wait', () => {
    const { w, leader } = waitingLeader();
    for (let i = 0; i < RULES.unstick.turns; i++) {
      planNpcOrders(w);
      expect(leader.order?.kind).toBe('brake');
    }
    planNpcOrders(w);
    expect(leader.order?.kind).toBe('stopAt');
    const spot = leader.order!.kind === 'stopAt' ? leader.order!.dest : null;
    expect(dist(spot!, leader.pos)).toBeLessThanOrEqual(RULES.unstick.reach);
  });

  it('a driver parked on its goal point never counts as stuck', () => {
    const { w, leader } = waitingLeader();
    leader.brain!.goals[0].destination = { ...leader.pos };
    for (let i = 0; i < RULES.unstick.turns * 2; i++) planNpcOrders(w);
    expect(leader.brain!.recovery ?? 0).toBe(0);
  });
});

describe('meetings', () => {
  function faceOff(order: 'lowFirst' | 'highFirst', gap = 13): { w: World; low: Vehicle; high: Vehicle } {
    const w = emptyWorld({ x: 100, y: 130 });
    const wagon = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 100, y: 100 }, 0);
    const van = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 100 + gap, y: 100 }, Math.PI);
    wagon.brain = npcBrain('trader', wagon.pos, ['trader']);
    van.brain = npcBrain('trader', van.pos, ['trader']);
    wagon.speed = 2.1;
    van.speed = 4.14;
    wagon.order = { kind: 'through', dest: { x: 160, y: 100 } };
    van.order = { kind: 'through', dest: { x: 40, y: 100 } };
    const [low, high] = order === 'lowFirst' ? [wagon, van] : [van, wagon];
    if (low.id > high.id) [low.id, high.id] = [high.id, low.id];
    return { w, low, high };
  }

  const bothOrders = ['lowFirst', 'highFirst'] as const;

  it.each(bothOrders)('of two trucks that would both swerve for each other, exactly one gives way: %s', (order) => {
    const { w, low, high } = faceOff(order);
    settleMeetings(w);
    expect(givesWayTo(w, low, high)).toBe(true);
    expect(givesWayTo(w, high, low)).toBe(false);
    expect(routeBlockers(w, low).some((b) => dist(b.pos, high.pos) < 0.5)).toBe(true);
    expect(routeBlockers(w, high).some((b) => dist(b.pos, low.pos) < 0.5)).toBe(false);
  });

  it('the role holds while the giver swerve points it away', () => {
    const { w, low, high } = faceOff('lowFirst');
    settleMeetings(w);
    low.heading += 0.6;
    settleMeetings(w);
    expect(givesWayTo(w, low, high)).toBe(true);
    expect(routeBlockers(w, low).some((b) => dist(b.pos, high.pos) < 0.5)).toBe(true);
    expect(routeBlockers(w, high).some((b) => dist(b.pos, low.pos) < 0.5)).toBe(false);
  });

  it('the role ends when the trucks have passed each other', () => {
    const { w, low, high } = faceOff('lowFirst');
    settleMeetings(w);
    [low.pos, high.pos] = [{ x: 108, y: 100 }, { x: 104, y: 100 }];
    settleMeetings(w);
    expect(low.yieldsTo).toBeUndefined();
    expect(givesWayTo(w, low, high)).toBe(false);
  });

  it('the role ends when the trucks part beyond swerve reach', () => {
    const { w, low, high } = faceOff('lowFirst');
    settleMeetings(w);
    high.pos = { x: 160, y: 100 };
    settleMeetings(w);
    expect(low.yieldsTo).toBeUndefined();
  });

  it('no role starts between trucks that are far apart', () => {
    const { w, low } = faceOff('lowFirst', 90);
    settleMeetings(w);
    expect(low.yieldsTo).toBeUndefined();
  });

  it('the role ends when a truck takes a fight goal', () => {
    const { w, low, high } = faceOff('lowFirst');
    settleMeetings(w);
    high.brain!.goals.push({ kind: 'fight', targetId: low.id, destination: low.pos, phase: 'travel', reason: 'attackTarget' } as never);
    expect(givesWayTo(w, low, high)).toBe(false);
    settleMeetings(w);
    expect(low.yieldsTo).toBeUndefined();
  });

  it('the role ends when the holder is removed', () => {
    const { w, low, high } = faceOff('lowFirst');
    settleMeetings(w);
    w.vehicles = w.vehicles.filter((x) => x !== high);
    settleMeetings(w);
    expect(low.yieldsTo).toBeUndefined();
  });

  it('a stored role with the giver id above the holder id throws', () => {
    const { w, low, high } = faceOff('lowFirst');
    high.yieldsTo = [low.id];
    expect(() => settleMeetings(w)).toThrow();
  });

  it('the player on a route follows the same role', () => {
    const { w, low, high } = faceOff('lowFirst');
    low.brain = null;
    w.player.vehicleId = low.id;
    settleMeetings(w);
    expect(givesWayTo(w, low, high)).toBe(true);
    w.player.vehicleId = high.id;
    low.brain = npcBrain('trader', low.pos, ['trader']);
    high.brain = null;
    expect(givesWayTo(w, low, high)).toBe(true);
  });
});
