import { beforeAll, describe, expect, it } from 'vitest';
import { heatAt } from './sun';
import { PERF } from '../data/perf';
import { RULES } from '../data/rules';
import { SKILL_EFFECTS } from '../data/skills';
import { TERRAIN } from '../data/terrain';
import { buildDrive, bodyState, freeDrive, initPhysics, syncDrive, TURN_STEPS, type Drive, type TurnResult } from '../phys/drive';
import { PHYSICS } from '../data/physics';
import { physicsMove } from '../phys/turn';
import { advanceFar, fuelLimit, fuelLimited, isNear, lowFuelSpeed, plainFuelSpeed, settleWoken } from './far';
import { inFarTurn } from './fidelity';
import { perfSnapshot, resetPerf } from '../perf';
import { getResources } from './resources';
import { addState } from './states';
import { fuelCap, plainMaxSpeed, unpavedTopShare, vehicleStats } from './stats';
import { addVehicle, editableTerrain, emptyWorld, npcBrain } from './testkit';
import type { Obstacle, Pose, World } from './types';
import { dist } from './vec';
import { endTurn } from './world';
import { REGION } from '../data/region';
import { roadNetworkOf } from './road-network';
import { touchesObstacle } from './mapgen';
import { drivable } from './path';

beforeAll(async () => {
  await initPhysics();
});

const LIVE = TERRAIN.vision.radius + PERF.liveMargin;

function play(w: World, n: number): { w: World; d: Drive; last: TurnResult } {
  let d = buildDrive(w);
  let last: TurnResult | null = null;
  for (let i = 0; i < n; i++) {
    let r: TurnResult | null = null;
    w = endTurn(w, physicsMove(d, (x) => (r = x)));
    freeDrive(d);
    d = r!.next;
    last = r;
  }
  return { w, d, last: last! };
}

function pathLength(trail: Pose[]): number {
  let total = 0;
  for (let i = 1; i < trail.length; i++) total += dist(trail[i - 1], trail[i]);
  return total;
}

function mixedWorld(): World {
  const w = emptyWorld();
  const near = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 40, y: 30 });
  near.order = { kind: 'through', dest: { x: 50, y: 34 } };
  const far = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 30 + LIVE + 40, y: 80 });
  far.order = { kind: 'stopAt', dest: { x: 30 + LIVE + 60, y: 90 } };
  return w;
}

describe('far NPC travel', () => {
  it('counts the player and vehicles inside sight plus the live margin as near', () => {
    const w = emptyWorld();
    const inside = addVehicle(w, 'independent', 'scout', [], { x: 30 + LIVE - 0.5, y: 30 });
    const outside = addVehicle(w, 'independent', 'scout', [], { x: 30 + LIVE + 0.5, y: 30 });
    expect(isNear(w, w.vehicles[0])).toBe(true);
    expect(isNear(w, inside)).toBe(true);
    expect(isNear(w, outside)).toBe(false);
  });

  it('gives the same turn result for the same world and orders, near and far alike (IV2)', () => {
    const a = play(mixedWorld(), 3);
    const b = play(mixedWorld(), 3);
    const pick = (w: World) => w.vehicles.map((v) => ({ id: v.id, pos: v.pos, heading: v.heading, speed: v.speed, trail: v.trail, order: v.order, fuel: getResources(w, v).fuel }));
    expect(pick(a.w)).toEqual(pick(b.w));
    expect(a.w.vehicles[2].pos).not.toEqual(mixedWorld().vehicles[2].pos);
    freeDrive(a.d);
    freeDrive(b.d);
  });

  it('keeps a body for every near vehicle and none for far ones after each sync (IV3)', () => {
    const w = mixedWorld();
    const d = buildDrive(w);
    expect(Object.keys(d.bodies).sort()).toEqual([w.vehicles[0].id, w.vehicles[1].id].sort());
    w.vehicles[1].pos = { x: 30, y: 30 + LIVE + 5 };
    syncDrive(d, w);
    expect(Object.keys(d.bodies)).toEqual([w.vehicles[0].id]);
    expect(d.memory[w.vehicles[1].id]).toBeUndefined();
    freeDrive(d);
  });

  it('simulates only near vehicles in physics', () => {
    const { w, d, last } = play(mixedWorld(), 1);
    expect(Object.keys(d.bodies).sort()).toEqual([w.vehicles[0].id, w.vehicles[1].id].sort());
    expect(w.vehicles[2].trail).toHaveLength(RULES.substeps + 1);
    freeDrive(d);
  });

  it('keeps the speed of a far vehicle whose through point lies within this turn', () => {
    const w = emptyWorld();
    const far = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 30, y: 30 + LIVE + 20 });
    far.speed = 4;
    far.order = { kind: 'through', dest: { x: 30, y: 30 + LIVE + 22 } };
    advanceFar(w, far);
    expect(far.speed).toBeCloseTo(4, 5);
  });

  it('stops a far vehicle at the map edge when its goal lies beyond it', () => {
    const w = emptyWorld();
    const far = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 120, y: 4 });
    far.speed = 2;
    far.order = { kind: 'through', dest: { x: 120, y: -17 } };
    const radius = vehicleStats(w, far).radius;
    for (let turn = 0; turn < 10 && far.order; turn++) {
      advanceFar(w, far);
      expect(far.pos.y).toBeGreaterThanOrEqual(radius);
    }
    expect(far.pos.y).toBeCloseTo(radius, 6);
  });

  it('moves a far vehicle no farther than its speed allows and burns fuel for that distance at the heat where it ends (IV4)', () => {
    const w = emptyWorld();
    const far = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 120, y: 120 });
    far.speed = 2;
    far.order = { kind: 'through', dest: { x: 200, y: 120 } };
    const s = vehicleStats(w, far);
    for (let turn = 0; turn < 4; turn++) {
      const start = { ...far.pos };
      const before = { fuel: getResources(w, far).fuel, speed: far.speed };
      advanceFar(w, far);
      const moved = pathLength(far.trail);
      expect(far.trail[0]).toMatchObject(start);
      expect(far.trail).toHaveLength(RULES.substeps + 1);
      expect(moved).toBeGreaterThan(0);
      expect(moved).toBeLessThanOrEqual(Math.max(before.speed, far.speed) + 1e-9);
      expect(far.speed).toBeLessThanOrEqual(s.maxSpeed);
      expect(far.speed).toBeLessThanOrEqual(before.speed + s.accel + 1e-9);
      expect(before.fuel - getResources(w, far).fuel).toBeCloseTo(moved * s.fuelPerTile * heatAt(w, far.pos), 9);
    }
  });

  it('holds a far truck on unpaved ground to the same top share physics drives at, and a paved road to full speed', () => {
    const topAfter = (type: 'road' | 'hardpan') => {
      const w = emptyWorld();
      const t = editableTerrain(w);
      t.types.fill(type);
      const far = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 120, y: 120 });
      far.order = { kind: 'through', dest: { x: 400, y: 120 } };
      for (let turn = 0; turn < 20; turn++) advanceFar(w, far);
      return { speed: far.speed, s: vehicleStats(w, far) };
    };
    const road = topAfter('road');
    const dirt = topAfter('hardpan');
    expect(road.speed).toBeCloseTo(road.s.maxSpeed, 6);
    expect(dirt.speed).toBeCloseTo(dirt.s.maxSpeed * unpavedTopShare(dirt.s.roughCut), 6);
    expect(dirt.speed).toBeLessThan(road.speed);
  });

  it('crawls without fuel and burns nothing below empty', () => {
    const w = emptyWorld();
    const far = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 120, y: 120 });
    far.resources!.fuel = 0;
    far.order = { kind: 'through', dest: { x: 200, y: 120 } };
    advanceFar(w, far);
    expect(far.speed).toBeLessThanOrEqual(RULES.limpSpeed);
    expect(far.resources!.fuel).toBe(0);
  });

  it('lets a player with an empty tank crawl faster at driving rank 5', () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    w.player.fuel = 0;
    const order = { kind: 'through', dest: { x: 200, y: 30 } } as const;
    expect(fuelLimited(w, me, vehicleStats(w, me), 0, order).maxSpeed).toBeCloseTo(RULES.limpSpeed);
    w.player.ranks.driving = 5;
    const crawl = RULES.limpSpeed * (1 + 5 * SKILL_EFFECTS.driving.crawl);
    expect(fuelLimited(w, me, vehicleStats(w, me), 0, order).maxSpeed).toBeCloseTo(crawl);
  });

  it('caps a low-fuel truck at lowFuelSpeed', () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    w.player.fuel = fuelCap(me) * RULES.lowFuelThreshold * 0.5;
    const s = vehicleStats(w, me);
    const order = { kind: 'through', dest: { x: 200, y: 30 } } as const;
    expect(fuelLimit(w, me, true)).toBe('low');
    expect(fuelLimited(w, me, s, 0, order).maxSpeed).toBeCloseTo(lowFuelSpeed(s.maxSpeed));
  });

  it('gives the plain top speed over the low-fuel mark and half of it under', () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    w.player.fuel = fuelCap(me);
    expect(plainFuelSpeed(w, me)).toBe(plainMaxSpeed(w, me));
    w.player.fuel = fuelCap(me) * RULES.lowFuelThreshold * 0.5;
    expect(plainFuelSpeed(w, me)).toBeCloseTo(lowFuelSpeed(plainMaxSpeed(w, me)));
  });

  it('names the fuel limit: low, empty or none', () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const s = vehicleStats(w, me);
    w.player.fuel = fuelCap(me);
    expect(fuelLimit(w, me, s.fuelPerTile > 0)).toBeNull();
    w.player.fuel = fuelCap(me) * RULES.lowFuelThreshold * 0.5;
    expect(fuelLimit(w, me, s.fuelPerTile > 0)).toBe('low');
    w.player.fuel = 0;
    expect(fuelLimit(w, me, s.fuelPerTile > 0)).toBe('empty');
  });

  it('a brake order or no order slows a far vehicle where it stands', () => {
    const w = emptyWorld();
    const far = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 120, y: 120 });
    far.speed = 5;
    far.order = { kind: 'brake' };
    const s = vehicleStats(w, far);
    advanceFar(w, far);
    expect(far.pos).toEqual({ x: 120, y: 120 });
    expect(far.speed).toBeCloseTo(Math.max(0, 5 - s.brake), 9);
    for (let i = 0; i < 10 && far.order; i++) advanceFar(w, far);
    expect(far.order).toBeNull();
    expect(far.speed).toBe(0);
  });

  it('reaches a distant site over turns and reports arrival', () => {
    let w = emptyWorld();
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 120, y: 120 });
    const site = { x: 150, y: 140 };
    npc.order = { kind: 'stopAt', dest: site };
    let d = buildDrive(w);
    let arrived = false;
    for (let i = 0; i < 40 && !arrived; i++) {
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      freeDrive(d);
      d = next!;
      arrived = w.events.some((e) => e.t === 'arrived' && e.vehicle === npc.id);
    }
    const v = w.vehicles.find((x) => x.id === npc.id)!;
    expect(arrived).toBe(true);
    expect(v.order).toBeNull();
    expect(dist(v.pos, site)).toBeLessThan(RULES.arriveRadius);
    expect(d.bodies[npc.id]).toBeUndefined();
    freeDrive(d);
  });

  it('a far NPC keeps its goal stack across a turn and still drives by it', () => {
    let w = emptyWorld();
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 30 + LIVE + 40, y: 80 });
    npc.brain = npcBrain('scavenger', npc.pos, ['scavenger']);
    const goals = [
      { kind: 'raid' as const, targetId: null, destination: { x: 30 + LIVE + 70, y: 80 }, phase: 'travel' as const, reason: 'tripToSite' as const },
      { kind: 'investigate' as const, targetId: w.player.vehicleId, destination: { x: 30 + LIVE + 60, y: 80 }, phase: 'travel' as const, reason: 'heardHostile' as const },
    ];
    npc.brain.goals = structuredClone(goals);
    w.states.push({ id: 'feud-test', kind: 'feud', holder: npc.id, other: w.player.vehicleId, turnsLeft: 10, born: w.turn, data: { kind: 'feud', robbery: false } });
    const { w: after, d } = play(w, 1);
    w = after;
    const v = w.vehicles.find((x) => x.id === npc.id)!;
    expect(d.bodies[npc.id]).toBeUndefined();
    expect(v.brain!.goals.map((g) => [g.kind, g.reason])).toEqual(goals.map((g) => [g.kind, g.reason]));
    expect(v.pos.x).toBeGreaterThan(npc.pos.x);
    freeDrive(d);
  });

  it('stores the route and reuses it while the destination holds', () => {
    const w = emptyWorld();
    w.obstacles = [{ id: 'rock1', pos: { x: 135, y: 120 }, r: 3, kind: 'rock' }];
    const far = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 120, y: 120 });
    far.brain = npcBrain('trader', { x: 0, y: 0 }, ['trader']);
    far.order = { kind: 'stopAt', dest: { x: 150, y: 120 } };
    advanceFar(w, far);
    const stored = far.brain.farRoute!;
    expect(stored.dest).toEqual({ x: 150, y: 120 });
    expect(stored.points.length).toBeGreaterThan(1);
    const marker = { x: 150, y: 120 };
    stored.points = [marker];
    advanceFar(w, far);
    expect(far.brain.farRoute!.points).toEqual([marker]);
    far.order = { kind: 'stopAt', dest: { x: 150, y: 100 } };
    advanceFar(w, far);
    expect(far.brain.farRoute!.dest).toEqual({ x: 150, y: 100 });
  });

  it('keeps the stored route when the destination moves less than the arrival radius', () => {
    const w = emptyWorld();
    w.obstacles = [{ id: 'rock1', pos: { x: 135, y: 120 }, r: 3, kind: 'rock' }];
    const far = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 120, y: 120 });
    far.brain = npcBrain('trader', { x: 0, y: 0 }, ['trader']);
    far.order = { kind: 'stopAt', dest: { x: 150, y: 120 } };
    advanceFar(w, far);
    const marker = { x: 150, y: 120 };
    far.brain.farRoute!.points = [marker];
    far.order = { kind: 'stopAt', dest: { x: 150.3, y: 120.2 } };
    advanceFar(w, far);
    expect(far.brain.farRoute!.points).toEqual([marker]);
  });

  it('drops a kept road route once a raider runs dry, and plans one off the road to the same point', () => {
    const w = emptyWorld();
    const t = editableTerrain(w);
    for (let i = 0; i < t.types.length; i++) t.types[i] = Math.abs(Math.floor(i / t.size) + 0.5 - 120) < 3 ? 'road' : 'hardpan';
    const far = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 120, y: 120 });
    far.brain = npcBrain('raider', { x: 0, y: 0 }, ['raider']);
    far.brain.goals = [{ kind: 'sell', targetId: null, destination: null, phase: 'travel', reason: 'patrolTown' }];
    far.order = { kind: 'stopAt', dest: { x: 180, y: 120 } };
    advanceFar(w, far);
    expect(far.brain.farRoute!.offRoad).toBe(false);
    const marker = { x: 180, y: 120 };
    far.brain.farRoute!.points = [marker];
    advanceFar(w, far);
    expect(far.brain.farRoute!.points).toEqual([marker]);
    far.resources!.fuel = 0;
    advanceFar(w, far);
    const route = far.brain.farRoute!;
    expect(route.offRoad).toBe(true);
    expect(route.dest).toEqual(marker);
    expect(route.points.length).toBeGreaterThan(1);
    expect(route.points.slice(0, -1).every((p) => Math.abs(p.y - 120) >= 3)).toBe(true);
  });

  it('throws on a kept far route without its road style', () => {
    const w = emptyWorld();
    const far = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 120, y: 120 });
    far.brain = npcBrain('trader', { x: 0, y: 0 }, ['trader']);
    far.order = { kind: 'stopAt', dest: { x: 150, y: 120 } };
    far.brain.farRoute = { dest: { x: 150, y: 120 }, points: [{ x: 150, y: 120 }] } as NonNullable<typeof far.brain.farRoute>;
    expect(() => advanceFar(w, far)).toThrow(/offRoad/);
  });

  it('adds a body at the sim pose when a far vehicle crosses into range', () => {
    let w = emptyWorld();
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 30 + LIVE + 6, y: 30 });
    npc.order = { kind: 'through', dest: { x: 20, y: 30 } };
    npc.speed = 4;
    npc.heading = Math.PI;
    let d = buildDrive(w);
    expect(d.bodies[npc.id]).toBeUndefined();
    let crossed = false;
    for (let i = 0; i < 6 && !crossed; i++) {
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      freeDrive(d);
      d = next!;
      crossed = isNear(w, w.vehicles.find((x) => x.id === npc.id)!);
    }
    expect(crossed).toBe(true);
    syncDrive(d, w);
    const v = w.vehicles.find((x) => x.id === npc.id)!;
    const body = bodyState(d, npc.id);
    expect(dist(body.pos, v.pos)).toBeLessThan(1e-3);
    expect(Math.abs(body.heading - v.heading)).toBeLessThan(1e-3);
    freeDrive(d);
  });
  it('gives far vehicles frames along their trail, so the view never jumps', () => {
    const { w, last } = play(mixedWorld(), 1);
    const far = w.vehicles[2];
    const frames = last.frames[far.id];
    expect(frames).toHaveLength(TURN_STEPS);
    const S = PHYSICS.metersPerTile;
    const end = frames[frames.length - 1].pos;
    expect(Math.hypot(end.x / S - far.pos.x, end.z / S - far.pos.y)).toBeLessThan(1e-6);
    for (let i = 1; i < frames.length; i++) {
      const step = Math.hypot(frames[i].pos.x - frames[i - 1].pos.x, frames[i].pos.z - frames[i - 1].pos.z) / S;
      expect(step).toBeLessThanOrEqual(pathLength(far.trail) / RULES.substeps + 1e-6);
    }
    for (const v of w.vehicles) expect(last.frames[v.id]).toHaveLength(TURN_STEPS);
  });
});

describe('far travel contact', () => {
  function far() {
    const w = emptyWorld();
    const mover = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 120, y: 120 });
    mover.speed = 4;
    return { w, mover };
  }

  it('holds just short of a faster truck in the way and keeps its speed', () => {
    const { w, mover } = far();
    const ahead = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 122.5, y: 120 });
    ahead.speed = 2 * vehicleStats(w, mover).maxSpeed;
    mover.order = { kind: 'through', dest: { x: 200, y: 120 } };
    advanceFar(w, mover);
    const contact = vehicleStats(w, mover).radius + vehicleStats(w, ahead).radius;
    expect(dist(mover.pos, ahead.pos)).toBeGreaterThanOrEqual(contact);
    expect(mover.pos.x).toBeGreaterThan(120);
    expect(mover.speed).toBeGreaterThan(0);
    expect(mover.order).not.toBeNull();
  });

  it('overtakes a slower truck in the way', () => {
    const { w, mover } = far();
    const slow = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 124, y: 120 });
    slow.speed = 1;
    mover.order = { kind: 'through', dest: { x: 200, y: 120 } };
    const contact = vehicleStats(w, mover).radius + vehicleStats(w, slow).radius;
    for (let turn = 0; turn < 4; turn++) {
      advanceFar(w, mover);
      expect(dist(mover.pos, slow.pos)).toBeGreaterThanOrEqual(contact);
    }
    expect(mover.pos.x).toBeGreaterThan(slow.pos.x + contact);
    expect(mover.speed).toBeGreaterThan(slow.speed);
  });

  it('arrives next to a truck parked on its stop point', () => {
    const { w, mover } = far();
    addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 123, y: 120 });
    mover.order = { kind: 'stopAt', dest: { x: 123, y: 120 } };
    advanceFar(w, mover);
    advanceFar(w, mover);
    expect(mover.order).toBeNull();
    expect(mover.speed).toBe(0);
  });

  it('drives through the position of a truck hitched to its tow rope', () => {
    const { w, mover } = far();
    const towed = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 121, y: 120 });
    addState(w, 'tow', mover.id, towed.id, { kind: 'tow', site: 'bowl', fee: 0, waived: 0, hitched: true });
    const dest = { x: 200, y: 120 };
    mover.brain = npcBrain('trader', mover.pos, ['trader']);
    mover.brain.farRoute = { dest, points: [dest], offRoad: false };
    mover.order = { kind: 'through', dest };

    advanceFar(w, mover);

    expect(mover.pos.x).toBeGreaterThan(120);
  });

  it('a far NPC drives through a truck in the middle of its trip but stops beside one parked on its goal', () => {
    const { w, mover } = far();
    mover.brain = npcBrain('trader', mover.pos, ['trader']);
    const inWay = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 122.5, y: 120 });
    const parked = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 140, y: 120 });
    mover.order = { kind: 'stopAt', dest: { x: 140, y: 120 } };
    for (let i = 0; i < 12 && mover.order; i++) advanceFar(w, mover);
    expect(mover.pos.x).toBeGreaterThan(inWay.pos.x);
    expect(mover.order).toBeNull();
    expect(dist(mover.pos, parked.pos)).toBeGreaterThanOrEqual(vehicleStats(w, mover).radius + vehicleStats(w, parked).radius);
  });

  it('lets two trucks on the same point drive apart', () => {
    const { w, mover } = far();
    addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 120, y: 120 });
    mover.order = { kind: 'through', dest: { x: 200, y: 120 } };
    advanceFar(w, mover);
    expect(mover.pos.x).toBeGreaterThan(121);
  });
});

describe('far NPCs and breakable props', () => {
  function fenceLine(x: number, y: number): Obstacle[] {
    return Array.from({ length: 64 }, (_, k) => ({ id: `fence-${k}`, pos: { x, y: y - 30 + k * 0.95 }, r: 0.5, kind: 'landmark' as const, look: 'fence' as const, yaw: Math.PI / 2 }));
  }

  it('breaks a fence on its route and drives on', () => {
    const w = emptyWorld();
    const x = 30 + LIVE + 50;
    w.obstacles = fenceLine(x, 80);
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: x - 10, y: 80 });
    npc.order = { kind: 'stopAt', dest: { x: x + 10, y: 80 } };

    for (let i = 0; i < 12 && npc.order; i++) advanceFar(w, npc);

    expect(w.broken.length).toBeGreaterThan(0);
    expect(w.broken.every((b) => !w.obstacles.includes(b.obstacle))).toBe(true);
    expect(npc.pos.x).toBeGreaterThan(x);
    expect(w.events.some((e) => e.t === 'collision' && e.a === npc.id && w.broken.some((b) => b.obstacle.id === e.b))).toBe(true);
    const smashes = w.events.flatMap((e) => (e.t === 'collision' ? [e.impact] : []));
    expect(smashes.length).toBeGreaterThan(0);
    expect(smashes.every((impact) => Number.isFinite(impact) && impact > 0)).toBe(true);
  });

  it('a far NPC on its coarse trip drives through a fence and leaves it standing', () => {
    const w = emptyWorld();
    const x = 30 + LIVE + 50;
    w.obstacles = fenceLine(x, 80);
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: x - 10, y: 80 });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    npc.brain.farRoute = { dest: { x: x + 10, y: 80 }, points: [{ x: x + 10, y: 80 }], offRoad: false };
    npc.order = { kind: 'stopAt', dest: { x: x + 10, y: 80 } };

    for (let i = 0; i < 12 && npc.order; i++) advanceFar(w, npc);

    expect(npc.pos.x).toBeGreaterThan(x);
    expect(w.broken).toEqual([]);
    expect(w.obstacles).toHaveLength(64);
  });

  it('leaves a fence beside its route standing', () => {
    const w = emptyWorld();
    const x = 30 + LIVE + 50;
    const fence: Obstacle = { id: 'fence-0', pos: { x, y: 80 }, r: 0.5, kind: 'landmark', look: 'fence', yaw: 0 };
    w.obstacles = [fence];
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: x - 10, y: 82 });
    npc.order = { kind: 'stopAt', dest: { x: x + 10, y: 82 } };

    for (let i = 0; i < 12 && npc.order; i++) advanceFar(w, npc);

    expect(w.obstacles).toEqual([fence]);
    expect(w.broken).toEqual([]);
  });
});

describe('far trips longer than the route window', () => {
  function longTrip() {
    const w = emptyWorld();
    w.obstacles = [];
    const { nodes } = roadNetworkOf(w);
    const from = nodes[0].pos;
    const to = nodes.reduce((a, b) => (dist(b.pos, from) > dist(a.pos, from) ? b : a)).pos;
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { ...from });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    npc.order = { kind: 'stopAt', dest: { ...to } };
    return { w, npc, to };
  }

  function drive(w: World, id: string, turns: number): { w: World; windows: number } {
    let windows = 0;
    for (let i = 0; i < turns; i++) {
      const v = w.vehicles.find((x) => x.id === id)!;
      if (!v.order) break;
      advanceFar(w, v);
      if (v.brain?.farRoute?.partial) windows++;
    }
    return { w, windows };
  }

  it('plans an NPC trip across the map once, on the coarse grid, and arrives without arriving early', () => {
    const { w, npc, to } = longTrip();
    expect(dist(npc.pos, to)).toBeGreaterThan(REGION.navigation.farWindow * 2);
    resetPerf();
    const { windows } = drive(w, npc.id, 2000);
    expect(windows).toBe(0);
    expect(perfSnapshot()['coarse-trip'].calls).toBe(1);
    expect(perfSnapshot().route).toBeUndefined();
    expect(w.events.filter((e) => e.t === 'arrived' && e.vehicle === npc.id)).toHaveLength(1);
    expect(dist(npc.pos, to)).toBeLessThan(RULES.arriveRadius);
  });

  it('drives an NPC that ended a turn in a closed pocket out through its wall to a goal outside', () => {
    const w = emptyWorld();
    const center = { x: 160, y: 160 };
    w.obstacles = Array.from({ length: 24 }, (_, k): Obstacle => ({ id: `ring${k}`, kind: 'rock', r: 1.6, pos: { x: center.x + 6 * Math.cos((k * Math.PI) / 12), y: center.y + 6 * Math.sin((k * Math.PI) / 12) } }));
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { ...center });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    const dest = { x: 220, y: 160 };
    expect(drivable(w, npc.pos, dest, vehicleStats(w, npc).radius)).toBe(false);
    npc.order = { kind: 'stopAt', dest };
    for (let i = 0; i < 60 && npc.order; i++) advanceFar(w, npc);
    expect(dist(npc.pos, dest)).toBeLessThan(RULES.arriveRadius);
  });

  it('drives an NPC into a closed pocket to a goal there, as a helper reaches a truck stranded inside', () => {
    const w = emptyWorld();
    const center = { x: 160, y: 160 };
    w.obstacles = Array.from({ length: 24 }, (_, k): Obstacle => ({ id: `ring${k}`, kind: 'rock', r: 1.6, pos: { x: center.x + 6 * Math.cos((k * Math.PI) / 12), y: center.y + 6 * Math.sin((k * Math.PI) / 12) } }));
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 220, y: 160 });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    expect(drivable(w, npc.pos, center, vehicleStats(w, npc).radius)).toBe(false);
    npc.order = { kind: 'stopAt', dest: { ...center } };
    for (let i = 0; i < 60 && npc.order; i++) advanceFar(w, npc);
    expect(dist(npc.pos, center)).toBeLessThan(RULES.arriveRadius);
  });

  it('drives an NPC straight to a goal it reaches within the turn, with no plan', () => {
    const { w, npc } = longTrip();
    const hop = { x: npc.pos.x + vehicleStats(w, npc).maxSpeed / 2, y: npc.pos.y };
    npc.order = { kind: 'stopAt', dest: hop };
    npc.speed = vehicleStats(w, npc).maxSpeed;
    resetPerf();
    advanceFar(w, npc);
    expect(perfSnapshot()['coarse-trip']).toBeUndefined();
    expect(npc.trail.every((p) => Math.abs(p.y - hop.y) < 1e-9)).toBe(true);
  });

  it('drives the player window by window on fine routes in fast travel', () => {
    const { w, to } = longTrip();
    const me = w.vehicles[0];
    me.pos = { ...w.vehicles[1].pos };
    me.order = { kind: 'stopAt', dest: { ...to } };
    resetPerf();
    inFarTurn(() => drive(w, me.id, 30));
    expect(perfSnapshot()['route-ahead'].calls).toBeGreaterThan(0);
    expect(perfSnapshot()['coarse-trip']).toBeUndefined();
  });

  it('ends the trip in the same place after a save and load in the middle of the trip', () => {
    const { w, npc } = longTrip();
    drive(w, npc.id, 20);
    expect(npc.brain!.farRoute?.partial).toBeUndefined();
    expect(npc.order).not.toBeNull();
    const loaded = JSON.parse(JSON.stringify(w)) as World;
    loaded.terrain = w.terrain;
    drive(w, npc.id, 2000);
    drive(loaded, npc.id, 2000);
    expect(loaded.vehicles.find((v) => v.id === npc.id)!.pos).toEqual(npc.pos);
  });
});

describe('a far truck waking up', () => {
  function wokenInRock() {
    const w = emptyWorld();
    const rock: Obstacle = { id: 'rock1', pos: { x: 60, y: 30 }, r: 3, kind: 'rock' };
    w.obstacles = [rock];
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 60, y: 30 });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    return { w, npc, rock };
  }

  it('steps an NPC that wakes inside a prop out to the nearest clear spot, with a still trail there', () => {
    const { w, npc, rock } = wokenInRock();
    expect(isNear(w, npc)).toBe(true);
    settleWoken(w, () => false);
    expect(touchesObstacle(rock, w.terrain, npc.pos, vehicleStats(w, npc).radius)).toBe(false);
    expect(dist(npc.pos, rock.pos)).toBeLessThan(rock.r + vehicleStats(w, npc).radius + RULES.arriveRadius * 2);
    expect(npc.trail.every((p) => p.x === npc.pos.x && p.y === npc.pos.y)).toBe(true);
  });

  it('steps a woken NPC off another truck', () => {
    const { w, npc } = wokenInRock();
    w.obstacles = [];
    const other = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 60.5, y: 30 });
    settleWoken(w, (id) => id === other.id);
    expect(dist(npc.pos, other.pos)).toBeGreaterThanOrEqual(2 * vehicleStats(w, npc).radius);
    expect(other.pos).toEqual({ x: 60.5, y: 30 });
  });

  it('leaves a truck that already has a body, a far truck and the player where they stand', () => {
    const { w, npc } = wokenInRock();
    settleWoken(w, (id) => id === npc.id);
    expect(npc.pos).toEqual({ x: 60, y: 30 });
    npc.pos = { x: 30 + LIVE + 40, y: 30 };
    w.obstacles = [{ id: 'rock2', pos: { ...npc.pos }, r: 3, kind: 'rock' }];
    settleWoken(w, () => false);
    expect(npc.pos).toEqual({ x: 30 + LIVE + 40, y: 30 });
    const me = w.vehicles[0];
    w.obstacles = [{ id: 'rock3', pos: { ...me.pos }, r: 3, kind: 'rock' }];
    settleWoken(w, () => false);
    expect(me.pos).toEqual({ x: 30, y: 30 });
  });
});

describe('far tower and its rope', () => {
  function boxedTower() {
    const w = emptyWorld();
    const tower = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 120, y: 120 });
    const client = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 118, y: 120 });
    for (const pos of [{ x: 122, y: 120 }, { x: 120, y: 122 }, { x: 120, y: 118 }]) addVehicle(w, 'independent', 'scout', ['stockEngine'], pos);
    addState(w, 'tow', tower.id, client.id, { kind: 'tow', site: REGION.towns[0].id, fee: 0, waived: 0, hitched: true });
    tower.order = { kind: 'stopAt', dest: { x: 60, y: 120 } };
    return { w, tower, client };
  }

  it('drives out past the truck on its own rope instead of arriving where it stands', () => {
    const { w, tower } = boxedTower();
    advanceFar(w, tower);
    expect(tower.pos.x).toBeLessThan(119.5);
    expect(tower.order).not.toBeNull();
  });

  it('still counts a parked truck on another tower rope as a blocker', () => {
    const { w, tower, client } = boxedTower();
    const other = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 200, y: 200 });
    w.states = w.states.map((s) => (s.kind === 'tow' ? { ...s, holder: other.id } : s));
    advanceFar(w, tower);
    expect(dist(tower.pos, { x: 120, y: 120 })).toBeLessThan(dist(client.pos, { x: 120, y: 120 }) - 1);
  });
});
