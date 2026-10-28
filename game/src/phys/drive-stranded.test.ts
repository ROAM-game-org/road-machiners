import { beforeAll, describe, expect, it } from 'vitest';
import { partDef } from '../data/parts';
import { RULES } from '../data/rules';
import { addVehicle, emptyWorld, PLAIN_KIT } from '../sim/testkit';
import { TEST_MAP } from '../test/map';
import { defaultSetup } from '../sim/settings';
import type { MoveOrder, Obstacle, World } from '../sim/types';
import { angleDiff, DEG, dist, type Vec } from '../sim/vec';
import { endTurn, newWorld, setDirect, setMoveOrder } from '../sim/world';
import { PHYSICS } from '../data/physics';
import { chassisDef } from '../data/chassis';
import { bodyOf } from '../sim/body';
import { buildDrive, freeDrive, initPhysics, restWheels, simulateTurn, tailKick, trailFrames, TURN_STEPS, type Drive } from './drive';
import { headingOf, upOf } from './frames';
import { dropClearance, spillOil, type OilSpill } from '../sim/hazards';
import { OIL, oilSlickLength } from '../data/utilities';
import { physicsMove } from './turn';
import { getUnstuck } from '../sim/unstuck';
import { KICK_SEEN, me, ordered, play } from '../test/drive-kit';

beforeAll(async () => {
  await initPhysics();
});

describe('stranded trucks', () => {
  function strandedRun(w: World, d: Drive, turns: number): { w: World; counts: number[] } {
    const counts: number[] = [];
    for (let i = 0; i < turns; i++) {
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      freeDrive(d);
      d = next!;
      counts.push(w.vehicles[0].strandedTurns!);
    }
    freeDrive(d);
    return { w, counts };
  }

  const expected = [...Array.from({ length: RULES.stranded.turns }, (_, i) => i + 1), 0];

  it('sets a truck back on its wheels after it ends the stranded turns flipped', () => {
    const w = emptyWorld();
    const d = buildDrive(w);
    d.world.getRigidBody(d.bodies[w.vehicles[0].id]).setRotation({ x: 1, y: 0, z: 0, w: 0 }, true);
    expect(strandedRun(w, d, RULES.stranded.turns + 1).counts).toEqual(expected);
  });

  it('sets a flipped truck in a closed ring of rocks upright outside the ring', () => {
    const w = emptyWorld({ x: 60, y: 60 });
    w.obstacles = Array.from({ length: 16 }, (_, i): Obstacle => {
      const a = (2 * Math.PI * i) / 16;
      return { id: `ring${i}`, kind: 'rock', pos: { x: 60 + Math.cos(a) * 3.5, y: 60 + Math.sin(a) * 3.5 }, r: 1.2 };
    });
    const d = buildDrive(w);
    d.world.getRigidBody(d.bodies[w.vehicles[0].id]).setRotation({ x: 1, y: 0, z: 0, w: 0 }, true);
    const { w: after, counts } = strandedRun(w, d, RULES.stranded.turns + 1);
    expect(counts).toEqual(expected);
    expect(dist(after.vehicles[0].pos, { x: 60, y: 60 })).toBeGreaterThan(4.7);
  });

  it('stands a flipped truck upright at the spot after one turn of Get unstuck', () => {
    const w = emptyWorld({ x: 60, y: 60 });
    const d = buildDrive(w);
    d.world.getRigidBody(d.bodies[w.vehicles[0].id]).setRotation({ x: 1, y: 0, z: 0, w: 0 }, true);
    const unstuck = getUnstuck(w);
    const { w: after, counts } = strandedRun(unstuck, d, 1);
    expect(counts).toEqual([0]);
    expect(dist(after.vehicles[0].pos, w.vehicles[0].pos)).toBeLessThan(1);
  });

  it('sets a truck lying on top of another truck down on free ground beside it', () => {
    const w = emptyWorld();
    const npc = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 30, y: 30 });
    const d = buildDrive(w);
    const under = d.world.getRigidBody(d.bodies[npc.id]).translation();
    const top = d.world.getRigidBody(d.bodies[w.vehicles[0].id]);
    top.setTranslation({ x: under.x, y: under.y + bodyOf('hauler').half.y + bodyOf(w.vehicles[0].chassisId).half.y * 2, z: under.z }, true);
    const { w: after, counts } = strandedRun(w, d, RULES.stranded.turns + 1);
    expect(counts).toEqual(expected);
    const me = after.vehicles[0];
    const hauler = after.vehicles.find((v) => v.id === npc.id)!;
    expect(dist(me.pos, hauler.pos)).toBeGreaterThan(chassisDef(me.chassisId).radius + chassisDef('hauler').radius);
  });

  const hungRock: Obstacle = { id: 'rock2703', kind: 'rock', pos: { x: 403.3848, y: 24.1321 }, r: 1.2953 };
  const besideRock = (dx: number, dy: number): Vec => ({ x: hungRock.pos.x + dx, y: hungRock.pos.y + dy });

  function hungOnRock(order: MoveOrder | null): World {
    const w = newWorld(1, PLAIN_KIT, TEST_MAP, defaultSetup('roaming'));
    w.vehicles = w.vehicles.filter((v) => v.faction === 'player');
    w.states = [];
    w.obstacles = [hungRock];
    const truck = w.vehicles[0];
    truck.pos = besideRock(1.4, 0);
    truck.heading = Math.PI;
    truck.order = order;
    return w;
  }

  it('sets down a truck hung on a rock that tries to drive and does not move', () => {
    const order: MoveOrder = { kind: 'stopAt', dest: besideRock(-6, 0) };
    const w = hungOnRock(order);
    const { w: after, counts } = strandedRun(w, buildDrive(w), RULES.stranded.turns + 1);
    expect(counts).toEqual(expected);
    const me = after.vehicles[0];
    expect(dist(me.pos, hungRock.pos)).toBeGreaterThan(dist(w.vehicles[0].pos, hungRock.pos));
    const setDownAt = { ...me.pos };
    me.order = order;
    const { w: freed, counts: freedCounts } = strandedRun(after, buildDrive(after), 3);
    expect(freedCounts).toEqual([0, 0, 0]);
    expect(dist(freed.vehicles[0].pos, setDownAt)).toBeGreaterThan(3);
  });

  it('does not set down a truck parked against a rock', () => {
    const w = hungOnRock(null);
    expect(strandedRun(w, buildDrive(w), RULES.stranded.turns + 1).counts).toEqual([0, 0, 0, 0]);
  });

  it('does not set down a truck that drives into a boulder on flat ground with every wheel down', () => {
    const w = emptyWorld();
    w.obstacles = [{ id: 'boulder', kind: 'rock', pos: { x: 34, y: 30 }, r: 2.5 }];
    w.vehicles[0].order = { kind: 'through', dest: { x: 80, y: 30 } };
    expect(strandedRun(w, buildDrive(w), RULES.stranded.turns + 1).counts).toEqual([0, 0, 0, 0]);
  });
});

describe('a truck held against a prop with every wheel down', () => {
  const pocket = (): World => {
    const w = emptyWorld();
    w.obstacles = [
      { id: 'rock-a', kind: 'rock', pos: { x: 32.3, y: 30 }, r: 1.5 },
      { id: 'rock-b', kind: 'rock', pos: { x: 30, y: 32.3 }, r: 1.5 },
      { id: 'rock-c', kind: 'rock', pos: { x: 30, y: 27.7 }, r: 1.5 },
      { id: 'rock-d', kind: 'rock', pos: { x: 27.7, y: 30 }, r: 1.5 },
    ];
    return w;
  };

  function counts(w: World, turns: number): { w: World; counts: number[] } {
    let d = buildDrive(w);
    const out: number[] = [];
    for (let i = 0; i < turns; i++) {
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      freeDrive(d);
      d = next!;
      out.push(w.vehicles[0].strandedTurns!);
    }
    freeDrive(d);
    return { w, counts: out };
  }

  it('sets down a truck that pushes against rocks all around it and does not move', () => {
    const w = setDirect(pocket(), true);
    w.vehicles[0].order = { kind: 'through', dest: { x: 50, y: 30 } };
    const run = counts(w, RULES.stranded.turns + 2);
    expect(run.counts).toEqual([0, ...Array.from({ length: RULES.stranded.turns }, (_, i) => i + 1), 0]);
    expect(w.obstacles.every((o) => dist(run.w.vehicles[0].pos, o.pos) > o.r)).toBe(true);
  });

  it('does not count a truck with no order', () => {
    expect(counts(pocket(), RULES.stranded.turns + 1).counts).toEqual([0, 0, 0, 0]);
  });

  it('does not count a truck pushing nose to nose against another truck', () => {
    const w = emptyWorld();
    const other = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 33, y: 30 });
    other.heading = Math.PI;
    w.vehicles = [w.vehicles[0], other];
    w.vehicles[0].order = { kind: 'through', dest: { x: 50, y: 30 } };
    expect(counts(setDirect(w, true), RULES.stranded.turns + 1).counts).toEqual([0, 0, 0, 0]);
  });

  it('does not count a braking truck', () => {
    const w = pocket();
    w.vehicles[0].order = { kind: 'brake' };
    expect(counts(w, RULES.stranded.turns + 1).counts).toEqual([0, 0, 0, 0]);
  });
});

describe('trucks held on a low prop', () => {
  const reach = RULES.stranded.reach;

  function onTrap(offset: Vec, dest: Vec): { w: World; d: Drive } {
    let w = emptyWorld();
    const truck = w.vehicles[0];
    truck.heading = 0;
    truck.speed = 0;
    w.obstacles = [{ id: 'trap', kind: 'landmark', look: 'tankTrap', pos: { x: truck.pos.x + offset.x, y: truck.pos.y + offset.y }, r: 0.25, yaw: 0.7 }];
    w = setMoveOrder(w, { kind: 'stopAt', dest });
    const d = buildDrive(w);
    const body = d.world.getRigidBody(d.bodies[w.vehicles[0].id]);
    const at = body.translation();
    body.setTranslation({ x: at.x, y: at.y + 1.6, z: at.z }, true);
    return { w, d };
  }

  interface Turn {
    count: number;
    anchor: Vec | undefined;
    pos: Vec;
    moved: number;
  }

  function turns(w: World, d: Drive, n: number): Turn[] {
    const out: Turn[] = [];
    for (let i = 0; i < n; i++) {
      const before = { ...w.vehicles[0].pos };
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      freeDrive(d);
      d = next!;
      const v = w.vehicles[0];
      out.push({ count: v.strandedTurns ?? 0, anchor: v.strandedAt, pos: { ...v.pos }, moved: dist(before, v.pos) });
    }
    freeDrive(d);
    return out;
  }

  const rocking: [string, Vec, Vec][] = [
    ['to the side', { x: 0.2, y: 0.3 }, { x: 27, y: 31.5 }],
    ['behind', { x: 0.2, y: -0.3 }, { x: 27, y: 31.5 }],
  ];

  it.each(rocking)('counts a truck rocking on a tank trap up to the set-down, order %s', (_, offset, dest) => {
    const { w, d } = onTrap(offset, dest);
    const run = turns(w, d, 8);
    const first = run.findIndex((t) => t.count > 0);
    const from = run[first].pos;
    const window = run.slice(first, first + RULES.stranded.turns);
    const gotClear = window.some((t) => dist(t.pos, from) >= reach);
    expect(gotClear || window.at(-1)!.count === RULES.stranded.turns).toBe(true);
    expect(dist(run.at(-1)!.pos, dest)).toBeLessThan(1.5);
  });

  it('keeps counting while the truck rocks inside reach of its anchor', () => {
    const { w, d } = onTrap({ x: 0.2, y: 0.3 }, { x: 27, y: 31.5 });
    const counted = turns(w, d, 8).filter((t) => t.count > 0);
    expect(counted.some((t) => t.moved > 0.1)).toBe(true);
    expect(counted.filter((t) => t.count < RULES.stranded.turns).every((t) => t.anchor !== undefined)).toBe(true);
  });

  it('ends the run of a truck that drives clear of the trap', () => {
    const { w, d } = onTrap({ x: 0.55, y: 0 }, { x: 26, y: 30 });
    const last = turns(w, d, 6).at(-1)!;
    expect([last.count, last.anchor]).toEqual([0, undefined]);
  });

  it.each([
    ['straight behind', { x: 27, y: 30 }],
    ['behind to the side', { x: 27, y: 33 }],
  ])('never holds a truck turning around on open ground with an order %s', (_, dest) => {
    const w = emptyWorld();
    w.vehicles[0].order = { kind: 'stopAt', dest };
    expect(turns(w, buildDrive(w), 8).map((t) => t.count)).toEqual(Array(8).fill(0));
  });
});

describe('oil patches', () => {
  function oiled(dest: Vec, patches: Vec[], r = 1.25): World {
    const w = setDirect(ordered({ kind: 'through', dest }, 6), true);
    w.fields = patches.map((pos, i) => ({ id: `oil${i}`, kind: 'oil', source: me(w).id, pos, r, turnsLeft: 8, hit: [] }));
    return w;
  }

  function endOfTurn(w: World): { x: number; z: number } {
    const d = buildDrive(w);
    const r = simulateTurn(d, w);
    const { pos } = r.frames[me(w).id].at(-1)!;
    freeDrive(r.next);
    freeDrive(d);
    return { x: pos.x, z: pos.z };
  }

  function slick(x0: number, x1: number, y0: number, y1: number): Vec[] {
    const out: Vec[] = [];
    for (let x = x0; x <= x1; x += 2) for (let y = y0; y <= y1; y += 2) out.push({ x, y });
    return out;
  }

  function spillOf(): OilSpill {
    const def = partDef('oilSpiller');
    if (def.kind !== 'utility' || def.effect.type !== 'oil') throw new Error('The oil spiller spills no oil');
    return def.effect;
  }

  function streakAhead(speed: number, spills: number, gap = 2): World {
    const w = ordered({ kind: 'through', dest: { x: 80, y: 30 } }, speed);
    const spill = spillOf();
    const dropper = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 0, y: 30 });
    dropper.pos = { x: 30 + gap + dropClearance(dropper, spill.behind) + oilSlickLength(), y: 30 };
    for (let i = 0; i < spills; i++) spillOil(w, dropper, spill);
    w.vehicles = w.vehicles.filter((v) => v.id !== dropper.id);
    w.player.visible = [];
    return w;
  }

  function crossing(w: World): { x: number; z: number; heading: number; lowestUp: number; kicks: number } {
    const d = buildDrive(w);
    const r = simulateTurn(d, w);
    const frames = r.frames[me(w).id];
    freeDrive(r.next);
    freeDrive(d);
    const yaw = frames.slice(1).map((f, i) => angleDiff(headingOf(frames[i].rot), headingOf(f.rot)) * PHYSICS.stepsPerSecond);
    const kicks = yaw.slice(1).filter((rate, i) => Math.abs(rate - yaw[i]) > KICK_SEEN).length;
    const end = frames.at(-1)!;
    return { x: end.pos.x, z: end.pos.z, heading: headingOf(end.rot), lowestUp: Math.min(...frames.map((f) => upOf(f.rot))), kicks };
  }

  it('a truck crossing a slick straight at 10 tiles per turn loses its line', () => {
    const dry = crossing(streakAhead(10, 0));

    const wet = crossing(streakAhead(10, 1));

    const turned = Math.abs(angleDiff(dry.heading, wet.heading)) >= 20 * DEG;
    const offset = Math.abs(wet.z - dry.z) >= 2;
    expect(turned || offset).toBe(true);
  });

  it('a truck crossing a slick straight at 3 tiles per turn keeps its line', () => {
    const dry = crossing(streakAhead(3, 0, 0.5));

    const wet = crossing(streakAhead(3, 1, 0.5));

    expect(Math.hypot(wet.x - dry.x, wet.z - dry.z)).toBeLessThan(0.5);
  });

  it('kicks the tail once in a turn, however long the rear wheels stay on oil', () => {
    const dry = crossing(streakAhead(10, 0));

    const wet = crossing(streakAhead(10, 1));

    expect(dry.kicks).toBe(0);
    expect(wet.kicks).toBe(1);
  });

  it('gives no kick to a truck reaching oil at the safe speed', () => {
    expect(crossing(streakAhead(3.5, 1, 0.5)).kicks).toBe(0);
  });

  it('gives the same end pose twice from the same input', () => {
    expect(crossing(streakAhead(10, 1))).toEqual(crossing(streakAhead(10, 1)));
  });

  it('two slicks on one spot act as one', () => {
    expect(crossing(streakAhead(10, 2))).toEqual(crossing(streakAhead(10, 1)));
  });

  it('leaves no truck rolled over after a kick', () => {
    for (const speed of [5, 6, 8, 10, 12]) expect(crossing(streakAhead(speed, 1)).lowestUp).toBeGreaterThan(0.5);
  });

  it('sizes the kick by speed over the safe speed, up to the cap', () => {
    const left = [false, false, true, false];

    expect(Math.abs(tailKick(OIL.safeSpeed, left, 0))).toBe(0);
    expect(Math.abs(tailKick(OIL.safeSpeed * 2, left, 0))).toBeCloseTo(OIL.kick);
    expect(Math.abs(tailKick(1000, left, 0))).toBe(OIL.maxKick);
  });

  it('swings the tail toward the oiled rear wheel, and with both on oil with the yaw rate or else to the left', () => {
    const fast = OIL.safeSpeed * 3;

    expect(tailKick(fast, [false, false, true, false], 0)).toBeLessThan(0);
    expect(tailKick(fast, [false, false, false, true], 0)).toBeGreaterThan(0);
    expect(tailKick(fast, [false, false, true, true], -0.1)).toBeLessThan(0);
    expect(tailKick(fast, [false, false, true, true], 0.1)).toBeGreaterThan(0);
    expect(tailKick(fast, [false, false, true, true], 0)).toBeGreaterThan(0);
  });

  it('refuses a kick with no rear wheel on oil', () => {
    expect(() => tailKick(10, [true, true, false, false], 0)).toThrow();
  });

  it('a truck steering hard on oil slides out of its dry line', () => {
    const dest = { x: 34, y: 40 };
    const dry = endOfTurn(oiled(dest, []));

    const wet = endOfTurn(oiled(dest, slick(28, 46, 24, 44)));

    expect(Math.hypot(wet.x - dry.x, wet.z - dry.z)).toBeGreaterThan(2);
  });

  it('overlapping patches cut grip as much as one patch', () => {
    const dest = { x: 34, y: 40 };
    const dry = endOfTurn(oiled(dest, []));
    const one = endOfTurn(oiled(dest, [{ x: 34, y: 32 }], 2));

    const many = endOfTurn(oiled(dest, [{ x: 34, y: 32 }, { x: 34, y: 32 }, { x: 34.5, y: 32 }], 2));

    expect(one).not.toEqual(dry);
    expect(many).toEqual(one);
  });
});

describe('a truck an emitter pulse shut down', () => {
  function shutDown(order: MoveOrder | null): World {
    const w = order ? ordered(order, 8) : emptyWorld();
    me(w).speed = 8;
    me(w).shutDown = { from: w.turn + 1, until: w.turn + 10 };
    return w;
  }

  it('coasts on with no order, keeping over half its speed after a turn', () => {
    const { w, d } = play(shutDown(null), 1);
    freeDrive(d);

    expect(me(w).speed).toBeGreaterThan(4);
  });

  it('coasts toward a drive-through point instead of braking, and burns no fuel', () => {
    const w0 = shutDown({ kind: 'through', dest: { x: 120, y: 30 } });
    const fuel = w0.player.fuel;
    const { w, d } = play(w0, 1);
    freeDrive(d);

    expect(me(w).speed).toBeGreaterThan(4);
    expect(w.player.fuel).toBe(fuel);
  });

  it('still brakes to a stop on a brake order', () => {
    const { w, d } = play(shutDown({ kind: 'brake' }), 3);
    freeDrive(d);

    expect(me(w).speed).toBeLessThan(0.1);
  });
});

describe('rope frames roll the wheels', () => {
  it('rolls a wheel in the same direction as a truck driving forward', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const me = w.vehicles[0];
    me.order = { kind: 'stopAt', dest: { x: 40, y: 30 } };
    const d = buildDrive(w);
    const result = simulateTurn(d, w);
    const frames = result.frames[me.id];
    expect(frames[frames.length - 1].pos.x).toBeGreaterThan(frames[0].pos.x);
    const drove = frames[frames.length - 1].wheels[2].spin - frames[0].wheels[2].spin;
    const dx = (frames[frames.length - 1].pos.x - frames[0].pos.x) / bodyOf(me.chassisId).wheelRadius;
    freeDrive(d);

    const rope = emptyWorld({ x: 30, y: 30 });
    const towed = rope.vehicles[0];
    towed.trail = [{ x: 30, y: 30, heading: 0 }, { x: 31, y: 30, heading: 0 }];
    const roped = trailFrames(rope, towed, restWheels(towed.chassisId));
    expect(Math.sign(roped[roped.length - 1].wheels[2].spin)).toBe(Math.sign(drove));
    expect(Math.sign(drove)).toBe(Math.sign(dx));
  });

  it('rolls every wheel by the distance driven over its radius, from the given spin', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const v = w.vehicles[0];
    v.trail = [{ x: 30, y: 30, heading: 0 }, { x: 31, y: 30, heading: 0 }];
    const start = { front: restWheels(v.chassisId).front.map((wheel) => ({ ...wheel, spin: 2 })), rear: null };
    const frames = trailFrames(w, v, start);
    expect(frames).toHaveLength(TURN_STEPS);
    const roll = PHYSICS.metersPerTile / bodyOf(v.chassisId).wheelRadius;
    for (const wheel of frames[frames.length - 1].wheels) expect(Math.abs(wheel.spin - 2)).toBeCloseTo(roll, 6);
    expect(Math.abs(frames[0].wheels[0].spin - 2)).toBeLessThan(roll / TURN_STEPS + 1e-6);
  });

  it('turns the outer wheels more than the inner ones in a bend', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const v = w.vehicles[0];
    v.trail = [{ x: 30, y: 30, heading: 0 }, { x: 31, y: 31, heading: Math.PI / 2 }];
    const frames = trailFrames(w, v, restWheels(v.chassisId));
    const last = frames[frames.length - 1].wheels;
    expect(Math.abs(last[2].spin - last[3].spin)).toBeGreaterThan(0.1);
  });

  it('throws when the start wheels do not match the chassis', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const v = w.vehicles[0];
    v.trail = [{ x: 30, y: 30, heading: 0 }, { x: 31, y: 30, heading: 0 }];
    expect(() => trailFrames(w, v, { front: [], rear: null })).toThrow(/wheels/);
  });
});

