import { vehicleStats, type VehicleStats } from '../sim/stats';
import { combatState, stepTimedCombat, type TimedCombatState } from '../sim/timed-combat';
import { captureImpactMotion, type ImpactMotion } from './contacts';
import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS } from '../data/physics';
import { couplingOf, unitBody, unitsOf, type Body } from '../sim/body';
import { unitMasses } from '../sim/mass';
import { unitPoses } from '../sim/rig';
import type { Vehicle, World } from '../sim/types';
import { angleDiff, clamp } from '../sim/vec';
import { toMps, rearKey, type Car, type Drive, type Trailer } from './drive';
import { wheelMounts } from './body';
import { seatUnits, type Seat } from './seat';
import { headingOf, TURN_STEPS, type V3, type VehicleFrame, type WheelFrame } from './frames';

const T = PHYSICS.truck;
const STEP = 1 / PHYSICS.stepsPerSecond;

export function removeVehicle(d: Drive, id: string): void {
  d.world.removeRigidBody(d.world.getRigidBody(d.bodies[id]));
  if (d.rears[id] !== undefined) d.world.removeRigidBody(d.world.getRigidBody(d.rears[id]));
  delete d.bodies[id];
  delete d.rears[id];
  delete d.couplings[id];
  delete d.shapes[id];
}

export function unitBodies(d: Drive, v: Vehicle): RAPIER.RigidBody[] {
  const front = d.world.getRigidBody(d.bodies[v.id]);
  const rear = d.rears[v.id];
  return rear === undefined ? [front] : [front, d.world.getRigidBody(rear)];
}

export function addVehicle(d: Drive, w: World, v: Vehicle): void {
  const bodies = unitsOf(v.chassisId).map((u) => addUnitBody(d.world, u.body));
  setMasses(bodies, v);
  placeBodies(bodies, w, v);
  d.bodies[v.id] = bodies[0].handle;
  d.shapes[v.id] = v.chassisId;
  if (bodies.length === 1) return;
  d.rears[v.id] = bodies[1].handle;
  d.couplings[v.id] = addCoupling(d.world, v, bodies[0], bodies[1]);
}

function addUnitBody(world: RAPIER.World, b: Body): RAPIER.RigidBody {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setCanSleep(false).setGravityScale(T.gravityScale));
  for (const box of b.boxes) {
    const collider = RAPIER.ColliderDesc.cuboid(box.half.x, box.half.y, box.half.z)
      .setTranslation(box.at.x, box.at.y, box.at.z)
      .setDensity(0)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    world.createCollider(collider, body);
  }
  return body;
}

export function setMasses(bodies: RAPIER.RigidBody[], v: Vehicle): void {
  const masses = unitMasses(v);
  if (masses.length !== bodies.length) throw new Error(`${v.id} has ${bodies.length} bodies for ${masses.length} unit masses`);
  bodies.forEach((body, unit) => setMass(body, unitBody(v.chassisId, unit), masses[unit]));
}

function setMass(body: RAPIER.RigidBody, b: Body, mass: number): void {
  const h = b.half;
  const k = (mass / 3) * T.inertiaScale;
  const inertia = { x: k * (h.y * h.y + h.z * h.z), y: k * (h.x * h.x + h.z * h.z), z: k * (h.x * h.x + h.y * h.y) };
  body.setAdditionalMassProperties(mass, { x: 0, y: b.comY, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 }, true);
  body.recomputeMassPropertiesFromColliders();
}

export function placeBodies(bodies: RAPIER.RigidBody[], w: World, v: Vehicle): void {
  const seats = seatUnits(w, v, unitPoses(v));
  bodies.forEach((body, unit) => placeBody(body, v, seats[unit]));
}

function placeBody(body: RAPIER.RigidBody, v: Vehicle, seat: Seat): void {
  body.setTranslation(seat.pos, true);
  body.setRotation(seat.rot, true);
  const fwd = toMps(v.speed);
  body.setLinvel({ x: seat.forward.x * fwd, y: seat.forward.y * fwd, z: seat.forward.z * fwd }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

export type UnitLoad = { mass: number; wheels: number[] };

export function wheelLoads(v: Vehicle): UnitLoad[] {
  const masses = unitMasses(v);
  const coupling = couplingOf(v.chassisId);
  if (!coupling) return [{ mass: masses[0], wheels: [1, 1, 1, 1].map(() => masses[0] / 4) }];
  const front = unitBody(v.chassisId, 0);
  const rear = unitBody(v.chassisId, 1);
  const pivotShare = rear.wheelX / (coupling.pivotRear + rear.wheelX);
  const onPivot = masses[1] * pivotShare;
  const onRearAxle = (front.wheelX - coupling.pivotFront) / (2 * front.wheelX);
  const steer = masses[0] / 4 + (onPivot * (1 - onRearAxle)) / 2;
  const drive = masses[0] / 4 + (onPivot * onRearAxle) / 2;
  const trailer = (masses[1] * (1 - pivotShare)) / 2;
  return [{ mass: masses[0], wheels: [steer, steer, drive, drive] }, { mass: masses[1], wheels: [trailer, trailer] }];
}

function addCoupling(world: RAPIER.World, v: Vehicle, front: RAPIER.RigidBody, rear: RAPIER.RigidBody): number {
  const coupling = couplingOf(v.chassisId);
  if (!coupling) throw new Error(`Rig ${v.chassisId} has no coupling`);
  const low = unitBody(v.chassisId, 0).wheelY;
  const locked = RAPIER.JointAxesMask.LinX | RAPIER.JointAxesMask.LinY | RAPIER.JointAxesMask.LinZ | RAPIER.JointAxesMask.AngY;
  const data = RAPIER.JointData.generic({ x: coupling.pivotFront, y: low, z: 0 }, { x: coupling.pivotRear, y: low, z: 0 }, { x: 0, y: 1, z: 0 }, locked);
  const joint = world.createImpulseJoint(data, front, rear, true);
  world.impulseJoints.raw.jointSetLimits(joint.handle, Number(RAPIER.JointAxis.AngX), -coupling.bendLimit, coupling.bendLimit);
  joint.setContactsEnabled(false);
  return joint.handle;
}

export function checkRigHandles(world: RAPIER.World, id: string, shape: string | undefined, rear: number | undefined, joint: number | undefined): void {
  if (shape === undefined) throw new Error(`Vehicle ${id} has a body but no chassis on record`);
  if (couplingOf(shape) === null) return;
  if (!hasBody(world, rear)) throw new Error(`Rig ${id} has no rear body ${rear}`);
  if (!hasJoint(world, joint)) throw new Error(`Rig ${id} has no coupling joint ${joint}`);
}

function hasBody(world: RAPIER.World, handle: number | undefined): boolean {
  return handle !== undefined && world.getRigidBody(handle)?.handle === handle;
}

function hasJoint(world: RAPIER.World, handle: number | undefined): boolean {
  return handle !== undefined && world.getImpulseJoint(handle)?.handle === handle;
}

export function liveBend(c: Car): number | undefined {
  return c.rear ? angleDiff(headingOf(c.rear.body.rotation()), headingOf(c.body.rotation())) : undefined;
}

export function againstBend(c: Car, steer: number): number {
  const coupling = c.rear ? couplingOf(c.v.chassisId) : null;
  const bend = liveBend(c);
  if (!coupling || bend === undefined) return steer;
  return clamp(steer + coupling.backGain * bend, -c.plan.maxSteer, c.plan.maxSteer);
}

export function backCap(c: Car, limit: number): number {
  const coupling = c.rear ? couplingOf(c.v.chassisId) : null;
  return coupling ? Math.min(limit, coupling.backCap) : limit;
}

export function carrySpins(c: Car, last: VehicleFrame | undefined): Car {
  if (!last) return c;
  c.mem.spins = last.wheels.map((w) => w.spin);
  c.mem.rearSpins = last.rear ? last.rear.wheels.map((w) => w.spin) : [];
  return c;
}

export function noteGrounded(c: Car, isGround: (handle: number) => boolean): Car {
  const controllers = c.rear ? [c.ctl, c.rear.ctl] : [c.ctl];
  c.result.grounded = controllers.every((ctl) => Array.from({ length: ctl.numWheels() }, (_, i) => ctl.wheelGroundObject(i)).every((ground) => ground !== null && isGround(ground.handle)));
  return c;
}

function wheelFrames(ctl: RAPIER.DynamicRayCastVehicleController, carried: readonly number[]): WheelFrame[] {
  const wheels: WheelFrame[] = [];
  for (let i = 0; i < ctl.numWheels(); i++) {
    wheels.push({ steer: ctl.wheelSteering(i) ?? 0, spin: (carried[i] ?? 0) + (ctl.wheelRotation(i) ?? 0), suspension: ctl.wheelSuspensionLength(i) ?? T.suspensionRest, ground: ctl.wheelIsInContact(i) });
  }
  return wheels;
}

export function frameOf(c: Car, velocityBefore: V3): VehicleFrame {
  const t = c.body.translation();
  const r = c.body.rotation();
  const v = c.body.linvel();
  const acc = { x: (v.x - velocityBefore.x) / STEP, y: (v.y - velocityBefore.y) / STEP, z: (v.z - velocityBefore.z) / STEP };
  const frame: VehicleFrame = { pos: { x: t.x, y: t.y, z: t.z }, rot: { x: r.x, y: r.y, z: r.z, w: r.w }, acc, wheels: wheelFrames(c.ctl, c.mem.spins) };
  if (c.rear) {
    const rt = c.rear.body.translation();
    const rr = c.rear.body.rotation();
    frame.rear = { pos: { x: rt.x, y: rt.y, z: rt.z }, rot: { x: rr.x, y: rr.y, z: rr.z, w: rr.w }, wheels: wheelFrames(c.rear.ctl, c.mem.rearSpins) };
  }
  return frame;
}

export function sideStiffness(i: number, sideGrip: number, share: number): number {
  return T.sideFrictionStiffness * sideGrip * share * (i >= 2 ? T.rearSideGrip : 1);
}

export function makeCar(world: RAPIER.World, body: RAPIER.RigidBody, b: Body, unit: number, load: UnitLoad): RAPIER.DynamicRayCastVehicleController {
  const car = world.createVehicleController(body);
  const mounts = wheelMounts(b, unit);
  if (mounts.length !== load.wheels.length) throw new Error(`Unit ${unit} has ${mounts.length} wheels and ${load.wheels.length} wheel loads`);
  mounts.forEach((m, i) => {
    const share = (4 * load.wheels[i]) / load.mass;
    car.addWheel(m, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, T.suspensionRest, b.wheelRadius);
    car.setWheelMaxSuspensionTravel(i, T.suspensionTravel);
    car.setWheelSuspensionStiffness(i, T.suspensionStiffness * share);
    car.setWheelSuspensionCompression(i, T.suspensionCompression * share);
    car.setWheelSuspensionRelaxation(i, T.suspensionRelaxation * share);
    car.setWheelMaxSuspensionForce(i, T.maxSuspensionForce * ((load.mass * share) / 1000));
    car.setWheelFrictionSlip(i, T.frictionSlip);
    car.setWheelSideFrictionStiffness(i, sideStiffness(rearIndex(unit, i), 1, 1));
  });
  return car;
}

export function rearIndex(unit: number, i: number): number {
  return unit > 0 ? i + 2 : i;
}

export function rollUnits(ctl: RAPIER.DynamicRayCastVehicleController, body: RAPIER.RigidBody, trailer: Trailer | null, dt: number): void {
  if (!trailer) {
    ctl.updateVehicle(dt);
    return;
  }
  ctl.updateVehicle(dt, undefined, undefined, notOn(trailer.body));
  trailer.ctl.updateVehicle(dt, undefined, undefined, notOn(body));
}

function notOn(other: RAPIER.RigidBody): (collider: RAPIER.Collider) => boolean {
  const skipped = new Set<number>();
  for (let i = 0; i < other.numColliders(); i++) skipped.add(other.collider(i).handle);
  return (collider) => !skipped.has(collider.handle);
}

export function makeTrailer(world: RAPIER.World, body: RAPIER.RigidBody, b: Body, load: UnitLoad): Trailer {
  return { body, b, ctl: makeCar(world, body, b, 1, load) };
}

export class TimedDrive {
  private state: TimedCombatState | undefined;
  private starts: { v: Vehicle; pos: Vehicle['pos']; heading: number }[] = [];
  constructor(private world: World, private cars: Car[], steps: number, private refresh: (car: Car) => void) {
    const state = combatState(world);
    if (steps !== TURN_STEPS || !state.active) return;
    this.state = state;
    this.starts = cars.map(c => ({ v: c.v, pos: c.v.pos, heading: c.v.heading }));
  }
  step(): void {
    if (!this.state) return;
    for (const c of this.cars) {
      const p = c.body.translation();
      c.v.pos = { x: p.x / PHYSICS.metersPerTile, y: p.z / PHYSICS.metersPerTile };
      c.v.heading = headingOf(c.body.rotation());
    }
    stepTimedCombat(this.world, this.state, 1000 / PHYSICS.stepsPerSecond);
    for (const c of this.cars) this.refreshCar(c);
  }
  private refreshCar(car: Car): void {
    if (this.world.vehicles.includes(car.v)) return this.refreshStats(car);
    car.plan = { ...car.plan, engine: false, target: 0, dest: null };
    car.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
  }
  private refreshStats(car: Car): void {
    const next = vehicleStats(this.world, car.v);
    const changed = motionStatsChanged(car.s, next);
    car.s = next;
    if (changed) this.refresh(car);
  }
  finish(): void {
    if (!this.state) return;
    for (const start of this.starts) {
      if (!this.world.vehicles.includes(start.v)) continue;
      start.v.pos = start.pos;
      start.v.heading = start.heading;
    }
  }
}

export function impactMotions(cars: Car[]): Map<string, ImpactMotion> {
  const motions = new Map<string, ImpactMotion>();
  for (const c of cars) {
    motions.set(c.v.id, captureImpactMotion(c.body));
    if (c.rear) motions.set(rearKey(c.v.id), captureImpactMotion(c.rear.body));
  }
  return motions;
}

function motionStatsChanged(before: VehicleStats, after: VehicleStats): boolean {
  const { weapons: _weapons, fuelPerTile: _fuelPerTile, ...motion } = after;
  return (Object.keys(motion) as (keyof typeof motion)[]).some(key => motion[key] !== before[key]);
}
