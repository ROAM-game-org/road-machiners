import type RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS } from '../data/physics';
import type { Body } from '../sim/body';
import { heightAt, type Terrain } from '../sim/terrain';
import { headingOf, noseRise, rotateBy, upOf, type V3 } from './frames';

const T = PHYSICS.truck;
const S = PHYSICS.metersPerTile;
const DT = 1 / PHYSICS.stepsPerSecond;
const UPRIGHT = Math.cos((T.flipTilt * Math.PI) / 180);

export function airPitchSpin(spin: number, pitch: number, groundPitch: number, dt: number): number {
  const target = Math.max(-T.airLevelSpin, Math.min(T.airLevelSpin, (groundPitch - pitch) * T.airLevelGain));
  return spin + (target - spin) * (1 - Math.exp(-T.airLevelPull * dt));
}

export function groundPitchUnder(terrain: Terrain, at: V3, heading: number, wheelX: number, id: string): number {
  const dx = (Math.cos(heading) * wheelX) / S;
  const dy = (Math.sin(heading) * wheelX) / S;
  const x = at.x / S;
  const y = at.z / S;
  const rise = (heightAt(terrain, x + dx, y + dy) - heightAt(terrain, x - dx, y - dy)) * S;
  const pitch = Math.atan2(rise, 2 * wheelX);
  if (!Number.isFinite(pitch)) throw new Error(`Cannot level ${id} in the air: the ground under it gave a non-finite pitch`);
  return pitch;
}

export function levelInAir(body: RAPIER.RigidBody, b: Body, terrain: Terrain, id: string): void {
  const rotation = body.rotation();
  if (upOf(rotation) < UPRIGHT) return;
  const lateral = rotateBy(rotation, { x: 0, y: 0, z: 1 });
  const spin = body.angvel();
  const pitchSpin = spin.x * lateral.x + spin.y * lateral.y + spin.z * lateral.z;
  const pitch = Math.asin(Math.max(-1, Math.min(1, noseRise(rotation))));
  const ground = groundPitchUnder(terrain, body.translation(), headingOf(rotation), b.wheelX, id);
  const change = airPitchSpin(pitchSpin, pitch, ground, DT) - pitchSpin;
  body.setAngvel({ x: spin.x + lateral.x * change, y: spin.y + lateral.y * change, z: spin.z + lateral.z * change }, true);
}
