import { beforeAll, describe, expect, it } from 'vitest';
import { PHYSICS } from '../data/physics';
import { editableTerrain, emptyWorld } from '../sim/testkit';
import { heightAt } from '../sim/terrain';
import { makeVehicle } from '../sim/factory';
import { bendField, restBend } from '../sim/rig';
import { couplingOf, rideOf, unitBody } from '../sim/body';
import type { World } from '../sim/types';
import { dist } from '../sim/vec';
import { endTurn } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, isLifted, type Drive } from './drive';
import { rotateBy, upOf } from './frames';
import { physicsMove } from './turn';

const SLOPE = 0.58;
const CENTRE = { x: 60, y: 60 };
const S = PHYSICS.metersPerTile;

beforeAll(async () => {
  await initPhysics();
});

function sloped(chassisId: string, heading: number): World {
  const w = emptyWorld(CENTRE);
  const me = w.vehicles[0];
  const made = makeVehicle(w, { faction: 'player', chassisId, parts: [{ defId: 'workhorseDiesel', wear: 0 }], spares: [], cargo: {}, pos: CENTRE, heading, brain: null });
  w.vehicles[0] = { ...made, id: me.id, speed: 0, ...bendField(restBend(chassisId)) };
  w.player.fuel = 999;
  editableTerrain(w);
  const row = w.terrain.size + 1;
  for (let j = 0; j < row; j++) for (let i = 0; i < row; i++) w.terrain.heights[j * row + i] = SLOPE * (i - CENTRE.x);
  return w;
}

function parkedTurns(w: World, d: Drive, turns: number): number[] {
  const ups: number[] = [];
  for (let i = 0; i < turns; i++) {
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
    d = next!;
    ups.push(upOf(d.world.getRigidBody(d.bodies[w.vehicles[0].id]).rotation()));
    expect(dist(w.vehicles[0].pos, CENTRE)).toBeLessThan(0.25);
  }
  freeDrive(d);
  return ups;
}

describe('seating a truck on the ground', () => {
  const chassis = ['scout', 'hauler', 'bus', 'semi', 'sorokonoga'];
  const headings = [0, Math.PI / 2, Math.PI / 4, Math.PI];

  for (const id of chassis) {
    for (const heading of headings) {
      it(`keeps ${id} at heading ${heading.toFixed(2)} upright on a ${SLOPE} slope`, () => {
        const w = sloped(id, heading);
        const ups = parkedTurns(w, buildDrive(w), 3);
        for (const up of ups) expect(up).toBeGreaterThanOrEqual(0.85);
      });
    }
  }

  it('starts the body with its up axis on the ground plane and every wheel at rest', () => {
    const w = sloped('hauler', Math.PI / 4);
    const d = buildDrive(w);
    const q = d.world.getRigidBody(d.bodies[w.vehicles[0].id]).rotation();
    const up = rotateBy(q, { x: 0, y: 1, z: 0 });
    const normal = { x: -SLOPE, y: 1, z: 0 };
    const len = Math.hypot(normal.x, normal.y);
    const angle = Math.acos(Math.min(1, (up.x * normal.x + up.y * normal.y) / len));
    expect(angle).toBeLessThan((2 * Math.PI) / 180);
    const b = unitBody('hauler', 0);
    const t = d.world.getRigidBody(d.bodies[w.vehicles[0].id]).translation();
    for (const m of [{ x: b.wheelX, z: b.wheelZ }, { x: -b.wheelX, z: -b.wheelZ }]) {
      const hub = rotateBy(q, { x: m.x, y: -rideOf(b), z: m.z });
      const at = { x: t.x + hub.x, y: t.y + hub.y, z: t.z + hub.z };
      expect(Math.abs(at.y - heightAt(w.terrain, at.x / S, at.z / S) * S)).toBeLessThan(0.05);
    }
    freeDrive(d);
  });

  it('is not lifted once seated on the slope', () => {
    const w = sloped('hauler', 0);
    const d = buildDrive(w);
    expect(isLifted(d, w, w.vehicles[0])).toBe(false);
    freeDrive(d);
  });

  for (const id of ['semi', 'sorokonoga']) {
    it(`starts the ${id} with its coupling anchors together`, () => {
      const w = sloped(id, Math.PI / 4);
      const d = buildDrive(w);
      const c = couplingOf(id)!;
      const low = unitBody(id, 0).wheelY;
      const front = d.world.getRigidBody(d.bodies[w.vehicles[0].id]);
      const rear = d.world.getRigidBody(d.rears[w.vehicles[0].id]);
      const at = (body: typeof front, x: number) => {
        const r = rotateBy(body.rotation(), { x, y: low, z: 0 });
        const t = body.translation();
        return { x: t.x + r.x, y: t.y + r.y, z: t.z + r.z };
      };
      const a = at(front, c.pivotFront);
      const b = at(rear, c.pivotRear);
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.05);
      freeDrive(d);
    });
  }

  it('seats a second truck that enters physics range on the slope', () => {
    const w = sloped('hauler', 0);
    const d = buildDrive(w);
    const ups = parkedTurns(w, d, 2);
    expect(Math.min(...ups)).toBeGreaterThanOrEqual(0.85);
  });
});
