import * as THREE from 'three';
import { beforeAll, expect, it } from 'vitest';
import { buildDrive, freeDrive, initPhysics, type Drive, type TurnResult } from '../../phys/drive';
import type { VehicleFrame } from '../../phys/frames';
import { physicsMove } from '../../phys/turn';
import { haulerOf } from '../../sim/damage';
import { bodyOf } from '../../sim/body';
import { acrossOf, toRoad } from '../../sim/highway';
import { furyRoadWorld } from '../../sim/testkit';
import { endTurn } from '../../sim/world';
import { budget } from '../../test/budget';
import { TruckMotion } from './truckMotion';

beforeAll(async () => {
  await initPhysics();
});

function haulerStart(seed: number, turns: number): { frames: VehicleFrame[]; widest: number; chassisId: string } {
  let w = furyRoadWorld(seed);
  w.furyRoad!.groups = [];
  let drive: Drive = buildDrive(w);
  const frames: VehicleFrame[] = [];
  let widest = 0;
  for (let turn = 0; turn < turns; turn++) {
    let result: TurnResult | null = null;
    w = endTurn(w, physicsMove(drive, (next) => (result = next)));
    freeDrive(drive);
    drive = result!.next;
    frames.push(...result!.frames[haulerOf(w).id]);
    widest = Math.max(widest, Math.abs(acrossOf(seed, toRoad(seed, 0, haulerOf(w).pos)) + 1));
  }
  freeDrive(drive);
  return { frames, widest, chassisId: haulerOf(w).chassisId };
}

function peakPitch(frames: VehicleFrame[], half: number, wheelY: number): number {
  const body = new THREE.Group();
  const motion = new TruckMotion(body, new THREE.Vector3(0, wheelY, 0), half, 0);
  let peak = 0;
  for (const f of frames) {
    motion.step(f, 1 / 60, true);
    peak = Math.max(peak, Math.abs(body.rotation.z));
  }
  return peak;
}

it('keeps the hauler in its lane while it speeds up and rocks its drawn body no more than a bus', () => {
  const { frames, widest, chassisId } = haulerStart(1, 5);
  expect(widest).toBeLessThan(0.05);
  const body = bodyOf(chassisId);
  const hauler = peakPitch(frames, body.half.x, body.wheelY);
  const bus = peakPitch(frames, 3.91, body.wheelY);
  expect((hauler * 180) / Math.PI).toBeLessThanOrEqual(2.0);
  expect(Math.sin(hauler) * body.half.x).toBeLessThanOrEqual(0.36);
  expect(hauler).toBeLessThanOrEqual(bus);
}, budget(300_000));
