import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { PHYSICS } from '../data/physics';
import { axlesOf, bodyOf } from '../sim/body';
import { editableTerrain, emptyWorld } from '../sim/testkit';
import { airPitchSpin, groundPitchUnder, levelInAir } from './air';
import { initPhysics } from './drive';

beforeAll(async () => {
  await initPhysics();
});

const T = PHYSICS.truck;
const DT = 1 / PHYSICS.stepsPerSecond;
const b = bodyOf('scout');

describe('airPitchSpin', () => {
  it('moves the spin toward the target and never past it in one step', () => {
    const next = airPitchSpin(-0.5, -0.2, 0, DT);
    const target = 0.2 * T.airLevelGain;
    expect(next).toBeGreaterThan(-0.5);
    expect(next).toBeLessThanOrEqual(target);
  });

  it('caps the target for a huge gap', () => {
    let spin = 0;
    for (let i = 0; i < 600; i++) spin = airPitchSpin(spin, -1.4, 0, DT);
    expect(spin).toBeCloseTo(T.airLevelSpin, 6);
  });

  it('leaves a level body over level ground at rest', () => {
    expect(airPitchSpin(0, 0, 0, DT)).toBe(0);
  });
});

describe('groundPitchUnder', () => {
  it('reads the slope of the ground along the heading', () => {
    const w = emptyWorld();
    const t = editableTerrain(w);
    for (let j = 0; j <= t.size; j++) for (let i = 0; i <= t.size; i++) t.heights[j * (t.size + 1) + i] = i * 0.25;
    const S = PHYSICS.metersPerTile;
    const up = groundPitchUnder(w.terrain, { x: 20 * S, y: 0, z: 20 * S }, 0, axlesOf(b), 'a');
    const down = groundPitchUnder(w.terrain, { x: 20 * S, y: 0, z: 20 * S }, Math.PI, axlesOf(b), 'a');
    expect(up).toBeCloseTo(Math.atan(0.25), 6);
    expect(down).toBeCloseTo(-Math.atan(0.25), 6);
  });

  it('throws with the vehicle id on a non-finite height', () => {
    const w = emptyWorld();
    const t = editableTerrain(w);
    t.heights.fill(Number.NaN);
    const S = PHYSICS.metersPerTile;
    expect(() => groundPitchUnder(w.terrain, { x: 20 * S, y: 0, z: 20 * S }, 0, { front: 4, rear: -4 }, 'truck-7')).toThrow(/truck-7/);
  });
});

describe('levelInAir', () => {
  function box(rotation: { x: number; y: number; z: number; w: number }) {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(80, 50, 80).setRotation(rotation));
    world.createCollider(RAPIER.ColliderDesc.cuboid(1, 0.5, 1), body);
    body.setLinvel({ x: 3, y: 2, z: 1 }, true);
    return { world, body };
  }

  it('cuts a nose-down pitch spin and keeps roll, yaw and linear velocity', () => {
    const { world, body } = box({ x: 0, y: 0, z: 0, w: 1 });
    body.setAngvel({ x: 0.7, y: 0.4, z: -1 }, true);
    levelInAir(body, b, emptyWorld().terrain, 'a');
    const spin = body.angvel();
    expect(spin.z).toBeGreaterThan(-1);
    expect(spin.x).toBeCloseTo(0.7, 5);
    expect(spin.y).toBeCloseTo(0.4, 5);
    expect(body.linvel().x).toBeCloseTo(3, 5);
    expect(body.linvel().y).toBeCloseTo(2, 5);
    expect(body.linvel().z).toBeCloseTo(1, 5);
    world.free();
  });

  it('leaves an upside-down body alone', () => {
    const { world, body } = box({ x: 1, y: 0, z: 0, w: 0 });
    body.setAngvel({ x: 0.7, y: 0.4, z: -1 }, true);
    levelInAir(body, b, emptyWorld().terrain, 'a');
    const spin = body.angvel();
    expect([spin.x, spin.y, spin.z].map((v) => Math.round(v * 1e5) / 1e5)).toEqual([0.7, 0.4, -1]);
    world.free();
  });
});
