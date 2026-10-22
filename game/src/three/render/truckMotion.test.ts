import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { VehicleFrame } from '../../phys/frames';
import { TruckMotion, WHIPS } from './truckMotion';

function frame(acc: { x: number; y: number; z: number }): VehicleFrame {
  return { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, acc, wheels: [] };
}

function drive(motion: TruckMotion, acc: { x: number; y: number; z: number }): void {
  for (let i = 0; i < 60; i++) motion.step(frame(acc), 1 / 60, false);
}

function setup() {
  const body = new THREE.Group();
  const antenna = new THREE.Group();
  const chain = new THREE.Group();
  const motion = new TruckMotion(body, new THREE.Vector3(0, -0.3, 0), 2.6, 0);
  motion.addWhip(antenna, WHIPS.antenna);
  motion.addWhip(chain, WHIPS.chain);
  return { body, antenna, chain, motion };
}

describe('truck motion', () => {
  it('lifts the nose and swings loose parts back when the truck speeds up', () => {
    const { body, antenna, chain, motion } = setup();
    drive(motion, { x: 8, y: 0, z: 0 });
    expect(body.rotation.z).toBeGreaterThan(0.01);
    expect(new THREE.Vector3(0, 1, 0).applyEuler(antenna.rotation).x).toBeLessThan(0);
    expect(new THREE.Vector3(0, -1, 0).applyEuler(chain.rotation).x).toBeLessThan(0);
  });

  it('dips the nose on braking', () => {
    const { body, motion } = setup();
    drive(motion, { x: -8, y: 0, z: 0 });
    expect(body.rotation.z).toBeLessThan(-0.01);
  });

  it('leans out of a right turn', () => {
    const { body, motion } = setup();
    drive(motion, { x: 0, y: 0, z: 8 });
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(body.quaternion).z).toBeLessThan(-0.01);
  });

  it('keeps the lean within its cap on a hard bump', () => {
    const { body, motion } = setup();
    drive(motion, { x: 500, y: 0, z: 500 });
    expect(Math.abs(body.rotation.z)).toBeLessThan(0.13);
    expect(Math.abs(body.rotation.x)).toBeLessThan(0.13);
  });

  function pitchAfter(half: number, accel: number): number {
    const body = new THREE.Group();
    const motion = new TruckMotion(body, new THREE.Vector3(0, -0.3, 0), half, 0);
    drive(motion, { x: accel, y: 0, z: 0 });
    return body.rotation.z;
  }

  it('tilts a long body less so its ends move no more than a 4 m body\'s', () => {
    const short = pitchAfter(4, 8);
    const long = pitchAfter(10.26, 8);
    expect(long * 10.26).toBeLessThanOrEqual(short * 4 + 1e-6);
    expect(long / short).toBeCloseTo(4 / 10.26, 6);
  });

  it('keeps a short body\'s lean as before', () => {
    expect(pitchAfter(2.6, 8)).toBe(pitchAfter(4, 8));
    expect(pitchAfter(2.6, 8)).toBeGreaterThan(0.03);
  });

  it('caps a long body\'s pitch at the scaled cap on a hard bump', () => {
    expect(Math.abs(pitchAfter(10.26, 500))).toBeLessThan(0.13 * (4 / 10.26));
  });

  it('rejects a body with no length', () => {
    for (const half of [0, -1, NaN]) {
      expect(() => new TruckMotion(new THREE.Group(), new THREE.Vector3(), half, 0)).toThrow(/half-length/);
    }
  });

  it('holds the lean while the same frame repeats, as between turns', () => {
    const { body, motion } = setup();
    drive(motion, { x: 8, y: 0, z: 0 });
    const held = frame({ x: 8, y: 0, z: 0 });
    motion.step(held, 1 / 60, false);
    const lean = body.rotation.z;
    for (let i = 0; i < 120; i++) motion.step(held, 1 / 60, false);
    expect(body.rotation.z).toBe(lean);
  });

  it('freezes the engine shake where it is when world time stops, and runs it on with world time', () => {
    const { body, motion } = setup();
    const moving = Array.from({ length: 30 }, (_, i) => ({ ...frame({ x: 0, y: 0, z: 0 }), pos: { x: i, y: 0, z: 0 } }));
    for (const f of moving) motion.step(f, 1 / 60, true);
    const last = moving.at(-1)!;
    const lift = body.position.y;
    for (let i = 0; i < 30; i++) motion.step(last, 0, true);
    expect(body.position.y).toBe(lift);
    motion.step(last, 1 / 60, true);
    expect(body.position.y).not.toBe(lift);
  });

  it('lets a rebuilt body take over the lean and shake of the old one, so a rebuild does not snap it', () => {
    const old = setup();
    const moving = Array.from({ length: 30 }, (_, i) => ({ ...frame({ x: 8, y: 0, z: 3 }), pos: { x: i, y: 0, z: 0 } }));
    for (const f of moving) old.motion.step(f, 1 / 60, true);
    const rebuilt = setup();
    rebuilt.motion.carryFrom(old.motion);
    rebuilt.motion.step(moving.at(-1)!, 0, true);
    expect(rebuilt.body.position.toArray()).toEqual(old.body.position.toArray());
    expect(rebuilt.body.quaternion.toArray()).toEqual(old.body.quaternion.toArray());
  });

  it('rejects a negative time step', () => {
    const { motion } = setup();
    expect(() => motion.step(frame({ x: 0, y: 0, z: 0 }), -0.01, false)).toThrow(/Truck motion step/);
  });
});
