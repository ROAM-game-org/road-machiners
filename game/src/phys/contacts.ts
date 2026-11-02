import type RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS } from '../data/physics';
import { RULES } from '../data/rules';
import type { Car } from './drive';
import { computeClosingSpeed, locateCrashContact, type CrashApproach, type CrashGeometry } from '../sim/crash-contact';
import { dist, type Vec } from '../sim/vec';
import { headingOf, rotateBy } from './frames';
import type { Vehicle, World } from '../sim/types';

const S = PHYSICS.metersPerTile;
const D = PHYSICS.driver;
const DT = 1 / PHYSICS.stepsPerSecond;

export const GROUND = 'ground';
export type Crash = { a: string; b: string; impact: number; contact: CrashGeometry; approach: CrashApproach | null; step: number };

export type CrashPair = { a: string; b: string; first: number; other: number; unitA: number; unitB: number };

const STILL: ImpactMotion = { velocity: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 }, heading: 0 };

export function captureCrash(physics: RAPIER.World, state: World, before: Map<string, ImpactMotion>, pair: CrashPair, va: ImpactMotion): Omit<Crash, 'step'> | null {
  const vb = before.get(pair.unitB > 0 ? `${pair.b}/rear` : pair.b) ?? STILL;
  const vehicle = state.vehicles.find((v) => v.id === pair.a);
  if (!vehicle) throw new Error(`Unknown crash vehicle ${pair.a}`);
  const hit = readCrashContact(physics, physics.getCollider(pair.first), physics.getCollider(pair.other), { vehicle, unit: pair.unitA, motion: va }, crashSide(state, pair, vb), vb);
  return hit ? { a: pair.a, b: pair.b, ...hit } : null;
}

function crashSide(state: World, pair: CrashPair, motion: ImpactMotion): CrashSide | null {
  const target = state.vehicles.find((v) => v.id === pair.b);
  return target ? { vehicle: target, unit: pair.unitB, motion } : null;
}

export function captureGroundCrash(physics: RAPIER.World, state: World, owner: { a: string; unit: number }, first: number, ground: number, motion: ImpactMotion): Omit<Crash, 'step'> | null {
  const a = owner.a;
  const vehicle = state.vehicles.find((v) => v.id === a);
  if (!vehicle) throw new Error(`Unknown crash vehicle ${a}`);
  const hits: { impact: number; contact: CrashGeometry; approach: null }[] = [];
  physics.contactPair(physics.getCollider(first), physics.getCollider(ground), (manifold, flipped) => {
    const raw = manifold.normal();
    const sign = flipped ? -1 : 1;
    const v = motion.velocity;
    const impact = Math.max(0, (v.x * raw.x + v.y * raw.y + v.z * raw.z) * sign);
    const points = readManifoldPoints(manifold, flipped);
    if (points.a.length === 0) return;
    const local = flipped ? manifold.localNormal2() : manifold.localNormal1();
    hits.push({ impact, approach: null, contact: { a: locateCrashContact(vehicle.chassisId, owner.unit, points.a, { x: local.x, y: local.z }), b: null } });
  });
  hits.sort((x, y) => y.impact - x.impact);
  return hits[0] ? { a, b: GROUND, ...hits[0] } : null;
}

export type ImpactMotion = { velocity: RAPIER.Vector; spin: RAPIER.Vector; heading: number };

function rotateToBody(vector: Vec, heading: number): Vec {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return { x: vector.x * c + vector.y * s, y: vector.y * c - vector.x * s };
}

function readManifoldPoints(manifold: RAPIER.TempContactManifold, flipped: boolean): { a: Vec[]; b: Vec[] } {
  const points = { a: [] as Vec[], b: [] as Vec[] };
  for (let i = 0; i < manifold.numContacts(); i++) {
    const first = manifold.localContactPoint1(i);
    const second = manifold.localContactPoint2(i);
    if (!first || !second) throw new Error('Missing collision contact point');
    const pair = [{ x: first.x, y: first.z }, { x: second.x, y: second.z }];
    if (flipped) pair.reverse();
    points.a.push(pair[0]);
    points.b.push(pair[1]);
  }
  return points;
}

type CrashSide = { vehicle: Vehicle; unit: number; motion: ImpactMotion };

function readCrashContact(world: RAPIER.World, first: RAPIER.Collider, second: RAPIER.Collider, sideA: CrashSide, sideB: CrashSide | null, motionB: ImpactMotion): { impact: number; contact: CrashGeometry; approach: CrashApproach | null } | null {
  const motionA = sideA.motion;
  const hits: { impact: number; contact: CrashGeometry; approach: CrashApproach | null }[] = [];
  world.contactPair(first, second, (manifold, flipped) => {
    const raw = manifold.normal();
    const sign = flipped ? -1 : 1;
    const normal = { x: raw.x * sign, y: raw.z * sign };
    if (Math.hypot(normal.x, normal.y) === 0) return;
    const impact = computeClosingSpeed({ x: motionA.velocity.x - motionB.velocity.x, y: motionA.velocity.z - motionB.velocity.z }, normal);
    const points = readManifoldPoints(manifold, flipped);
    if (points.a.length === 0) return;
    const contact = {
      a: locateCrashContact(sideA.vehicle.chassisId, sideA.unit, points.a, rotateToBody(normal, motionA.heading)),
      b: sideB ? locateCrashContact(sideB.vehicle.chassisId, sideB.unit, points.b, rotateToBody({ x: -normal.x, y: -normal.y }, motionB.heading)) : null,
    };
    hits.push({ impact, contact, approach: sideB ? driveIns(motionA, motionB, normal) : null });
  });
  hits.sort((a, b) => b.impact - a.impact);
  return hits[0] ?? null;
}

function driveIns(motionA: ImpactMotion, motionB: ImpactMotion, normal: Vec): CrashApproach {
  const length = Math.hypot(normal.x, normal.y);
  const along = (m: ImpactMotion) => (m.velocity.x * normal.x + m.velocity.z * normal.y) / length;
  return { a: along(motionA), b: -along(motionB) };
}

export function captureImpactMotion(body: RAPIER.RigidBody): ImpactMotion {
  return { velocity: body.linvel(), spin: body.angvel(), heading: headingOf(body.rotation()) };
}

export function bodyLength(c: Car): number {
  return (2 * c.b.half.x) / S;
}

export function backsOutFurther(c: Car, at: Vec, from: Vec): boolean {
  return dist(at, from) < RULES.reverse.maxDistance && c.mem.clearAhead < bodyLength(c) && c.mem.clearBehind >= D.clearMargin;
}

export function boxedIn(c: Car, target: number, speed: number): boolean {
  return target > 0 && Math.abs(speed) < D.pushSpeed && c.mem.clearAhead < bodyLength(c) && c.mem.clearBehind >= bodyLength(c);
}

export function blockedInFront(c: Car, target: number, speed: number): boolean {
  const pushing = target >= D.pushSpeed || (target > 0 && c.mem.stall > 0);
  c.mem.stall = pushing && Math.abs(speed) < D.stallSpeed && touchesAhead(c) ? c.mem.stall + DT : 0;
  return c.mem.stall >= D.stallSeconds;
}

function touchesAhead(c: Car): boolean {
  const forward = rotateBy(c.body.rotation(), { x: 1, y: 0, z: 0 });
  let ahead = false;
  for (let i = 0; i < c.body.numColliders(); i++) {
    const mine = c.body.collider(i);
    c.world.contactPairsWith(mine, (other) => {
      c.world.contactPair(mine, other, (manifold, flipped) => {
        if (manifold.numContacts() === 0) return;
        const raw = manifold.normal();
        const sign = flipped ? -1 : 1;
        const length = Math.hypot(raw.x, raw.y, raw.z);
        if (length === 0) throw new Error(`Contact of ${c.v.id} has no normal`);
        if ((raw.x * forward.x + raw.y * forward.y + raw.z * forward.z) * sign / length >= D.blockFacing) ahead = true;
      });
    });
  }
  return ahead;
}
