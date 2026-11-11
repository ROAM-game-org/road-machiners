import RAPIER from '@dimforge/rapier3d-compat';
import { vehicleStats } from '../sim/stats';
import { beforeAll, describe, expect, it } from 'vitest';
import { partDef } from '../data/parts';
import { RULES } from '../data/rules';
import { addGoods, removeAllGoods } from '../sim/inventory';
import { vehicleMass } from '../sim/mass';
import { corePart } from '../sim/grid';
import { addVehicle, editableTerrain, emptyWorld, npcBrain, partHp } from '../sim/testkit';
import { angleDiff, bearing, dist, type Vec } from '../sim/vec';
import { REGION } from '../data/region';
import { endTurn, setDirect, setMoveOrder } from '../sim/world';
import { PHYSICS } from '../data/physics';
import { buildDrive, freeDrive, initPhysics, routeAim, simulateTurn, syncDrive, type Drive, type TurnResult } from './drive';
import { rotateBy } from './frames';
import { physicsMove } from './turn';
import { playerTow, unhitch } from '../sim/tow';
import { callVehicle } from '../sim/dialogue';
import { chooseText } from '../sim/dialogue-testkit';
import { TOW } from '../data/tow';
import { NPCS } from '../data/npcs';
import { soundRange } from '../sim/detect';
import { budget } from '../test/budget';
import { me, ordered, play } from '../test/drive-kit';

beforeAll(async () => {
  await initPhysics();
});

const HILL_GRADE = 0.2;
const CRAWL_GRADE = 0.5;

describe('physics turns', () => {
  const staleHandle = (d: Drive) => {
    const collider = d.world.createCollider(RAPIER.ColliderDesc.ball(1));
    const { handle } = collider;
    d.world.removeCollider(collider, false);
    return handle;
  };

  it('a synced obstacle record with no collider throws and names the prop', () => {
    const w = emptyWorld();
    const d = buildDrive(w);
    try {
      d.obstacles.rock1 = [staleHandle(d)];
      expect(() => syncDrive(d, w)).toThrow(/Obstacle or crater rock1 has no collider/);
    } finally {
      freeDrive(d);
    }
  });

  it('a vehicle record with no body throws and names the vehicle', () => {
    const w = emptyWorld();
    const d = buildDrive(w);
    try {
      d.bodies[me(w).id] = staleHandle(d);
      expect(() => syncDrive(d, w)).toThrow(/Vehicle .* has no body/);
    } finally {
      freeDrive(d);
    }
  });

  it('a truck knocked out while driving brakes to a stop', () => {
    let w = ordered({ kind: 'stopAt', dest: { x: 200, y: 30 } });
    let d = buildDrive(w);
    const turn = () => {
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      freeDrive(d);
      d = next!;
    };
    for (let i = 0; i < 3; i++) turn();
    expect(me(w).speed).toBeGreaterThan(1);
    corePart(me(w), 'cab').hp = 0;
    turn();
    expect(w.player.state).toBe('knockedOut');
    for (let i = 0; i < 3; i++) turn();
    const at = { ...me(w).pos };
    turn();
    freeDrive(d);
    expect(dist(me(w).pos, at)).toBeLessThan(0.05);
  });

  it('two traders meeting head-on on a road both get past', () => {
    const bowl = REGION.towns[0];
    const nose = REGION.towns[1];
    const toNose = bearing(bowl.pos, nose.pos);
    const mid = { x: bowl.pos.x + (nose.pos.x - bowl.pos.x) * 0.4, y: bowl.pos.y + (nose.pos.y - bowl.pos.y) * 0.4 };
    const at = (d: number) => ({ x: mid.x + Math.cos(toNose) * d, y: mid.y + Math.sin(toNose) * d });
    const w = emptyWorld({ x: mid.x + Math.cos(toNose + Math.PI / 2) * 12, y: mid.y + Math.sin(toNose + Math.PI / 2) * 12 });
    const east = addVehicle(w, 'independent', 'hauler', ['stockEngine'], at(-1.5), toNose);
    const west = addVehicle(w, 'independent', 'hauler', ['stockEngine'], at(1.5), toNose + Math.PI);
    east.brain = { ...npcBrain('trader', east.pos, ['trader']), goals: [{ kind: 'sell', targetId: 'nose', destination: { ...nose.pos }, reason: 'tripToSite', phase: 'travel' }] };
    west.brain = { ...npcBrain('trader', west.pos, ['trader']), goals: [{ kind: 'sell', targetId: 'bowl', destination: { ...bowl.pos }, reason: 'tripToSite', phase: 'travel' }] };
    const along = (p: Vec) => (p.x - mid.x) * Math.cos(toNose) + (p.y - mid.y) * Math.sin(toNose);
    const { w: after } = play(w, 10);
    expect(along(after.vehicles.find((v) => v.id === east.id)!.pos)).toBeGreaterThan(5);
    expect(along(after.vehicles.find((v) => v.id === west.id)!.pos)).toBeLessThan(-5);
  });

  it('turns an NPC around for a destination behind it', () => {
    const w = emptyWorld({ x: 20, y: 50 });
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 30, y: 30 });
    npc.order = { kind: 'stopAt', dest: { x: 10, y: 30 } };
    const result = play(w, 4);
    const actor = result.w.vehicles.find((v) => v.id === npc.id)!;
    expect(Math.abs(angleDiff(actor.heading, Math.PI))).toBeLessThan(Math.PI / 2);
    expect(actor.speed).toBeGreaterThan(0);
    freeDrive(result.d);
  });

  it('limits and charges NPC fuel through the physics turn pipeline', () => {
    const initial = emptyWorld();
    const npc = addVehicle(initial, 'independent', 'scout', ['stockEngine'], { x: 10, y: 10 });
    npc.order = { kind: 'through', dest: { x: 25, y: 10 } };
    const dry = structuredClone(initial);
    dry.vehicles[1].resources!.fuel = 0;
    const fueled = play(initial, 2);
    const empty = play(dry, 2);
    expect(fueled.w.vehicles[1].resources!.fuel).toBeLessThan(npc.resources!.fuel);
    expect(fueled.w.vehicles[1].pos.x).toBeGreaterThan(empty.w.vehicles[1].pos.x);
    expect(empty.w.vehicles[1].resources!.fuel).toBe(0);
    freeDrive(fueled.d);
    freeDrive(empty.d);
  });

  it('a new truck sits still on flat ground', () => {
    const { w } = play(emptyWorld(), 2);
    expect(dist(me(w).pos, { x: 30, y: 30 })).toBeLessThan(0.1);
    expect(me(w).speed).toBeLessThan(0.1);
  });

  it('in route mode a far point speeds up and a point within reach holds speed', () => {
    const far = play(ordered({ kind: 'through', dest: { x: 45, y: 30 } }, 3), 1).w;
    expect(me(far).speed).toBeGreaterThan(3.5);
    const near = play(ordered({ kind: 'through', dest: { x: 32.5, y: 30 } }, 3), 1).w;
    expect(Math.abs(me(near).speed - 3)).toBeLessThan(0.5);
  });

  it('in manual mode a mid click holds speed', () => {
    const w = ordered({ kind: 'through', dest: { x: 35, y: 30 } }, 3);
    me(w).direct = true;
    expect(Math.abs(me(play(w, 1).w).speed - 3)).toBeLessThan(0.5);
  });

  it('in route mode a truck does not brake for a through point just ahead', () => {
    const w = play(ordered({ kind: 'through', dest: { x: 32, y: 30 } }, 6), 1).w;
    expect(me(w).speed).toBeGreaterThan(5.5);
  });

  it('from rest a far through point keeps speeding up toward top speed', () => {
    let w = ordered({ kind: 'through', dest: { x: 120, y: 30 } });
    const speeds: number[] = [];
    for (let i = 0; i < 6; i++) {
      w = setMoveOrder(play(w, 1).w, { kind: 'through', dest: { x: 120, y: 30 } });
      speeds.push(me(w).speed);
    }
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
  });

  it('a far stop point from rest reaches speed and then stops on the point', () => {
    let w = ordered({ kind: 'stopAt', dest: { x: 110, y: 30 } });
    const speeds: number[] = [];
    for (let i = 0; i < 30 && me(w).order; i++) {
      w = play(w, 1).w;
      speeds.push(me(w).speed);
    }
    const peak = Math.max(...speeds);
    expect(peak).toBeGreaterThan(0.9 * vehicleStats(w, me(w)).maxSpeed);
    expect(me(w).order).toBeNull();
    expect(dist(me(w).pos, { x: 110, y: 30 })).toBeLessThan(RULES.arriveRadius + 0.3);
  });

  it('a fast truck given a close stop point slows every turn and stops on it', () => {
    let w = ordered({ kind: 'stopAt', dest: { x: 38, y: 30 } }, 6);
    const speeds = [6];
    for (let i = 0; i < 8 && me(w).order; i++) {
      w = play(w, 1).w;
      speeds.push(me(w).speed);
    }
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeLessThanOrEqual(speeds[i - 1] + 1e-6);
    expect(me(w).order).toBeNull();
    expect(dist(me(w).pos, { x: 38, y: 30 })).toBeLessThan(RULES.arriveRadius + 0.5);
  });

  it('steers toward a side click that starts behind a moving truck', () => {
    const dest = { x: 29, y: 34 };
    const initial = ordered({ kind: 'through', dest }, 4);
    const result = play(initial, 1);
    expect(me(result.w).order).toEqual({ kind: 'through', dest });
    expect(me(result.w).heading).toBeGreaterThan(initial.vehicles[0].heading);
    freeDrive(result.d);
  });

  it('a fast truck slows to curve onto a drive-through point inside its turning circle', () => {
    const { w, d } = play(ordered({ kind: 'through', dest: { x: 36, y: 35 } }, 7.8), 2);
    expect(me(w).order).toBeNull();
    freeDrive(d);
  });

  it('a fast truck that misses a drive-through point wide drives on instead of circling back', () => {
    const dest = { x: 33, y: 32 };
    let w = ordered({ kind: 'through', dest }, 7.8);
    let d = buildDrive(w);
    let turned = 0;
    for (let i = 0; i < 3; i++) {
      let r: TurnResult | null = null;
      w = endTurn(w, physicsMove(d, (x) => (r = x)));
      freeDrive(d);
      d = r!.next;
      turned = Math.max(turned, Math.abs(angleDiff(me(w).heading, 0)));
    }
    freeDrive(d);
    expect(me(w).order).toBeNull();
    expect(turned).toBeLessThan(Math.PI / 2);
  });

  it('from rest, a close drive-through click is reached instead of stopping short', () => {
    const { w, d } = play(ordered({ kind: 'through', dest: { x: 33, y: 30.5 } }), 12);
    expect(me(w).order).toBeNull();
    freeDrive(d);
  });

  it('a fast truck brakes before a sharp route corner instead of running into the wall past it', () => {
    let w = ordered({ kind: 'stopAt', dest: { x: 45, y: 48 } }, 7.8);
    for (let x = 26; x <= 43; x += 1.2) w.obstacles = [...w.obstacles, { id: `s${x}`, pos: { x, y: 32 }, r: 0.7, kind: 'rock' }];
    for (let y = 20; y <= 55; y += 1.2) w.obstacles = [...w.obstacles, { id: `e${y}`, pos: { x: 48, y }, r: 0.7, kind: 'rock' }];
    let d = buildDrive(w);
    let crashes = 0;
    for (let i = 0; i < 10 && me(w).order; i++) {
      let r: TurnResult | null = null;
      w = endTurn(w, physicsMove(d, (x) => (r = x)));
      crashes += w.events.filter((e) => e.t === 'collision').length;
      freeDrive(d);
      d = r!.next;
    }
    freeDrive(d);
    expect(crashes).toBe(0);
    expect(me(w).order).toBeNull();
  });

  it('a stop order stops on the point', () => {
    const { w } = play(ordered({ kind: 'stopAt', dest: { x: 38, y: 31 } }), 8);
    expect(dist(me(w).pos, { x: 38, y: 31 })).toBeLessThan(RULES.arriveRadius + 0.3);
    expect(me(w).order).toBeNull();
  });

  it('a stop order at a point no truck can reach arrives at the closest point the route reaches', () => {
    const dest = { x: 40, y: 31 };
    const start = ordered({ kind: 'stopAt', dest });
    start.obstacles = [...start.obstacles, { id: 'boulder', kind: 'rock', pos: dest, r: 3 }];
    const { w, d } = play(start, 12);
    expect(me(w).order).toBeNull();
    expect(dist(me(w).pos, dest)).toBeLessThan(6);
    freeDrive(d);
  });

  it('a course point behind, beyond throttle reach, turns the truck around', () => {
    const dest = { x: 30 - RULES.throttleZones.reach * 2, y: 31 };
    const { w, d } = play(ordered({ kind: 'through', dest }), 4);
    expect(Math.abs(angleDiff(me(w).heading, Math.PI))).toBeLessThan(Math.PI / 4);
    expect(me(w).speed).toBeGreaterThan(0);
    freeDrive(d);
  });

  it('a click behind outside the reverse cone turns the truck around nose first', () => {
    const dest = { x: 26, y: 33 };
    let w = ordered({ kind: 'through', dest });
    let d = buildDrive(w);
    for (let i = 0; i < 24; i++) {
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      freeDrive(d);
      d = next!;
      if (i === 0) expect(me(w).pos.x).toBeGreaterThan(30);
    }
    expect(me(w).order).toBeNull();
    freeDrive(d);
  });

  it('facing a wall, a click back and to the side backs the truck out instead of pushing into the wall', () => {
    const w = ordered({ kind: 'through', dest: { x: 28, y: 27 } });
    const at = me(w).pos;
    w.obstacles = [-3, -2, -1, 0, 1, 2, 3].map((i) => ({ id: `r${i}`, pos: { x: at.x + 1.8, y: at.y + i * 1.2 }, r: 0.7, kind: 'rock' as const }));
    const { w: after, d } = play(w, 22);
    expect(me(after).order).toBeNull();
    freeDrive(d);
  });

  it('after backing to a close click behind, a far click behind turns the truck around nose first', () => {
    let w = ordered({ kind: 'through', dest: { x: 24, y: 30 } });
    let d = buildDrive(w);
    const step = () => {
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      freeDrive(d);
      d = next!;
    };
    step();
    const backedTo = me(w).pos.x;
    w = setMoveOrder(w, { kind: 'through', dest: { x: 5, y: 30 } });
    for (let i = 0; i < 8; i++) step();
    expect(Math.abs(angleDiff(me(w).heading, Math.PI))).toBeLessThan(Math.PI / 4);
    expect(me(w).pos.x).toBeLessThan(backedTo);
    freeDrive(d);
  });

  it('a truck blocked in front backs out until its way is clear and no farther than the reverse limit, then turns nose first toward a far point behind', () => {
    const dest = { x: 5, y: 40 };
    let w = ordered({ kind: 'through', dest });
    const at = me(w).pos;
    w.obstacles = [-3, -2, -1, 0, 1, 2, 3].map((i) => ({ id: `r${i}`, pos: { x: at.x + 1.8, y: at.y + i * 1.2 }, r: 0.7, kind: 'rock' as const }));
    let d = buildDrive(w);
    let run = 0;
    let longest = 0;
    let heading = 0;
    for (let i = 0; i < 14; i++) {
      const before = me(w).pos;
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      freeDrive(d);
      d = next!;
      const m = me(w);
      if (m.order) heading = angleDiff(m.heading, bearing(m.pos, dest));
      const moved = { x: m.pos.x - before.x, y: m.pos.y - before.y };
      const backing = moved.x * Math.cos(m.heading) + moved.y * Math.sin(m.heading) < -0.05;
      run = backing ? run + dist(before, m.pos) : 0;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeLessThan(RULES.reverse.maxDistance + 1);
    expect(Math.abs(heading)).toBeLessThan(Math.PI / 4);
    freeDrive(d);
  });

  it('a stuck truck with a rock right behind it does not back into the rock', () => {
    let w = ordered({ kind: 'through', dest: { x: 45, y: 30 } });
    const at = me(w).pos;
    w.obstacles = [
      ...[-3, -2, -1, 0, 1, 2, 3].map((i) => ({ id: `f${i}`, pos: { x: at.x + 1.8, y: at.y + i * 1.2 }, r: 0.7, kind: 'rock' as const })),
      ...[-1, 0, 1].map((i) => ({ id: `b${i}`, pos: { x: at.x - 1.4, y: at.y + i * 1.2 }, r: 0.7, kind: 'rock' as const })),
    ];
    let d = buildDrive(w);
    let hitBehind = 0;
    for (let i = 0; i < 4; i++) {
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => {
        next = r.next;
        hitBehind += r.crashes.filter((c) => c.b.startsWith('b') && c.impact > 0.5).length;
      }));
      freeDrive(d);
      d = next!;
    }
    expect(hitBehind).toBe(0);
    freeDrive(d);
  });

  it('a truck arriving at a stop point never backs out of it', () => {
    let w = ordered({ kind: 'stopAt', dest: { x: 38, y: 30 } });
    const dest = { x: 38, y: 30 };
    let d = buildDrive(w);
    for (let i = 0; i < 12; i++) {
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      freeDrive(d);
      d = next!;
      expect(d.memory[me(w).id].backFrom).toBeNull();
    }
    expect(dist(me(w).pos, dest)).toBeLessThan(RULES.arriveRadius * 2);
    freeDrive(d);
  });

  it('a truck told to creep slower than pushSpeed is not blocked, however slowly it moves', () => {
    let w = ordered({ kind: 'through', dest: { x: 60, y: 30 } });
    let d = buildDrive(w);
    for (let i = 0; i < 6; i++) {
      me(w).order = { kind: 'through', dest: { x: 60, y: 30 }, pace: 0.01 };
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      freeDrive(d);
      d = next!;
      expect(d.memory[me(w).id].backFrom).toBeNull();
    }
    freeDrive(d);
  });

  it('route aiming drops points the truck has passed, even ones still far away', () => {
    const route = [{ x: 5, y: 0 }, { x: 10, y: 2 }, { x: 20, y: 2 }];
    expect(routeAim(route, { x: 7, y: -1 })).toEqual({ x: 10, y: 2 });
    expect(routeAim(route, { x: 3, y: 0 })).toEqual({ x: 10, y: 2 });
    expect(routeAim(route, { x: 25, y: 2 })).toEqual({ x: 20, y: 2 });
  });

  it('from rest, a click behind backs toward it rear first', () => {
    const { w } = play(ordered({ kind: 'through', dest: { x: 24, y: 31 } }), 14);
    expect(dist(me(w).pos, { x: 24, y: 31 })).toBeLessThan(RULES.passRadius + 0.5);
    expect(Math.abs(angleDiff(me(w).heading, 0))).toBeLessThan(Math.PI / 4);
  });

  it('tiles seen while driving stay explored', () => {
    const w0 = ordered({ kind: 'through', dest: { x: 50, y: 30 } }, 6);
    w0.player.explored.fill(0);
    const { w } = play(w0, 1);
    const mid = Math.round((30 + me(w).pos.x) / 2);
    expect(w.player.explored[30 * w.size + mid]).toBe(1);
    expect(w.player.explored[30 * w.size + mid + 12]).toBe(Number(me(w).pos.x + 10 >= mid + 12));
  });

  it('a frame acceleration is the speed change over its physics step', () => {
    const w = ordered({ kind: 'through', dest: { x: 60, y: 40 } }, 0);
    const d = buildDrive(w);
    const frames = simulateTurn(d, w).frames[me(w).id];
    freeDrive(d);
    const speed = (i: number) => Math.hypot(frames[i + 1].pos.x - frames[i].pos.x, frames[i + 1].pos.z - frames[i].pos.z) * PHYSICS.stepsPerSecond;
    const along = frames.map((f) => Math.hypot(f.acc.x, f.acc.z));
    expect(speed(20)).toBeGreaterThan(speed(5));
    expect(Math.max(...along.slice(0, 30))).toBeGreaterThan(1);
  });

  it('a brake order stops the truck and clears', () => {
    const { w } = play(ordered({ kind: 'brake' }, 4), 3);
    expect(me(w).speed).toBeLessThan(0.1);
    expect(me(w).order).toBeNull();
  });

  it('a truck at top speed swerving hard stays upright and on the ground', () => {
    let w = ordered({ kind: 'through', dest: { x: 34, y: 40 } }, 6);
    let d = buildDrive(w);
    for (let i = 0; i < 4; i++) {
      let r: TurnResult | null = null;
      w = endTurn(w, physicsMove(d, (x) => (r = x)));
      for (const f of r!.frames[me(w).id]) {
        const q = f.rot;
        expect(1 - 2 * (q.x * q.x + q.z * q.z)).toBeGreaterThan(Math.cos(Math.PI / 6));
        expect(f.wheels.some((wh) => wh.suspension < PHYSICS.truck.suspensionRest + PHYSICS.truck.suspensionTravel)).toBe(true);
      }
      freeDrive(d);
      d = r!.next;
      w = setMoveOrder(w, { kind: 'through', dest: i % 2 ? { x: me(w).pos.x + 4, y: me(w).pos.y + 10 } : { x: me(w).pos.x - 4, y: me(w).pos.y - 10 } });
    }
  });

  it('the same state and orders give the same turn', () => {
    const w = ordered({ kind: 'through', dest: { x: 38, y: 33 } }, 2, 0.3);
    const d = buildDrive(w);
    const a = simulateTurn(d, w);
    const b = simulateTurn(d, w);
    expect(a.frames[me(w).id].at(-1)).toEqual(b.frames[me(w).id].at(-1));
  });

  it('a sunken car wreck still stops a truck that rams it at speed', () => {
    let w = emptyWorld();
    const wreckAt = { x: 36, y: 30 };
    w.obstacles = [{ id: 'carWreck-1', kind: 'landmark', look: 'carWreck', pos: wreckAt, r: 0.7, yaw: 0 }];
    w.vehicles[0].speed = 8;
    w.vehicles[0].direct = true;
    w = setMoveOrder(w, { kind: 'through', dest: { x: 45, y: 30 } });
    let crashes = 0;
    let d = buildDrive(w);
    for (let i = 0; i < 3; i++) {
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      crashes += w.events.filter((e) => e.t === 'collision' && e.b === 'carWreck-1').length;
      freeDrive(d);
      d = next!;
    }
    freeDrive(d);
    expect(crashes).toBeGreaterThan(0);
    expect(me(w).pos.x).toBeLessThan(wreckAt.x);
  });

  it('ramming a rock is a crash that damages parts', () => {
    let w = emptyWorld();
    w.obstacles = [{ id: 'rock1', pos: { x: 36, y: 30 }, r: 0.8, kind: 'rock' }];
    w.vehicles[0].speed = 5;
    w.vehicles[0].direct = true;
    w = setMoveOrder(w, { kind: 'through', dest: { x: 45, y: 30 } });
    const hp = partHp(me(w));
    let crashes = 0;
    let d = buildDrive(w);
    for (let i = 0; i < 3; i++) {
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      crashes += w.events.filter((e) => e.t === 'collision' && e.b === 'rock1').length;
      freeDrive(d);
      d = next!;
    }
    expect(crashes).toBeGreaterThan(0);
    expect(partHp(me(w))).toBeLessThan(hp);
  });

  it('in manual mode the truck drives into a truck parked on its path; off, it routes around', () => {
    const drive = (manual: boolean) => {
      let w = ordered({ kind: 'through', dest: { x: 45, y: 30 } }, 3);
      const parked = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 37, y: 30 }, Math.PI / 2);
      w = setDirect(w, manual);
      let d = buildDrive(w);
      const hits: string[] = [];
      for (let i = 0; i < 4; i++) {
        let next: Drive | null = null;
        w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
        hits.push(...w.events.flatMap((e) => (e.t === 'collision' ? [e.b] : [])));
        freeDrive(d);
        d = next!;
      }
      freeDrive(d);
      return { hits, parked: parked.id, w };
    };
    const on = drive(true);
    expect(on.hits).toContain(on.parked);
    expect(me(on.w).direct).toBe(true);
    const off = drive(false);
    expect(off.hits).toEqual([]);
    expect(me(off.w).pos.x).toBeGreaterThan(38);
  });

  it('a careful driver follows the route around a rock wall', () => {
    let w = ordered({ kind: 'stopAt', dest: { x: 40, y: 30 } });
    w.obstacles = [0, 1, 2, 3].map((i) => ({ id: `r${i}`, pos: { x: 34, y: 28 + i * 1.5 }, r: 0.8, kind: 'rock' as const }));
    let d = buildDrive(w);
    let crashes = 0;
    for (let i = 0; i < 12 && me(w).order; i++) {
      let r: TurnResult | null = null;
      w = endTurn(w, physicsMove(d, (x) => (r = x)));
      crashes += w.events.filter((e) => e.t === 'collision').length;
      freeDrive(d);
      d = r!.next;
    }
    expect(crashes).toBe(0);
    expect(dist(me(w).pos, { x: 40, y: 30 })).toBeLessThan(RULES.arriveRadius + 0.3);
  });

  it('a site stops the truck at its edge; its buildings are scenery', () => {
    let w = ordered({ kind: 'through', dest: { x: 45, y: 30 } }, 4);
    w.obstacles = [
      { id: 'site-test', pos: { x: 40, y: 30 }, r: 3, kind: 'site' },
      { id: 'bld-test-0', pos: { x: 35.5, y: 30 }, r: 0.6, kind: 'building' },
    ];
    w.vehicles[0].direct = true;
    let d = buildDrive(w);
    expect(d.obstacles['bld-test-0']).toBeUndefined();
    const hits: string[] = [];
    for (let i = 0; i < 4; i++) {
      let r: TurnResult | null = null;
      w = endTurn(w, physicsMove(d, (x) => (r = x)));
      hits.push(...w.events.flatMap((e) => (e.t === 'collision' ? [e.b] : [])));
      freeDrive(d);
      d = r!.next;
    }
    expect(hits).toContain('site-test');
    expect(hits).not.toContain('bld-test-0');
    expect(dist(me(w).pos, { x: 40, y: 30 })).toBeGreaterThan(3);
  });

  it('a truck without an engine is pushed toward the click at limp speed, burns no fuel and makes no sound', () => {
    const w0 = ordered({ kind: 'stopAt', dest: { x: 38, y: 30 } });
    w0.vehicles[0].items = w0.vehicles[0].items.filter((it) => it.kind !== 'part' || partDef(it.part.defId).kind !== 'engine');
    const fuel = w0.player.fuel;
    const { w, d } = play(w0, 3);
    expect(me(w).pos.x).toBeGreaterThan(30 + RULES.limpSpeed);
    expect(me(w).speed).toBeLessThanOrEqual(RULES.limpSpeed + 0.3);
    expect(w.player.fuel).toBe(fuel);
    expect(soundRange(w, me(w))).toBe(0);
    freeDrive(d);
  });

  it('an empty tank still crawls toward the click', () => {
    const w0 = ordered({ kind: 'through', dest: { x: 45, y: 30 } });
    w0.player.fuel = 0;
    const { w } = play(w0, 2);
    expect(me(w).pos.x).toBeGreaterThan(30.5);
    expect(me(w).speed).toBeLessThanOrEqual(RULES.limpSpeed + 0.3);
  });

  it('low fuel halves the top speed', () => {
    const w0 = ordered({ kind: 'through', dest: { x: 59, y: 30 } }, 5);
    w0.player.fuel = 2;
    const { w } = play(w0, 2);
    expect(me(w).speed).toBeLessThan(5);
  });

  it('a truck loaded with scrap covers less distance from rest than an empty one', () => {
    const empty = ordered({ kind: 'through', dest: { x: 59, y: 30 } });
    removeAllGoods(me(empty));
    const loaded = ordered({ kind: 'through', dest: { x: 59, y: 30 } });
    addGoods(loaded, me(loaded), 'scrap', 999);
    expect(vehicleMass(me(loaded))).toBeGreaterThan(vehicleMass(me(empty)));
    const a = play(empty, 2).w;
    const b = play(loaded, 2).w;
    expect(me(b).pos.x - 30).toBeLessThan(me(a).pos.x - 30);
  });

  it('the physics body mass follows the loadout on sync', () => {
    const w = emptyWorld();
    const d = buildDrive(w);
    const body = () => d.world.getRigidBody(d.bodies[me(w).id]);
    expect(body().mass()).toBeCloseTo(vehicleMass(me(w)), 0);
    addGoods(w, me(w), 'scrap', 999);
    syncDrive(d, w);
    expect(body().mass()).toBeCloseTo(vehicleMass(me(w)), 0);
    freeDrive(d);
  });

  it.each([0, -4])('a truck on a hill it can climb with a start speed of %s m/s drives up instead of backing away', async (start) => {
    let w = emptyWorld({ x: 30, y: 30 });
    w.player.fuel = 999;
    const t = editableTerrain(w);
    const n = t.size;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) t.heights[j * (n + 1) + i] = Math.max(0, i - 20) * CRAWL_GRADE;
    let d = buildDrive(w);
    d.world.getRigidBody(d.bodies[me(w).id]).setLinvel({ x: start, y: start * CRAWL_GRADE, z: 0 }, true);
    for (let i = 0; i < 8; i++) {
      w = setMoveOrder(w, { kind: 'through', dest: { x: 50, y: 30 } });
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      freeDrive(d);
      d = next!;
      expect(d.memory[me(w).id].backFrom).toBeNull();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const body = d.world.getRigidBody(d.bodies[me(w).id]);
    const forward = rotateBy(body.rotation(), { x: 1, y: 0, z: 0 });
    const v = body.linvel();
    freeDrive(d);
    expect(v.x * forward.x + v.y * forward.y + v.z * forward.z).toBeGreaterThan(0);
  }, budget(240_000));

  it('a click in the hold zone keeps its speed up a hill', async () => {
    let w = emptyWorld({ x: 29, y: 30 });
    me(w).direct = true;
    const t = editableTerrain(w);
    const n = t.size;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) t.heights[j * (n + 1) + i] = Math.max(0, i - 28) * HILL_GRADE;
    let d = buildDrive(w);
    const speeds: number[] = [];
    for (let i = 0; i < 8; i++) {
      w = setMoveOrder(w, { kind: 'through', dest: { x: me(w).pos.x + RULES.throttleZones.reach / 2, y: 30 } });
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      freeDrive(d);
      d = next!;
      speeds.push(me(w).speed);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    freeDrive(d);
    expect(speeds[7]).toBeGreaterThan(speeds[1] * 0.95);
  }, budget(240_000));

  it('new vehicles and obstacles join the physics world', () => {
    const w = emptyWorld();
    const d = buildDrive(w);
    addVehicle(w, 'scrapjaw', 'buggy', [], { x: 40, y: 40 });
    w.obstacles = [...w.obstacles, { id: 'wreck1', pos: { x: 20, y: 20 }, r: 0.6, kind: 'wreck' }];
    syncDrive(d, w);
    expect(Object.keys(d.bodies)).toHaveLength(2);
    expect(d.obstacles.wreck1).toBeDefined();
    w.vehicles.pop();
    syncDrive(d, w);
    expect(Object.keys(d.bodies)).toHaveLength(1);
  });

  it('a hitched player leaves physics and returns on unhitch', () => {
    let w = emptyWorld();
    w.player.fuel = 0;
    for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
    const trader = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 40, y: 30 }, Math.PI);
    trader.brain = npcBrain('trader', trader.pos, ['trader']);
    let d = buildDrive(w);
    const turn = () => {
      let r: TurnResult | null = null;
      w = endTurn(w, physicsMove(d, (x) => (r = x)));
      freeDrive(d);
      d = r!.next;
      return r!;
    };
    for (let i = 0; i < 30 && !playerTow(w); i++) turn();
    expect(playerTow(w)).not.toBeNull();
    w = chooseText(w, 'Deal. Hitch me up.');
    const start = { ...me(w).pos };
    for (let i = 0; i < 10; i++) {
      const r = turn();
      expect(d.bodies[me(w).id]).toBeUndefined();
      expect(r.frames[me(w).id]).toBeUndefined();
    }
    expect(dist(me(w).pos, start)).toBeGreaterThan(3);
    w = unhitch(w);
    for (let i = 0; i < 3; i++) turn();
    expect(d.bodies[me(w).id]).toBeDefined();
    freeDrive(d);
  });

  it('an NPC on the player rope leaves physics, trails the player and returns when let go', () => {
    let w = emptyWorld();
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 26, y: 30 }, 0);
    npc.brain = npcBrain('scavenger', npc.pos, ['scavenger']);
    npc.resources!.fuel = 0;
    let d = buildDrive(w);
    const turn = () => {
      let r: TurnResult | null = null;
      w = endTurn(w, physicsMove(d, (x) => (r = x)));
      freeDrive(d);
      d = r!.next;
      return r!;
    };
    const pick = (text: string) => { w = chooseText(w, text); };
    w = callVehicle(w, npc.id);
    pick('Need a tow to town?');
    pick('Deal. Hitch up.');
    w = setMoveOrder(w, { kind: 'stopAt', dest: { x: 60, y: 30 } });
    const start = { ...npc.pos };
    for (let i = 0; i < 6; i++) {
      const r = turn();
      expect(d.bodies[npc.id]).toBeUndefined();
      expect(r.frames[npc.id]).toBeUndefined();
    }
    const towed = w.vehicles.find((v) => v.id === npc.id)!;
    expect(dist(towed.pos, start)).toBeGreaterThan(3);
    expect(dist(towed.pos, me(w).pos)).toBeLessThanOrEqual(TOW.gap + 1e-6);
    w = callVehicle(w, npc.id);
    pick('I am letting you off the rope here.');
    pick('Over and out.');
    for (let i = 0; i < 3; i++) turn();
    expect(d.bodies[npc.id]).toBeDefined();
    freeDrive(d);
  });
});
