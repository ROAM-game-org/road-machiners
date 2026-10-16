import { beforeAll, describe, expect, it } from 'vitest';
import { partDef } from '../data/parts';
import { RULES } from '../data/rules';
import { addVehicle, emptyWorld } from '../sim/testkit';
import type { MoveOrder, World } from '../sim/types';
import { angleDiff, DEG, dist, type Vec } from '../sim/vec';
import { endTurn, setDirect } from '../sim/world';
import { PHYSICS } from '../data/physics';
import { chassisDef } from '../data/chassis';
import { bodyOf } from '../sim/body';
import { buildDrive, freeDrive, initPhysics, restWheels, simulateTurn, tailKick, trailFrames, TURN_STEPS, type Drive } from './drive';
import { headingOf, upOf } from './frames';
import { dropClearance, spillOil, type OilSpill } from '../sim/hazards';
import { OIL, oilSlickLength } from '../data/utilities';
import { physicsMove } from './turn';
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

  it('sets a truck lying on top of another truck down on free ground beside it', () => {
    const w = emptyWorld();
    const npc = addVehicle(w, 'traders', 'hauler', ['stockEngine'], { x: 30, y: 30 });
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
    const dropper = addVehicle(w, 'traders', 'scout', ['stockEngine'], { x: 0, y: 30 });
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
    const start = restWheels(v.chassisId).map((wheel) => ({ ...wheel, spin: 2 }));
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
    expect(() => trailFrames(w, v, [])).toThrow(/wheels/);
  });
});

