import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { makePart } from '../sim/factory';
import { mountPart } from '../sim/inventory';
import { addVehicle, emptyWorld, npcBrain } from '../sim/testkit';
import type { World } from '../sim/types';
import { stateOf } from '../sim/states';
import { cloneWorld, endTurn, setDirect, setMoveOrder } from '../sim/world';
import { PHYSICS } from '../data/physics';
import { CLAYMORE } from '../data/utilities';
import { buildDrive, freeDrive, initPhysics, simulateTurn, type Drive } from './drive';
import { stepPhysics } from './snapshot';
import { upOf } from './frames';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

describe('stepPhysics', () => {
  function crashWorld(): RAPIER.World {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50).setTranslation(0, -0.5, 0));
    for (let i = 0; i < 40; i++) world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 1, 0.5).setTranslation(3 + (i % 8) * 1.5, 1, -6 + Math.floor(i / 8) * 1.5).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS));
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1, 0).setLinvel(12, 0, 1).setAngvel({ x: 0, y: 2, z: 0 }));
    world.createCollider(RAPIER.ColliderDesc.cuboid(1, 0.5, 2).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
    return world;
  }

  function play(step: (world: RAPIER.World, events: RAPIER.EventQueue) => void): { poses: number[]; hits: number } {
    const world = RAPIER.World.restoreSnapshot(crashWorld().takeSnapshot());
    const events = new RAPIER.EventQueue(true);
    let hits = 0;
    for (let i = 0; i < 180; i++) {
      step(world, events);
      events.drainCollisionEvents(() => hits++);
    }
    const poses = world.bodies.getAll().flatMap((b) => [...Object.values(b.translation()), ...Object.values(b.rotation())]);
    events.free();
    world.free();
    return { poses, hits };
  }

  it('moves every body exactly as World.step does and raises the same collision events', () => {
    const plain = play((world, events) => world.step(events));
    const direct = play(stepPhysics);

    expect(plain.hits).toBeGreaterThan(0);
    expect(direct).toEqual(plain);
  });
});

describe('impact geometry', () => {
  it('captures rear-end contacts and relative closing speed before the turn ends', () => {
    const world = emptyWorld({ x: 35, y: 30 });
    const target = world.vehicles[0];
    target.speed = 2;
    const attacker = addVehicle(world, 'scrapjaw', 'scout', ['mg', 'stockEngine', 'ram'], { x: 30, y: 30 });
    attacker.speed = 7;
    attacker.order = null;
    const drive = buildDrive(world);
    const result = simulateTurn(drive, world);
    try {
      const crash = result.crashes.find((hit) => [hit.a, hit.b].includes(attacker.id));
      if (!crash) throw new Error('Expected rear-end collision');
      const front = crash.a === attacker.id ? crash.contact.a : crash.contact.b;
      const rear = crash.a === target.id ? crash.contact.a : crash.contact.b;
      expect(front?.side).toBe('front');
      expect(rear?.side).toBe('rear');
      expect(crash.impact).toBeCloseTo((7 - 2) * PHYSICS.metersPerTile, 0);
      expect(structuredClone(crash)).toEqual(crash);
    } finally {
      freeDrive(result.next);
      freeDrive(drive);
    }
  });

  function noseRam(arm: boolean, into: 'truck' | 'rock' = 'truck'): World {
    let w = emptyWorld();
    w.vehicles[0].speed = 7;
    w.vehicles[0].heading = 0;
    w.vehicles[0].items = w.vehicles[0].items.filter((i) => !(i.kind === 'part' && i.part.defId === 'cage'));
    const ram = makePart(w, 'claymoreRam', 0);
    if (!mountPart(w, w.vehicles[0], ram)) throw new Error('No front mount for the claymore ram');
    ram.charge = arm ? { reload: 0, armed: true } : { reload: 0 };
    if (into === 'rock') w.obstacles = [{ id: 'rock1', pos: { x: 35, y: 30 }, r: 0.8, kind: 'rock' }];
    else addVehicle(w, 'independent', 'carrier', ['mg', 'stockEngine'], { x: 35, y: 30 }, Math.PI / 2).brain = npcBrain('trader', { x: 35, y: 30 }, ['trader']);
    w = setDirect(w, true);
    return setMoveOrder(w, { kind: 'through', dest: { x: 45, y: 30 } });
  }

  function ramTurns(w: World, n: number): { w: World; blasts: string[] } {
    let d = buildDrive(w);
    const blasts: string[] = [];
    for (let i = 0; i < n; i++) {
      let next: Drive | null = null;
      w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
      blasts.push(...w.events.flatMap((e) => (e.t === 'claymore' ? [e.other] : [])));
      freeDrive(d);
      d = next!;
    }
    freeDrive(d);
    return { w, blasts };
  }

  it('counts a nose ram at its full closing speed on the rammer front and the rammed side', () => {
    const world = noseRam(false);
    const [me, parked] = world.vehicles;
    const drive = buildDrive(world);
    const result = simulateTurn(drive, world);
    try {
      const crash = result.crashes.find((hit) => hit.a === me.id && hit.b === parked.id);
      if (!crash) throw new Error('Expected the nose ram');
      expect(crash.impact).toBeGreaterThan(0.8 * 6 * PHYSICS.metersPerTile);
      expect(crash.contact.a.side).toBe('front');
      expect(crash.contact.b?.side).toBe('right');
      expect(crash.approach!.a).toBeGreaterThan(0.8 * 6 * PHYSICS.metersPerTile);
      expect(Math.abs(crash.approach!.b)).toBeLessThan(0.5);
      expect(crash.approach!.a + crash.approach!.b).toBeCloseTo(crash.impact, 3);
    } finally {
      freeDrive(result.next);
      freeDrive(drive);
    }
  });

  it('gives a parked truck a grievance on the truck that drove into it, through the real turn', () => {
    const { w } = ramTurns(noseRam(false), 1);
    const [me, parked] = w.vehicles;
    expect(stateOf(w, 'grievance', parked.id, me.id)).not.toBeNull();
  });

  it('keeps the claymore throw impulse and lift', () => {
    expect(CLAYMORE.throw).toEqual({ impulse: 40000, lift: 0.35 });
  });

  it('blows an armed claymore ram in a nose ram', () => {
    const { w, blasts } = ramTurns(noseRam(true), 2);
    expect(blasts).toEqual([w.vehicles[1].id]);
  });

  function afterRam(arm: boolean): { gap: number; lowestUp: number } {
    const w = noseRam(arm);
    const d = buildDrive(w);
    const r = simulateTurn(d, w);
    try {
      const [a, b] = w.vehicles.map((v) => r.frames[v.id]);
      const i = Math.min(a.length - 1, r.crashes[0].step + 12);
      return { gap: Math.hypot(a[i].pos.x - b[i].pos.x, a[i].pos.z - b[i].pos.z), lowestUp: Math.min(...[...a, ...b].map((f) => upOf(f.rot))) };
    } finally {
      freeDrive(r.next);
      freeDrive(d);
    }
  }

  it('throws both trucks apart in a claymore blast, without rolling either', () => {
    const plain = afterRam(false);
    const blown = afterRam(true);
    expect(blown.gap).toBeGreaterThan(plain.gap + 3);
    expect(blown.lowestUp).toBeGreaterThan(0.5);
  });

  it('throws each truck back from the other over the next turns', () => {
    const plain = ramTurns(noseRam(false), 2).w;
    const blown = ramTurns(noseRam(true), 2).w;
    expect(blown.vehicles[0].pos.x).toBeLessThan(plain.vehicles[0].pos.x - 1.5);
    expect(blown.vehicles[1].pos.x).toBeGreaterThan(plain.vehicles[1].pos.x + 1);
  });

  it('blows an armed claymore ram against a rock, even when the crash breaks the ram, and throws the truck back', () => {
    const plain = ramTurns(noseRam(false, 'rock'), 2).w;
    const blown = ramTurns(noseRam(true, 'rock'), 2);
    expect(blown.blasts).toEqual(['rock1']);
    expect(blown.w.vehicles[0].pos.x).toBeLessThan(plain.vehicles[0].pos.x - 1.5);
  });
});


it('an engine broken by an impact loses drive during the same physics turn', async () => {
  const { launchTimedRound, newTimedCombat, beginTimedCombat, endTimedCombat } = await import('../sim/timed-combat');
  const { mountedParts } = await import('../sim/grid');
  const { refreshVision } = await import('../sim/vision');
  const { declareFeud } = await import('../sim/states');
  const run = (impact: boolean) => {
    const world = emptyWorld();
    const shooter = addVehicle(world, 'player', 'buggy', ['mg', 'stockEngine'], { x: 30, y: 30 });
    const target = addVehicle(world, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 35, y: 30 }, Math.PI);
    world.player.vehicleId = shooter.id;
    world.vehicles = [shooter, target];
    declareFeud(world, target, shooter.id);
    refreshVision(world);
    target.direct = true;
    target.order = { kind: 'through', dest: { x: 20, y: 30 }, pace: 2 };
    const engine = mountedParts(target, 'engine')[0];
    engine.hp = 1;
    const state = newTimedCombat();
    world.combat = state;
    const flight = launchTimedRound(world, shooter, mountedParts(shooter, 'weapon')[0].id, target, 'body', 0, 220, false)!;
    expect(flight).not.toBeNull();
    flight.impactAt = { ...target.pos };
    flight.roll = { hit: true, error: 0, crit: false };
    if (impact) state.flights.push({ ...flight, landsAt: 1000 / PHYSICS.stepsPerSecond * 2 });
    beginTimedCombat(world, state, PHYSICS.turnSeconds * 1000);
    const drive = buildDrive(world);
    try {
      const result = simulateTurn(drive, world);
      endTimedCombat(world, state);
      try {
        const frames = result.frames[target.id];
        return { travel: Math.abs(frames.at(-1)!.pos.x - 35 * PHYSICS.metersPerTile), engineHp: engine.hp, impacts: state.records.filter(r => r.kind === 'impact').map(r => r.at) };
      } finally { freeDrive(result.next); }
    } finally { freeDrive(drive); }
  };
  const intact = run(false);
  const broken = run(true);
  expect(intact.engineHp).toBe(1);
  expect(broken.engineHp).toBe(0);
  expect(broken.impacts).toHaveLength(1);
  expect(broken.impacts[0]).toBeLessThan(1000 / PHYSICS.stepsPerSecond * 3);
  expect(intact.travel).toBeGreaterThan(0);
  expect(broken.travel).toBeLessThan(intact.travel);
});

it('keeps movement unchanged when combat has no firing or impacts', async () => {
  const { beginTimedCombat, endTimedCombat } = await import('../sim/timed-combat');
  const world = emptyWorld({ x: 30, y: 30 });
  const player = world.vehicles.find(v => v.id === world.player.vehicleId)!;
  world.vehicles = [player];
  player.direct = true;
  player.weaponOrders = {};
  player.order = { kind: 'through', dest: { x: 50, y: 30 } };
  const drive = buildDrive(world);
  try {
    const plain = simulateTurn(drive, cloneWorld(world));
    try {
      const activeWorld = cloneWorld(world);
      beginTimedCombat(activeWorld, activeWorld.combat, PHYSICS.turnSeconds * 1000);
      const active = simulateTurn(drive, activeWorld);
      try {
        endTimedCombat(activeWorld, activeWorld.combat);
        expect(active.frames[player.id]).toEqual(plain.frames[player.id]);
      } finally { freeDrive(active.next); }
    } finally { freeDrive(plain.next); }
  } finally { freeDrive(drive); }
});
