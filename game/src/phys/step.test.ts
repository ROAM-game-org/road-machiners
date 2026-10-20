import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { BREAKABLE } from '../data/rules';
import { PHYSICS } from '../data/physics';
import { addVehicle, emptyWorld } from '../sim/testkit';
import type { Obstacle, World } from '../sim/types';
import { setMoveOrder } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, simulateTurn, syncDrive, toTilesPerTurn } from './drive';
import { restoreWorld, stepWorld } from './snapshot';

beforeAll(async () => {
  await initPhysics();
});

const fence: Obstacle = { id: 'fence1', kind: 'landmark', look: 'fence', pos: { x: 40, y: 30 }, r: 0.5, yaw: Math.PI / 2 };

function fastTruckAtFence(): World {
  const w = emptyWorld({ x: 38, y: 30 });
  w.vehicles[0].speed = toTilesPerTurn(BREAKABLE.breakSpeed * 2);
  w.vehicles[0].direct = true;
  w.obstacles = [fence];
  return setMoveOrder(w, { kind: 'through', dest: { x: 60, y: 30 } });
}

function stepped(snapshot: Uint8Array, step: (world: RAPIER.World, events: RAPIER.EventQueue) => void) {
  const world = restoreWorld(snapshot);
  const events = new RAPIER.EventQueue(true);
  const contacts: [number, number, boolean][] = [];
  for (let i = 0; i < PHYSICS.stepsPerSecond * 2; i++) {
    step(world, events);
    events.drainCollisionEvents((a, b, started) => contacts.push([a, b, started]));
  }
  const result = { snapshot: world.takeSnapshot(), contacts };
  events.free();
  world.free();
  return result;
}

describe('stepWorld', () => {
  it('steps a world exactly as the library does, without its remap', () => {
    const drive = buildDrive(fastTruckAtFence());
    const start = drive.world.takeSnapshot();
    freeDrive(drive);
    const library = stepped(start, (world, events) => world.step(events));
    const owned = stepped(start, stepWorld);
    expect(library.contacts.length).toBeGreaterThan(0);
    expect(owned.contacts).toEqual(library.contacts);
    expect(owned.snapshot).toEqual(library.snapshot);
  });

  it('leaves a JS wrapper for every handle after a prop breaks and a body is removed', () => {
    const w = fastTruckAtFence();
    const other = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 38, y: 34 });
    const drive = buildDrive(w);
    expect(Object.keys(drive.bodies)).toContain(other.id);
    const result = simulateTurn(drive, w);
    expect(result.breaks.length).toBeGreaterThan(0);
    const next = result.next;
    const bodiesBefore = next.world.bodies.len();
    syncDrive(next, { ...w, vehicles: w.vehicles.slice(0, 1) });
    expect(next.world.bodies.len()).toBeLessThan(bodiesBefore);
    let colliders = 0;
    next.world.colliders.forEach((c) => {
      colliders++;
      expect(next.world.getCollider(c.handle)).not.toBeNull();
    });
    next.world.bodies.forEach((b) => expect(next.world.getRigidBody(b.handle)).not.toBeNull());
    expect(next.world.colliders.len()).toBe(colliders);
    freeDrive(drive);
    freeDrive(next);
  });

  it('refuses a freed world by name', () => {
    const world = new RAPIER.World({ x: 0, y: -9.8, z: 0 });
    world.free();
    expect(() => stepWorld(world)).toThrow('Physics world was stepped after it was freed');
  });
});
