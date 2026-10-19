
import RAPIER from '@dimforge/rapier3d-compat';
import { chassisDef } from '../data/chassis';
import { freeOnThrow, restoreWorld } from './snapshot';
import { backsOutFurther, blockedInFront, bodyLength, boxedIn, captureCrash, captureGroundCrash, captureImpactMotion, GROUND, type Crash, type ImpactMotion } from './contacts';

export { GROUND, type Crash };
import { PERF } from '../data/perf';
import { PHYSICS } from '../data/physics';
import { BREAKABLE, CRATER, RULES } from '../data/rules';
import { fuelLimited, isNear } from '../sim/far';
import { blockingBoxes, isBreakable, isDriveObstacle, obstacleReach } from '../sim/mapgen';
import { playerVehicle } from '../sim/damage';
import { groundSpeed, vehicleStats, type VehicleStats } from '../sim/stats';
import { continueRoute, keepRoute, route, type KeptRoute } from '../sim/path';
import { backsToDestination, driveMode, throughSpeed } from '../sim/steering';
import { routeBlockers, yieldsToTraffic } from '../sim/ai';
import { clearanceFor, type Clearance, type Mover } from '../sim/clearance';
import { combatFoesOf } from '../sim/combat';
import { ropeClientOf } from '../sim/tow';
import { atlasOf } from '../sim/atlas';
import { propBase, railOffset, type Deck } from '../sim/bridge';
import { deckSegments, groundAt, tileAt, type DeckSegment, type Terrain } from '../sim/terrain';
import { TERRAIN, TERRAIN_TYPES } from '../data/terrain';
import { craterReach, craterRimPoints } from '../sim/craters';
import type { Crater, MoveOrder, Obstacle, Pose, Vehicle, World } from '../sim/types';
import { angleDiff, bearing, clamp, DEG, dist, type Vec } from '../sim/vec';
import { unitBody, type Body } from '../sim/body';
import { bendField, followPose, reachMeters, unitPoses } from '../sim/rig';
import { wheelMounts } from './body';
import { backUpClear, forwardTurnClear, turnaroundSpeed, turnRadius, type Stance } from './turnaround';
import { navLayer, type NavLayer } from '../sim/nav/layer';
import { headingOf, headingQuat, noseRise, rideHeightAt, rotateBy, toPhys, toPhysCircle, TURN_STEPS, upOf, type Circle, type Quat, type TurnFrames, type V3, type VehicleFrame } from './frames';
import { addVehicle, frameOf, againstBend, backCap, checkRigHandles, liveBend, makeCar, makeTrailer, placeBodies, rearIndex, rollUnits, removeVehicle, setMasses, sideStiffness, unitBodies, wheelLoads, type UnitLoad } from './units';

export { frameWheels, restFrame, restFrames, restWheels, trailFrames, TURN_STEPS, type UnitWheels } from './frames';
import { oilPatches } from '../sim/hazards';
import { lineAnchors, type BodyPoint, type LineAnchor } from '../sim/harpoon';
import { claymoreOf, claymoresSetOff, type ClaymoreCrash } from '../sim/claymore';
import { HARPOON, OIL } from '../data/utilities';

const S = PHYSICS.metersPerTile;
const T = PHYSICS.truck;
const D = PHYSICS.driver;
const DT = 1 / PHYSICS.stepsPerSecond;
const TELEPORT_TILES = 0.5;
const WALL = 50;
export const EDGE = 'edge';
export const RAIL = 'rail';

export const toMps = (tilesPerTurn: number) => (tilesPerTurn * S) / PHYSICS.turnSeconds;
export const toTilesPerTurn = (mps: number) => (mps * PHYSICS.turnSeconds) / S;

type Memory = { steer: number; reverse: boolean; route: (KeptRoute & { radius: number }) | null; ahead: Vec | null; stall: number; backFrom: Vec | null; swing: number; airborne: boolean; clearAhead: number; clearBehind: number; clearAt: number; anchor: V3 | null; rearAnchor: V3 | null };

export type Drive = {
  world: RAPIER.World;
  bodies: Record<string, number>;
  rears: Record<string, number>;
  couplings: Record<string, number>;
  shapes: Record<string, string>;
  obstacles: Record<string, number[]>;
  craters: Record<string, number[]>;
  memory: Record<string, Memory>;
  terrain: number;
  decks: DeckColliders[];
};

export type DeckColliders = { plates: number[]; rails: number[]; lips: number[] };

export type Break = { prop: string; vehicle: string; step: number };
export type VehicleResult = { passed: boolean; arrived: boolean };
export type Landing = { vehicle: string; impact: number; step: number };
export type Tear = { line: string; step: number };
export type TurnResult = { next: Drive; frames: TurnFrames; crashes: Crash[]; breaks: Break[]; landings: Landing[]; tears: Tear[]; results: Record<string, VehicleResult> };

export type DriveSnapshot = Omit<Drive, "world"> & { snapshot: Uint8Array };

export function captureDrive(drive: Drive): DriveSnapshot {
  const { world, ...handles } = drive;
  return { ...structuredClone(handles), snapshot: world.takeSnapshot() };
}

export function restoreDrive(saved: DriveSnapshot): Drive {
  const { snapshot, ...handles } = saved;
  return { ...structuredClone(handles), world: restoreWorld(snapshot) };
}

let initialised: Promise<void> | null = null;

export function initPhysics(): Promise<void> {
  initialised ??= RAPIER.init().catch((error: unknown) => {
    initialised = null;
    throw error;
  });
  return initialised;
}

export function buildDrive(w: World): Drive {
  const world = new RAPIER.World({ x: 0, y: -PHYSICS.gravity, z: 0 });
  const d: Drive = { world, bodies: {}, rears: {}, couplings: {}, shapes: {}, obstacles: {}, craters: {}, memory: {}, terrain: addTerrain(world, w), decks: addDecks(world, w) };
  syncDrive(d, w);
  return d;
}

export function freeDrive(d: Drive): void {
  d.world.free();
}

export function syncDrive(d: Drive, w: World): void {
  checkHandles(d);
  const near = w.vehicles.filter((v) => isNear(w, v));
  const ids = new Set(near.map((v) => v.id));
  for (const id of Object.keys(d.bodies)) {
    if (ids.has(id)) continue;
    removeVehicle(d, id);
    delete d.memory[id];
  }
  for (const v of near) syncVehicle(d, w, v);
  syncObstacles(d, w);
  syncCraters(d, w);
  for (const v of w.vehicles) {
    if (isNear(w, v) !== (d.bodies[v.id] !== undefined)) throw new Error(`Vehicle ${v.id} is ${isNear(w, v) ? 'near without' : 'far with'} a physics body`);
  }
}

function checkHandles(d: Drive): void {
  for (const [id, handle] of Object.entries(d.bodies)) {
    if (d.world.getRigidBody(handle)?.handle !== handle) throw new Error(`Vehicle ${id} has no body ${handle}`);
    checkRigHandles(d.world, id, d.shapes[id], d.rears[id], d.couplings[id]);
  }
  for (const [id, handles] of Object.entries(d.obstacles)) checkColliders(d, id, handles);
  for (const [id, handles] of Object.entries(d.craters)) checkColliders(d, id, handles);
}

function checkColliders(d: Drive, id: string, handles: number[]): void {
  for (const handle of handles) {
    if (d.world.getCollider(handle)?.handle !== handle) throw new Error(`Obstacle or crater ${id} has no collider ${handle}`);
  }
}

function syncObstacles(d: Drive, w: World): void {
  const live = w.obstacles.filter((o) => isDriveObstacle(o) && inLiveRange(w, o.pos, obstacleReach(o)));
  dropColliders(d, d.obstacles, new Set(live.map((o) => o.id)));
  for (const o of live) {
    if (d.obstacles[o.id] === undefined) d.obstacles[o.id] = addColliders(d, obstacleColliders(w.terrain, o));
  }
}

function inLiveRange(w: World, pos: Vec, reach: number): boolean {
  const range = TERRAIN.vision.radius + PERF.liveMargin + PHYSICS.propLiveMargin;
  return dist(pos, playerVehicle(w).pos) <= range + reach;
}

function dropColliders(d: Drive, record: Record<string, number[]>, keep: Set<string>): void {
  for (const [id, handles] of Object.entries(record)) {
    if (keep.has(id)) continue;
    for (const handle of handles) d.world.removeCollider(d.world.getCollider(handle), false);
    delete record[id];
  }
}

function addColliders(d: Drive, descs: RAPIER.ColliderDesc[]): number[] {
  return descs.map((desc) => d.world.createCollider(desc).handle);
}

function syncCraters(d: Drive, w: World): void {
  const live = w.craters.filter((c) => inLiveRange(w, c.pos, craterReach(c)));
  dropColliders(d, d.craters, new Set(live.map((c) => c.id)));
  for (const c of live) {
    if (d.craters[c.id] === undefined && clearOfBodies(d, w, c)) d.craters[c.id] = addColliders(d, craterColliders(w.terrain, c));
  }
}

function clearOfBodies(d: Drive, w: World, c: Crater): boolean {
  return w.vehicles.every((v) => {
    const handle = d.bodies[v.id];
    if (handle === undefined) return true;
    const t = d.world.getRigidBody(handle).translation();
    return dist({ x: t.x / S, y: t.z / S }, c.pos) > chassisDef(v.chassisId).radius + craterReach(c);
  });
}

export function craterColliders(t: Terrain, c: Crater): RAPIER.ColliderDesc[] {
  const rim = craterRimPoints(c).map((p) => toPhys(p, groundAt(t, p.x, p.y)));
  const radius = (CRATER.rimWidthRatio * c.radius) / 2;
  const lift = CRATER.rimRatio * c.radius - radius;
  return rim.map((a, k) => capsuleBetween(a, rim[(k + 1) % rim.length], radius, lift));
}

function capsuleBetween(a: V3, b: V3, radius: number, lift: number): RAPIER.ColliderDesc {
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len = Math.hypot(u.x, u.y, u.z);
  if (!(len > 0)) throw new Error('Capsule between one point');
  const desc = RAPIER.ColliderDesc.capsule(len / 2, radius).setTranslation((a.x + b.x) / 2, (a.y + b.y) / 2 + lift, (a.z + b.z) / 2);
  return desc.setRotation(upOnto({ x: u.x / len, y: u.y / len, z: u.z / len }));
}

function upOnto(u: V3): Quat {
  const w = 1 + u.y;
  const n = Math.hypot(u.z, u.x, w);
  return { x: u.z / n, y: 0, z: -u.x / n, w: w / n };
}

export function obstacleColliders(t: Terrain, o: Obstacle): RAPIER.ColliderDesc[] {
  const ground = propBase(t, o) * S;
  if (o.kind === 'site') {
    const half = PHYSICS.rockHeight / 2;
    return [RAPIER.ColliderDesc.cylinder(half, o.r * S).setTranslation(o.pos.x * S, ground + half - PHYSICS.rockSink, o.pos.y * S)];
  }
  return blockingBoxes(o, t).map((b) => {
    const bottom = b.z0 < PHYSICS.rockSink ? Math.min(b.z0, -PHYSICS.rockSink) : b.z0;
    const desc = RAPIER.ColliderDesc.cuboid(b.half.x * S, (b.z1 - bottom) / 2, b.half.y * S);
    desc.setTranslation(b.center.x * S, ground + (b.z1 + bottom) / 2, b.center.y * S);
    return desc.setRotation(headingQuat(Math.atan2(b.axis.y, b.axis.x)));
  });
}

function dropSwapped(d: Drive, v: Vehicle): void {
  if (d.bodies[v.id] === undefined || d.shapes[v.id] === v.chassisId) return;
  removeVehicle(d, v.id);
  d.memory[v.id] = { ...d.memory[v.id], anchor: null, rearAnchor: null, route: null };
}

function syncVehicle(d: Drive, w: World, v: Vehicle): void {
  dropSwapped(d, v);
  if (d.bodies[v.id] === undefined) {
    addVehicle(d, w, v);
    d.memory[v.id] ??= { steer: 0, reverse: false, route: null, ahead: null, stall: 0, backFrom: null, swing: 0, airborne: false, clearAhead: Infinity, clearBehind: Infinity, clearAt: 0, anchor: null, rearAnchor: null };
    return;
  }
  const bodies = unitBodies(d, v);
  setMasses(bodies, v);
  const t = bodies[0].translation();
  const moved = dist({ x: t.x / S, y: t.z / S }, v.pos) > TELEPORT_TILES;
  if (moved || (v.strandedTurns ?? 0) >= RULES.stranded.turns) {
    placeBodies(bodies, w, v);
    d.memory[v.id].anchor = null;
    d.memory[v.id].rearAnchor = null;
  }
}

export function simulateTurn(d: Drive, w: World): TurnResult {
  return runFreed(d, w, TURN_STEPS);
}

function noteOwner(owners: Owners, body: RAPIER.RigidBody, vehicleId: string, unit: number): void {
  for (let i = 0; i < body.numColliders(); i++) {
    owners.owner.set(body.collider(i).handle, vehicleId);
    owners.units.set(body.collider(i).handle, unit);
  }
}

export type Trailer = { body: RAPIER.RigidBody; ctl: RAPIER.DynamicRayCastVehicleController; b: Body };
export type Car = { v: Vehicle; s: VehicleStats; b: Body; body: RAPIER.RigidBody; ctl: RAPIER.DynamicRayCastVehicleController; rear: Trailer | null; mem: Memory; plan: Plan; result: VehicleResult; grip: number; topShare: number; oil: Circle[]; kicked: boolean; layer: NavLayer; world: RAPIER.World; holding: boolean; holdGrip: number; avoid: Set<string>; field: Car[] };

export const rearKey = (id: string) => `${id}/rear`;

function runFreed(d: Drive, w: World, steps: number): TurnResult {
  const world = restoreWorld(d.world.takeSnapshot());
  const events = new RAPIER.EventQueue(true);
  return freeOnThrow(world, events, () => run(d, w, steps, world, events));
}

function run(d: Drive, w: World, steps: number, world: RAPIER.World, events: RAPIER.EventQueue): TurnResult {
  world.timestep = DT;
  const memory: Record<string, Memory> = structuredClone(d.memory);
  const cars = makeCars(d, w, world, memory);
  const owners = ownersOf(cars);
  const obstacleOf = new Map(Object.entries(d.obstacles).flatMap(([id, handles]) => handles.map((h) => [h, id] as const)));

  const frames: TurnFrames = Object.fromEntries(cars.map((c) => [c.v.id, [] as VehicleFrame[]]));
  const contacts = new Contacts(w);
  const throws = new ClaymoreThrows(w, cars);
  const landings = new Landings();
  const lines = new Lines(lineAnchors(w), cars);
  for (let i = 0; i < steps; i++) {
    const before = impactMotions(cars);
    for (const c of cars) driveStep(c, w.terrain);
    for (const c of cars) updateCar(c);
    lines.pull(i);
    for (const c of cars) holdUnits(c);
    landings.note(cars, before, i);
    world.step(events);
    events.drainCollisionEvents((h1, h2, started) => {
      if (started) contacts.add(crashOf(h1, h2, owners, obstacleOf, d, before, world, w), i);
    });
    smash(world, d, contacts.takeNewBreaks(), cars, before);
    throws.apply(contacts.takeNewCrashes());
    for (const c of cars) frames[c.v.id].push(frameOf(c, before.get(c.v.id)!.velocity));
  }
  for (const c of cars) dropControllers(world, c);
  const results = Object.fromEntries(cars.map((c) => [c.v.id, c.result]));
  const obstacles = Object.fromEntries(Object.entries(d.obstacles).filter(([id]) => !contacts.isBroken(id)));
  return { next: { world, bodies: { ...d.bodies }, rears: { ...d.rears }, couplings: { ...d.couplings }, shapes: { ...d.shapes }, obstacles, craters: { ...d.craters }, memory, terrain: d.terrain, decks: d.decks }, frames, crashes: contacts.crashes, breaks: contacts.breaks, landings: landings.all(), tears: lines.tears, results };
}

function makeCars(d: Drive, w: World, world: RAPIER.World, memory: Record<string, Memory>): Car[] {
  const oil = oilPatches(w);
  const cars: Car[] = w.vehicles.filter((v) => d.bodies[v.id] !== undefined).map((v) => {
    const body = world.getRigidBody(d.bodies[v.id]);
    const s = vehicleStats(w, v);
    const b = unitBody(v.chassisId, 0);
    const loads = wheelLoads(v);
    const mem = memory[v.id];
    return { v, s, b, body, ctl: makeCar(world, body, b, 0, loads[0]), rear: trailerOf(d, world, v, loads), mem, plan: planOf(w, v, s, body, mem), result: { passed: false, arrived: false }, grip: 1, topShare: 1, oil: oilInReach(oil, v, s, body), kicked: false, layer: navLayer(w.terrain, w.obstacles, s.radius), world, holding: false, holdGrip: 1, avoid: avoidOf(w, v), field: [] };
  });
  for (const c of cars) c.field = cars;
  return cars;
}

function trailerOf(d: Drive, world: RAPIER.World, v: Vehicle, loads: UnitLoad[]): Trailer | null {
  const handle = d.rears[v.id];
  return handle === undefined ? null : makeTrailer(world, world.getRigidBody(handle), unitBody(v.chassisId, 1), loads[1]);
}

function ownersOf(cars: Car[]): Owners {
  const owners: Owners = { owner: new Map(), units: new Map() };
  for (const c of cars) {
    noteOwner(owners, c.body, c.v.id, 0);
    if (c.rear) noteOwner(owners, c.rear.body, c.v.id, 1);
  }
  return owners;
}

function updateCar(c: Car): void {
  rollUnits(c.ctl, c.body, c.rear, DT);
}

function dropControllers(world: RAPIER.World, c: Car): void {
  world.removeVehicleController(c.ctl);
  if (c.rear) world.removeVehicleController(c.rear.ctl);
}

function impactMotions(cars: Car[]): Map<string, ImpactMotion> {
  const motions = new Map<string, ImpactMotion>();
  for (const c of cars) {
    motions.set(c.v.id, captureImpactMotion(c.body));
    if (c.rear) motions.set(rearKey(c.v.id), captureImpactMotion(c.rear.body));
  }
  return motions;
}

class Lines {
  readonly tears: Tear[] = [];
  private readonly held: { line: LineAnchor; a: Car; b: Car }[];

  constructor(lines: LineAnchor[], cars: Car[]) {
    const car = (id: string) => cars.find((c) => c.v.id === id);
    this.held = lines.flatMap((line) => {
      const a = car(line.from);
      const b = car(line.to);
      return a && b ? [{ line, a, b }] : [];
    });
  }

  pull(step: number): void {
    for (const h of this.held) {
      if (this.tears.some((t) => t.line === h.line.id)) continue;
      if (!pullLine(h.line, unitRigid(h.a, h.line.fromAt.unit), unitRigid(h.b, h.line.toAt.unit))) this.tears.push({ line: h.line.id, step });
    }
  }
}

function pullLine(line: LineAnchor, a: RAPIER.RigidBody, b: RAPIER.RigidBody): boolean {
  const pa = worldPoint(a, line.fromAt);
  const pb = worldPoint(b, line.toAt);
  const gap = Math.hypot(pb.x - pa.x, pb.z - pa.z);
  if (gap <= line.length) return true;
  const stretch = HARPOON.stiffness * (gap - line.length);
  if (stretch > HARPOON.tearForce) return false;
  const n = { x: (pb.x - pa.x) / gap, z: (pb.z - pa.z) / gap };
  const va = a.velocityAtPoint(pa);
  const vb = b.velocityAtPoint(pb);
  const separating = (vb.x - va.x) * n.x + (vb.z - va.z) * n.z;
  const force = Math.max(0, stretch + HARPOON.damping * separating);
  const j = force * DT;
  a.applyImpulseAtPoint({ x: n.x * j, y: 0, z: n.z * j }, pa, true);
  b.applyImpulseAtPoint({ x: -n.x * j, y: 0, z: -n.z * j }, pb, true);
  return true;
}

function unitRigid(c: Car, unit: number): RAPIER.RigidBody {
  if (unit === 0) return c.body;
  if (!c.rear) throw new Error(`${c.v.id} has no rear unit ${unit}`);
  return c.rear.body;
}

function worldPoint(body: RAPIER.RigidBody, at: BodyPoint): V3 {
  const t = body.translation();
  const r = rotateBy(body.rotation(), at);
  return { x: t.x + r.x, y: t.y + r.y, z: t.z + r.z };
}

class Landings {
  private readonly hardest = new Map<string, { impact: number; step: number }>();

  note(cars: Car[], before: Map<string, ImpactMotion>, step: number): void {
    for (const c of cars) this.noteCar(c, before, step);
  }

  private noteCar(c: Car, before: Map<string, ImpactMotion>, step: number): void {
    const touching = carTouches(c);
    if (c.mem.airborne && touching) {
      const impact = carLanding(c, before);
      if (impact > (this.hardest.get(c.v.id)?.impact ?? 0)) this.hardest.set(c.v.id, { impact, step });
    }
    c.mem.airborne = !touching;
  }

  all(): Landing[] {
    return [...this.hardest].map(([vehicle, h]) => ({ vehicle, ...h }));
  }
}

function carTouches(c: Car): boolean {
  return wheelsTouch(c.ctl) || (c.rear !== null && wheelsTouch(c.rear.ctl));
}

function carLanding(c: Car, before: Map<string, ImpactMotion>): number {
  const front = landingImpact(c.v.id, c.body, c.ctl, before.get(c.v.id)!);
  return c.rear ? Math.max(front, landingImpact(c.v.id, c.rear.body, c.rear.ctl, before.get(rearKey(c.v.id))!)) : front;
}

function landingImpact(id: string, body: RAPIER.RigidBody, ctl: RAPIER.DynamicRayCastVehicleController, motion: ImpactMotion): number {
  const com = body.worldCom();
  const { velocity: v, spin: w } = motion;
  let impact = 0;
  for (let i = 0; i < ctl.numWheels(); i++) {
    if (!ctl.wheelIsInContact(i)) continue;
    const point = ctl.wheelContactPoint(i);
    const normal = ctl.wheelContactNormal(i);
    if (!point || !normal) throw new Error(`Wheel ${i} of ${id} is in contact without a contact point or normal`);
    const r = { x: point.x - com.x, y: point.y - com.y, z: point.z - com.z };
    const at = { x: v.x + w.y * r.z - w.z * r.y, y: v.y + w.z * r.x - w.x * r.z, z: v.z + w.x * r.y - w.y * r.x };
    impact = Math.max(impact, Math.min(-(at.x * normal.x + at.y * normal.y + at.z * normal.z), -at.y));
  }
  return impact;
}

function wheelsTouch(ctl: RAPIER.DynamicRayCastVehicleController): boolean {
  for (let i = 0; i < ctl.numWheels(); i++) if (ctl.wheelIsInContact(i)) return true;
  return false;
}

class Contacts {
  readonly crashes: Crash[] = [];
  readonly breaks: Break[] = [];
  private readonly crashed = new Map<string, number>();
  private readonly breakable: Set<string>;
  private fresh: Break[] = [];
  private freshCrashes: Crash[] = [];

  constructor(w: World) {
    this.breakable = new Set(w.obstacles.filter(isBreakable).map((o) => o.id));
  }

  add(found: Omit<Crash, 'step'> | null, step: number): void {
    if (!found || this.isBroken(found.b)) return;
    const crash = { ...found, step };
    if (this.breakable.has(crash.b) && crash.impact >= BREAKABLE.breakSpeed) {
      const b = { prop: crash.b, vehicle: crash.a, step };
      this.breaks.push(b);
      this.fresh.push(b);
      return;
    }
    this.keepHardest(crash);
  }

  private keepHardest(crash: Crash): void {
    const key = [crash.a, crash.b].sort().join('|');
    const known = this.crashed.get(key);
    if (known === undefined) {
      this.crashed.set(key, this.crashes.length);
      this.crashes.push(crash);
    } else if (crash.impact > this.crashes[known].impact) this.crashes[known] = crash;
    else return;
    this.freshCrashes.push(crash);
  }

  takeNewCrashes(): Crash[] {
    const out = this.freshCrashes;
    this.freshCrashes = [];
    return out;
  }

  isBroken(id: string): boolean {
    return this.breaks.some((b) => b.prop === id);
  }

  takeNewBreaks(): Break[] {
    const out = this.fresh;
    this.fresh = [];
    return out;
  }
}

class ClaymoreThrows {
  private readonly blown = new Set<string>();

  constructor(private readonly w: World, private readonly cars: Car[]) {}

  apply(crashes: Crash[]): void {
    for (const crash of crashes) {
      const impact = toTilesPerTurn(crash.impact);
      this.tryBlast(crash.a, crash.b, { impact, own: crash.contact.a, theirs: crash.contact.b });
      if (crash.contact.b) this.tryBlast(crash.b, crash.a, { impact, own: crash.contact.b, theirs: crash.contact.a });
    }
  }

  private tryBlast(userId: string, hitId: string, crash: ClaymoreCrash): void {
    const user = this.cars.find((c) => c.v.id === userId);
    const target = this.targetOf(hitId);
    if (user && target && !this.blown.has(userId)) this.blast(user, target, crash);
  }

  private targetOf(id: string): BlastTarget | null {
    const car = this.cars.find((c) => c.v.id === id);
    if (car) return { car, at: car.body.translation() };
    const obstacle = this.w.obstacles.find((o) => o.id === id);
    return obstacle ? { car: null, at: { x: obstacle.pos.x * S, z: obstacle.pos.y * S } } : null;
  }

  private blast(user: Car, target: BlastTarget, crash: ClaymoreCrash): void {
    const rams = claymoresSetOff(this.w, user.v, target.car?.v ?? null, crash);
    if (rams.length === 0) return;
    this.blown.add(user.v.id);
    const away = awayFrom(user.body.translation(), target.at);
    const { impulse, lift } = claymoreOf(rams[0]).throw;
    throwBody(user.body, away, impulse, lift);
    if (target.car) throwBody(target.car.body, { x: -away.x, z: -away.z }, impulse, lift);
  }
}

type BlastTarget = { car: Car | null; at: { x: number; z: number } };

function awayFrom(from: { x: number; z: number }, at: { x: number; z: number }): { x: number; z: number } {
  const length = Math.hypot(from.x - at.x, from.z - at.z);
  if (length === 0) throw new Error('A claymore blast between two points in one place has no direction');
  return { x: (from.x - at.x) / length, z: (from.z - at.z) / length };
}

function throwBody(body: RAPIER.RigidBody, dir: { x: number; z: number }, impulse: number, lift: number): void {
  const flat = impulse * Math.sqrt(1 - lift * lift);
  body.applyImpulse({ x: dir.x * flat, y: impulse * lift, z: dir.z * flat }, true);
}

function smash(world: RAPIER.World, d: Drive, breaks: Break[], cars: Car[], before: Map<string, ImpactMotion>): void {
  for (const b of breaks) smashOne(world, d, b, cars, before);
}

function smashOne(world: RAPIER.World, d: Drive, b: Break, cars: Car[], before: Map<string, ImpactMotion>): void {
  for (const handle of d.obstacles[b.prop]) world.removeCollider(world.getCollider(handle), false);
  const car = cars.find((c) => c.v.id === b.vehicle);
  const motion = before.get(b.vehicle);
  if (!car || !motion) throw new Error(`Break of ${b.prop} by ${b.vehicle}, which has no body`);
  slow(car.body, motion);
  if (car.rear) slow(car.rear.body, before.get(rearKey(car.v.id))!);
}

function slow(body: RAPIER.RigidBody, motion: ImpactMotion): void {
  const keep = 1 - BREAKABLE.slowdown;
  body.setLinvel({ x: motion.velocity.x * keep, y: motion.velocity.y * keep, z: motion.velocity.z * keep }, true);
  body.setAngvel(motion.spin, true);
}

type Owners = { owner: Map<number, string>; units: Map<number, number> };

function crashOf(h1: number, h2: number, owners: Owners, obstacleOf: Map<number, string>, d: Drive, before: Map<string, ImpactMotion>, physics: RAPIER.World, state: World): Omit<Crash, 'step'> | null {
  const { owner, units } = owners;
  const a = owner.get(h1) ?? owner.get(h2);
  if (a === undefined) return null;
  const [first, other] = owner.get(h1) === a ? [h1, h2] : [h2, h1];
  const unitA = unitOfCollider(units, first);
  const va = before.get(motionKey(a, unitA))!;
  if (isGround(d, other)) return captureGroundCrash(physics, state, { a, unit: unitA }, first, other, va);
  return captureCrash(physics, state, before, { a, b: crashTarget(other, owner, obstacleOf, d), first, other, unitA, unitB: unitOfCollider(units, other) }, va);
}

function unitOfCollider(units: Map<number, number>, handle: number): number {
  return units.get(handle) ?? 0;
}

function motionKey(id: string, unit: number): string {
  return unit > 0 ? rearKey(id) : id;
}

function isGround(d: Drive, handle: number): boolean {
  return handle === d.terrain || d.decks.some((c) => c.plates.includes(handle)) || Object.values(d.craters).some((handles) => handles.includes(handle));
}

function crashTarget(other: number, owner: Map<number, string>, obstacleOf: Map<number, string>, d: Drive): string {
  return owner.get(other) ?? obstacleOf.get(other) ?? (d.decks.some((c) => c.rails.includes(other) || c.lips.includes(other)) ? RAIL : EDGE);
}

type Plan = { dest: Vec | null; route: Vec[] | null; target: number; stopAt: boolean; engine: boolean; maxSteer: number; engineForce: number; brakeForce: number; stopDecel: number; clearance: Clearance | null };

function planTurn(w: World, v: Vehicle, full: VehicleStats, body: RAPIER.RigidBody, order: MoveOrder | null, mem: Memory): Plan {
  const ch = chassisDef(v.chassisId);
  const speed = Math.max(0, toTilesPerTurn(forwardSpeed(body)));
  const s = fuelLimited(w, v, full, speed, order);
  const engine = s.maxSpeed > 0;
  const base = {
    engine,
    maxSteer: T.maxSteer * (s.turnSlow / (ch.turnSlow * DEG)),
    engineForce: (full.mass * T.engineAccel * (s.accel / ch.accel)) / 2,
    brakeForce: T.brakeForce * (ch.handlingMass / 1000),
    stopDecel: D.stopDecel * (ch.handlingMass / full.mass),
    clearance: null,
  };
  if (!order) return { ...base, dest: null, route: null, target: idleTarget(speed), stopAt: false };
  if (order.kind === 'brake') return { ...base, dest: null, route: null, target: 0, stopAt: false };
  if (yieldsToTraffic(w, v)) return { ...base, dest: null, route: null, target: 0, stopAt: false };
  const blockers = routeBlockers(w, v);
  const stored = mem.route && dist(mem.route.dest, order.dest) < RULES.arriveRadius && mem.route.radius === s.radius ? continueRoute(w, v.pos, mem.route, order.dest, s.radius, blockers, v) : null;
  const path = v.direct ? null : stored ?? [...route(w, v.pos, order.dest, s.radius, blockers, v)];
  mem.route = path ? { ...keepRoute(w, order.dest, path, blockers, v), radius: s.radius } : null;
  const clearance = v.direct ? null : clearanceFor(w, v, blockers);
  Object.assign(mem, { clearAhead: Infinity, clearBehind: Infinity, clearAt: 0 });
  const drive = (next: number) => toMps(engine ? next : speed);
  if (order.kind === 'stopAt') return { ...base, clearance, dest: stopPoint(path, order.dest), route: path, target: drive(Math.min(s.maxSpeed, speed + s.accel)), stopAt: true };
  const next = throughSpeed(s, speed, dist(v.pos, order.dest), order.pace, driveMode(v));
  return { ...base, clearance, dest: order.dest, route: path, target: drive(next), stopAt: false };
}

function stopPoint(path: Vec[] | null, dest: Vec): Vec {
  return path ? path[path.length - 1] : dest;
}

function planOf(w: World, v: Vehicle, full: VehicleStats, body: RAPIER.RigidBody, mem: Memory): Plan {
  const plan = planTurn(w, v, full, body, v.order, mem);
  return isFrozenNpc(w, v) ? { ...plan, engine: false, brakeForce: 0, dest: null, route: null, stopAt: false } : plan;
}

function isFrozenNpc(w: World, v: Vehicle): boolean {
  return w.player.frozen && v.brain !== null && v.id !== w.player.vehicleId;
}

function idleTarget(speed: number): number {
  return speed <= RULES.parkedSpeed ? 0 : toMps(speed);
}

function groundUnder(terrain: Terrain, body: RAPIER.RigidBody) {
  const p = body.translation();
  return TERRAIN_TYPES[terrain.types[tileAt(terrain, { x: p.x / S, y: p.z / S })]];
}

function applyTerrainGrip(c: Car, terrain: Terrain, slick: Slick): void {
  const ground = groundUnder(terrain, c.body);
  c.grip = ground.grip;
  c.topShare = ground.paved ? 1 : TERRAIN.drive.unpavedTopSpeed;
  c.holdGrip = (ground.grip * slick.front.reduce((sum, wet) => sum + (wet ? OIL.grip : 1), 0)) / slick.front.length;
  gripWheels(c, c.ctl, 0, ground, slick.front);
  if (c.rear) gripWheels(c, c.rear.ctl, 1, groundUnder(terrain, c.rear.body), slick.rear);
}

function gripWheels(c: Car, ctl: RAPIER.DynamicRayCastVehicleController, unit: number, ground: (typeof TERRAIN_TYPES)[keyof typeof TERRAIN_TYPES], slick: readonly boolean[]): void {
  const grip = T.frictionSlip * groundSpeed(c.s, ground.speed) * ground.grip;
  for (let i = 0; i < ctl.numWheels(); i++) {
    const share = slick[i] ? OIL.grip : 1;
    ctl.setWheelFrictionSlip(i, grip * share);
    ctl.setWheelSideFrictionStiffness(i, sideStiffness(rearIndex(unit, i), ground.sideGrip, share));
  }
}

function oilInReach(patches: readonly { pos: Vec; r: number }[], v: Vehicle, s: VehicleStats, body: RAPIER.RigidBody): Circle[] {
  const reach = Math.max(s.maxSpeed, toTilesPerTurn(flatSpeed(body))) + reachMeters(v.chassisId) / S;
  return patches.filter((p) => dist(p.pos, v.pos) <= reach + p.r).map((p) => toPhysCircle(p.pos, p.r));
}

type Slick = { front: readonly boolean[]; rear: readonly boolean[] };

const DRY_WHEELS: readonly boolean[] = [false, false, false, false];
const DRY: Slick = { front: DRY_WHEELS, rear: DRY_WHEELS };

function oiledWheels(c: Car): Slick {
  if (c.oil.length === 0) return DRY;
  return { front: oiledUnit(c.oil, c.body, c.b, 0), rear: c.rear ? oiledUnit(c.oil, c.rear.body, c.rear.b, 1) : DRY_WHEELS };
}

function oiledUnit(oil: Circle[], body: RAPIER.RigidBody, b: Body, unit: number): readonly boolean[] {
  const p = body.translation();
  const h = headingOf(body.rotation());
  const cos = Math.cos(h);
  const sin = Math.sin(h);
  return wheelMounts(b, unit).map((m) => {
    const x = p.x + cos * m.x - sin * m.z;
    const z = p.z + sin * m.x + cos * m.z;
    return oil.some((o) => Math.hypot(x - o.x, z - o.z) <= o.r);
  });
}

function driveStep(c: Car, terrain: Terrain): void {
  const slick = oiledWheels(c);
  applyTerrainGrip(c, terrain, slick);
  oilKick(c, slick.front);
  const speed = forwardSpeed(c.body);
  const driving = c.plan.dest && !reached(c);
  if (!driving) c.mem.stall = 0;
  const command = driving ? commandToward(c, c.plan.dest!, speed) : { target: c.plan.target, steerTo: 0 };
  if (c.result.arrived) command.target = 0;
  if (!c.plan.dest) {
    c.mem.reverse = false;
    c.mem.backFrom = null;
  }
  turnWheels(c, command.steerTo);
  applyPedals(c, groundTarget(c, command.target), speed);
}

function groundTarget(c: Car, target: number): number {
  return target > 0 ? target * c.topShare : target;
}

function oilKick(c: Car, slick: readonly boolean[]): void {
  if (c.kicked || !(slick[2] || slick[3])) return;
  c.kicked = true;
  const up = rotateBy(c.body.rotation(), { x: 0, y: 1, z: 0 });
  const spin = c.body.angvel();
  const kick = tailKick(toTilesPerTurn(flatSpeed(c.body)), slick, spin.x * up.x + spin.y * up.y + spin.z * up.z);
  c.body.setAngvel({ x: spin.x + up.x * kick, y: spin.y + up.y * kick, z: spin.z + up.z * kick }, true);
}

export function tailKick(speed: number, slick: readonly boolean[], yawRate: number): number {
  const size = Math.min(OIL.maxKick, (OIL.kick * Math.max(0, speed - OIL.safeSpeed)) / OIL.safeSpeed);
  return size * kickSide(slick, yawRate);
}

function kickSide(slick: readonly boolean[], yawRate: number): number {
  if (slick[2] && slick[3]) return yawRate < 0 ? -1 : 1;
  if (slick[2]) return -1;
  if (slick[3]) return 1;
  throw new Error('A tail kick needs a rear wheel on oil');
}

function flatSpeed(body: RAPIER.RigidBody): number {
  const v = body.linvel();
  return Math.hypot(v.x, v.z);
}

type Command = { target: number; steerTo: number };

function reached(c: Car): boolean {
  return c.result.passed || c.result.arrived;
}

function commandToward(c: Car, dest: Vec, speed: number): Command {
  const { plan, body } = c;
  const p = body.translation();
  const at = { x: p.x / S, y: p.z / S };
  const heading = headingOf(body.rotation());
  const target = arrivalTarget(c, dest, at, heading, speed);
  if (reached(c)) return { target, steerTo: 0 };
  const aim = plan.route ? routeAim(plan.route, at) : dest;
  const ang = angleDiff(heading, bearing(at, aim));
  const swing = kTurnSide(c, at, heading, ang);
  if (swing) {
    c.mem.backFrom = { ...at };
    c.mem.swing = swing;
  } else if (!c.mem.backFrom) c.mem.swing = 0;
  watchClearance(c, at, heading, speed, dest);
  c.mem.reverse = backs(c, { at, heading }, ang, angleDiff(heading + Math.PI, bearing(at, dest)), dist(at, dest), target, speed);
  if (c.mem.reverse) {
    const rearAng = angleDiff(heading + Math.PI, bearing(at, aim));
    const gain = c.mem.backFrom ? D.steerGain : -D.steerGain;
    const steerTo = c.mem.backFrom && c.mem.swing ? -c.mem.swing * plan.maxSteer : clamp(rearAng * gain, -plan.maxSteer, plan.maxSteer);
    return { target: -Math.min(D.reverseSpeed, plan.target, clearCap(c, c.mem.clearBehind)), steerTo: againstBend(c, steerTo) };
  }
  const corner = Math.min(aimSpeed(c, ang, dist(at, aim) * S), routeCornerSpeed(plan.route, at, Math.abs(speed), plan.stopDecel * c.grip, c.grip));
  return { target: Math.min(target, corner, clearCap(c, c.mem.clearAhead)), steerTo: clamp(ang * D.steerGain, -plan.maxSteer, plan.maxSteer) };
}

function clearCap(c: Car, free: number): number {
  if (free === Infinity) return Infinity;
  return Math.max(D.clearCrawl, Math.sqrt(2 * c.plan.stopDecel * c.grip * free * S));
}

function watchClearance(c: Car, at: Vec, heading: number, speed: number, dest: Vec): void {
  const { mem } = c;
  if (!c.plan.clearance || mem.clearAt++ % D.clearEvery !== 0) return;
  if (!Number.isFinite(speed)) throw new Error(`Truck ${c.v.id} has a non-finite speed`);
  const mps = Math.abs(speed);
  mem.clearAhead = freeDistance(c, 1, at, heading, mps, dest);
  const watching = mem.reverse || mem.backFrom !== null || mem.clearAhead < bodyLength(c);
  mem.clearBehind = watching ? freeDistance(c, -1, at, heading, mps, dest) : Infinity;
}

function avoidOf(w: World, v: Vehicle): Set<string> {
  const client = ropeClientOf(w, v.id);
  return new Set([v.id, ...(v.brain?.ramTarget ? [v.brain.ramTarget] : []), ...(client ? [client] : []), ...combatFoesOf(w, v)]);
}

function moversNear(c: Car, from: Vec, reach: number, seconds: number): Mover[] {
  const parked = toMps(RULES.parkedSpeed);
  const movers: Mover[] = [];
  for (const o of c.field) {
    if (c.avoid.has(o.v.id)) continue;
    const t = o.body.translation();
    const u = o.body.linvel();
    if (Math.hypot(u.x, u.z) < parked) continue;
    const pos = { x: t.x / S, y: t.z / S };
    const vel = { x: u.x / S, y: u.z / S };
    if (dist(from, pos) < reach + Math.hypot(vel.x, vel.y) * seconds + o.s.radius) movers.push({ id: o.v.id, pos, vel, r: o.s.radius });
  }
  return movers;
}

function freeDistance(c: Car, sign: 1 | -1, from: Vec, facing: number, mps: number, dest: Vec): number {
  const { plan, b, mem } = c;
  const clearance = plan.clearance!;
  const route = plan.route ? [...plan.route] : null;
  const gain = sign > 0 || mem.backFrom || !mem.reverse ? D.steerGain : -D.steerGain;
  const wheelbase = (2 * b.wheelX) / S;
  const grip = (D.cornerAccel * c.grip * S) / Math.max(mps * mps, 1);
  const horizon = (mps * mps) / (2 * plan.stopDecel * c.grip * S) + D.clearMargin + bodyLength(c);
  const seconds = (D.clearStep * S) / Math.max(mps, 1);
  const movers = sign > 0 ? moversNear(c, from, horizon, (horizon * S) / Math.max(mps, 1)) : [];
  let at: Pose = { x: from.x, y: from.y, heading: facing, ...bendField(liveBend(c)) };
  let steer = mem.steer;
  for (let travelled = 0; travelled < horizon; travelled += D.clearStep) {
    if (clearance.touches(at, at.heading, at.bend)) return travelled;
    if (movers.length > 0 && clearance.meetsMoving(at, at.heading, at.bend, (travelled * S) / Math.max(mps, 1), movers)) return travelled;
    const aim = route ? routeAim(route, at) : dest;
    const want = clamp(angleDiff(at.heading + (sign < 0 ? Math.PI : 0), bearing(at, aim)) * gain, -plan.maxSteer, plan.maxSteer);
    steer = clamp(want, steer - T.steerRate * seconds, steer + T.steerRate * seconds);
    const heading = at.heading + sign * Math.sign(steer) * Math.min(Math.abs(Math.tan(steer)) / wheelbase, grip) * D.clearStep;
    at = followPose(c.v.chassisId, at, { x: at.x + sign * Math.cos(heading) * D.clearStep, y: at.y + sign * Math.sin(heading) * D.clearStep, heading });
  }
  return Infinity;
}

function kTurnSide(c: Car, at: Vec, heading: number, ang: number): 1 | -1 | 0 {
  if (!c.plan.route || c.mem.backFrom || Math.abs(ang) <= Math.PI / 2) return 0;
  const stance = { at, heading };
  const radius = turnRadius(c.b, c.plan.maxSteer) / S;
  const side = c.mem.swing === 0 ? (ang > 0 ? 1 : -1) : c.mem.swing > 0 ? 1 : -1;
  const needed = !forwardTurnClear(c.layer, stance, radius, side, Math.abs(ang)) && backUpClear(c.layer, stance, radius, side, RULES.reverse.distance);
  return needed ? side : 0;
}

function aimSpeed(c: Car, ang: number, aimDist: number): number {
  const turnsBack = c.plan.route !== null && Math.abs(ang) > Math.PI / 2;
  return turnsBack ? turnaroundSpeed(c.b, c.plan.maxSteer, c.grip) : cornerSpeed(aimDist, ang, c.grip);
}

function arrivalTarget(c: Car, dest: Vec, at: Vec, heading: number, speed: number): number {
  const far = dist(at, dest) * S;
  if (!c.plan.stopAt) {
    c.result.passed = passedThrough(dest, c.plan.route, c.mem, { x: at.x * S, y: at.y * S }, heading, speed);
    return c.plan.target;
  }
  if (far < RULES.arriveRadius * S) c.result.arrived = true;
  return Math.min(c.plan.target, Math.sqrt(2 * c.plan.stopDecel * c.grip * Math.max(0, far - RULES.arriveRadius * S)));
}

function backs(c: Car, stance: Stance, ang: number, rearAng: number, far: number, target: number, speed: number): boolean {
  const room = backRoom(c, stance);
  if (Math.abs(ang) > Math.PI / 2 && room && backsToPoint(c, rearAng, far, target, speed)) {
    c.mem.backFrom = null;
    return true;
  }
  if (c.mem.backFrom && room && keepsBacking(c, stance.at, c.mem.backFrom)) return true;
  c.mem.backFrom = null;
  if ((!blockedInFront(c, target, speed) && !boxedIn(c, target, speed)) || !room) return false;
  c.mem.backFrom = { ...stance.at };
  c.mem.swing = 0;
  c.mem.stall = 0;
  return true;
}

function backRoom(c: Car, stance: Stance): boolean {
  const side = c.mem.swing > 0 ? 1 : -1;
  const radius = c.mem.swing === 0 ? Infinity : turnRadius(c.b, c.plan.maxSteer) / S;
  return backUpClear(c.layer, stance, radius, side, D.backLook);
}

function keepsBacking(c: Car, at: Vec, from: Vec): boolean {
  const gone = dist(at, from);
  return gone < RULES.reverse.distance || (gone < backCap(c, RULES.reverse.maxDistance) && backsOutFurther(c, at, from));
}

function backsToPoint(c: Car, rearAng: number, far: number, target: number, speed: number): boolean {
  const starts = target > 0 && Math.abs(speed) < D.reverseBelow;
  return far <= backCap(c, Infinity) && backsToDestination(c.v, far, rearAng) && (c.mem.reverse || starts);
}

function turnWheels(c: Car, steerTo: number): void {
  const step = T.steerRate * DT;
  c.mem.steer = clamp(steerTo, c.mem.steer - step, c.mem.steer + step);
  c.ctl.setWheelSteering(0, -c.mem.steer);
  c.ctl.setWheelSteering(1, -c.mem.steer);
}

function applyPedals(c: Car, target: number, speed: number): void {
  const { plan, ctl } = c;
  const cap = climbForce(c, target);
  const u = clamp((target - speed) * D.throttleGain + slopeThrottle(c, target, cap), -1, 1);
  const more = wantsMore(u, target);
  const pushing = plan.engine && more;
  const brake = more ? 0 : brakeOf(plan, u, target);
  const force = pushing ? u * cap : 0;
  c.holding = target === 0 && brake > 0;
  setBrakes(c, brake);
  for (const i of [2, 3]) ctl.setWheelEngineForce(i, force);
}

function setBrakes(c: Car, brake: number): void {
  const controllers = c.rear ? [c.ctl, c.rear.ctl] : [c.ctl];
  const perWheel = (brake * 4) / controllers.reduce((sum, ctl) => sum + ctl.numWheels(), 0);
  for (const ctl of controllers) for (let i = 0; i < ctl.numWheels(); i++) ctl.setWheelBrake(i, perWheel);
}

function holdUnits(c: Car): void {
  c.mem.anchor = holdStill(c, c.body, c.ctl, c.mem.anchor);
  if (c.rear) c.mem.rearAnchor = holdStill(c, c.rear.body, c.rear.ctl, c.mem.rearAnchor);
}

function holdStill(c: Car, body: RAPIER.RigidBody, ctl: RAPIER.DynamicRayCastVehicleController, anchor: V3 | null): V3 | null {
  const ground = c.holding ? groundFrame(c.v.id, ctl) : null;
  const lin = body.linvel();
  const spin = body.angvel();
  const yaw = ground ? spin.x * ground.n.x + spin.y * ground.n.y + spin.z * ground.n.z : 0;
  if (!ground || Math.abs(yaw) > T.holdSpin || Math.hypot(...alongGround(lin, ground.n)) > T.holdSpeed) return null;
  const mass = body.mass();
  if (!(mass > 0)) throw new Error(`Vehicle ${c.v.id} has no mass to hold`);
  const pos = body.translation();
  let held = anchor ?? { x: pos.x, y: pos.y, z: pos.z };
  const offset = alongGround({ x: pos.x - held.x, y: pos.y - held.y, z: pos.z - held.z }, ground.n);
  const far = Math.hypot(...offset);
  if (far > T.holdSlip) {
    const drag = 1 - T.holdSlip / far;
    held = { x: held.x + offset[0] * drag, y: held.y + offset[1] * drag, z: held.z + offset[2] * drag };
  }
  const pull = Math.min(far, T.holdSlip) / (far || 1);
  const next = alongGround({ x: lin.x, y: lin.y - T.gravityScale * PHYSICS.gravity * DT, z: lin.z }, ground.n);
  const want = next.map((v, i) => -v - offset[i] * pull / T.holdReturn);
  const cap = T.holdGrip * c.holdGrip * T.gravityScale * PHYSICS.gravity * ground.up * DT * (ground.touching / ctl.numWheels());
  const need = Math.hypot(...want);
  const scale = need > cap ? cap / need : 1;
  body.applyImpulse({ x: want[0] * scale * mass, y: want[1] * scale * mass, z: want[2] * scale * mass }, true);
  body.setAngvel({ x: spin.x - yaw * ground.n.x, y: spin.y - yaw * ground.n.y, z: spin.z - yaw * ground.n.z }, true);
  return held;
}

function groundFrame(id: string, ctl: RAPIER.DynamicRayCastVehicleController): { n: V3; up: number; touching: number } | null {
  const sum = contactNormals(id, ctl);
  const length = Math.hypot(sum.x, sum.y, sum.z);
  if (length === 0) return null;
  let touching = 0;
  for (let i = 0; i < ctl.numWheels(); i++) if (ctl.wheelIsInContact(i)) touching++;
  const n = { x: sum.x / length, y: sum.y / length, z: sum.z / length };
  return { n, up: n.y, touching };
}

function alongGround(v: V3, n: V3): [number, number, number] {
  const into = v.x * n.x + v.y * n.y + v.z * n.z;
  return [v.x - into * n.x, v.y - into * n.y, v.z - into * n.z];
}

function wantsMore(u: number, target: number): boolean {
  return target !== 0 && Math.sign(u) === Math.sign(target);
}

function slopeThrottle(c: Car, target: number, cap: number): number {
  if (target === 0 || !c.plan.engine) return 0;
  const pull = T.gravityScale * PHYSICS.gravity * noseRise(c.body.rotation()) * c.s.mass;
  return pull / (2 * cap);
}

function climbForce(c: Car, target: number): number {
  if (target === 0) return c.plan.engineForce;
  const pull = (T.gravityScale * PHYSICS.gravity * c.s.mass * climbSine(c, Math.sign(target))) / 2;
  return c.plan.engineForce + Math.min(T.climbReserve * c.plan.engineForce, Math.max(0, pull));
}

function contactNormals(id: string, ctl: RAPIER.DynamicRayCastVehicleController): { x: number; y: number; z: number } {
  const n = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < ctl.numWheels(); i++) {
    if (!ctl.wheelIsInContact(i)) continue;
    const normal = ctl.wheelContactNormal(i);
    if (!normal) throw new Error(`Wheel ${i} of ${id} is in contact without a contact normal`);
    n.x += normal.x;
    n.y += normal.y;
    n.z += normal.z;
  }
  return n;
}

function climbSine(c: Car, sign: number): number {
  const n = contactNormals(c.v.id, c.ctl);
  const length = Math.hypot(n.x, n.y, n.z);
  if (length === 0) return 0;
  const heading = headingOf(c.body.rotation());
  const way = { x: Math.cos(heading) * sign, z: Math.sin(heading) * sign };
  const into = (way.x * n.x + way.z * n.z) / (length * length);
  const along = { x: way.x - into * n.x, y: -into * n.y, z: way.z - into * n.z };
  const run = Math.hypot(along.x, along.y, along.z);
  return run === 0 ? 0 : along.y / run;
}

function brakeOf(plan: Plan, u: number, target: number): number {
  return Math.abs(u) * plan.brakeForce + (target === 0 ? plan.brakeForce : 0);
}

function passedThrough(dest: Vec, route: Vec[] | null, mem: Memory, at: Vec, heading: number, speed: number): boolean {
  const dx = dest.x * S - at.x;
  const dz = dest.y * S - at.y;
  if (Math.hypot(dx, dz) < RULES.passRadius * S) return true;
  if (!onLastLeg(route)) {
    mem.ahead = null;
    return false;
  }
  const ahead = Math.abs(angleDiff(heading, Math.atan2(dz, dx))) < Math.PI / 2;
  const wasAhead = samePoint(mem.ahead, dest);
  mem.ahead = ahead ? dest : null;
  return wasAhead && !ahead && speed > 0;
}

function onLastLeg(route: Vec[] | null): boolean {
  return !route || route.length === 1;
}

function samePoint(a: Vec | null, b: Vec): boolean {
  return a !== null && a.x === b.x && a.y === b.y;
}

function cornerSpeed(aimDist: number, ang: number, grip: number): number {
  const sin = Math.abs(Math.sin(ang));
  return sin === 0 ? Infinity : Math.sqrt((D.cornerAccel * grip * aimDist) / (2 * sin));
}

function routeCornerSpeed(route: Vec[] | null, at: Vec, speed: number, decel: number, grip: number): number {
  if (!route) return Infinity;
  const reach = (speed * speed) / (2 * decel) + D.cornerCut;
  let limit = Infinity;
  let along = dist(at, route[0]) * S;
  let prev = at;
  for (let k = 0; k + 1 < route.length && along <= reach; k++) {
    const theta = Math.abs(angleDiff(bearing(prev, route[k]), bearing(route[k], pointAfter(route, k, D.cornerCut / S))));
    if (theta > 0) {
      const corner = Math.sqrt((D.cornerAccel * grip * D.cornerCut) / Math.tan(theta / 2));
      limit = Math.min(limit, Math.sqrt(corner * corner + 2 * decel * Math.max(0, along - D.cornerCut)));
    }
    along += dist(route[k], route[k + 1]) * S;
    prev = route[k];
  }
  return limit;
}

function pointAfter(route: Vec[], k: number, d: number): Vec {
  let along = 0;
  for (let i = k + 1; i < route.length; i++) {
    along += dist(route[i - 1], route[i]);
    if (along >= d) return route[i];
  }
  return route[route.length - 1];
}

export function routeAim(route: Vec[], at: Vec): Vec {
  while (route.length > 1 && (dist(at, route[0]) < RULES.minAimDistance || passed(at, route[0], route[1]))) route.shift();
  return route[0];
}

function passed(at: Vec, a: Vec, b: Vec): boolean {
  return (at.x - a.x) * (b.x - a.x) + (at.y - a.y) * (b.y - a.y) > 0;
}

export function forwardSpeed(body: RAPIER.RigidBody): number {
  const v = body.linvel();
  const h = headingOf(body.rotation());
  return v.x * Math.cos(h) + v.z * Math.sin(h);
}

export function isLifted(d: Drive, w: World, v: Vehicle): boolean {
  const handle = d.bodies[v.id];
  if (handle === undefined) throw new Error(`No physics body for ${v.id}`);
  const poses = unitPoses(v);
  return unitBodies(d, v).some((body, unit) => body.translation().y > rideHeightAt(w, v, poses[unit]) + T.liftedRise);
}

export type BodyState = { pos: Vec; heading: number; bend: number | undefined; speed: number; upright: boolean };

export function bodyState(d: Drive, id: string): BodyState {
  const handle = d.bodies[id];
  if (handle === undefined) throw new Error(`No physics body for ${id}`);
  const body = d.world.getRigidBody(handle);
  const t = body.translation();
  const r = body.rotation();
  const rear = d.rears[id] === undefined ? null : d.world.getRigidBody(d.rears[id]);
  const upright = upOf(r) >= Math.cos(T.flipTilt * DEG) && (!rear || upOf(rear.rotation()) >= Math.cos(T.flipTilt * DEG));
  const bend = rear ? angleDiff(headingOf(rear.rotation()), headingOf(r)) : undefined;
  return { pos: { x: t.x / S, y: t.z / S }, heading: headingOf(r), bend, speed: forwardSpeed(body), upright };
}

function addTerrain(world: RAPIER.World, w: World): number {
  const n = w.terrain.size;
  const heights = new Float32Array((n + 1) * (n + 1));
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) heights[i * (n + 1) + j] = w.terrain.heights[j * (n + 1) + i];
  }
  const size = n * S;
  const field = RAPIER.ColliderDesc.heightfield(n, n, heights, { x: size, y: S, z: size }).setTranslation(size / 2, 0, size / 2);
  const terrain = world.createCollider(field).handle;
  for (const [x, z, hx, hz] of [[-WALL, size / 2, WALL, size], [size + WALL, size / 2, WALL, size], [size / 2, -WALL, size, WALL], [size / 2, size + WALL, size, WALL]]) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, PHYSICS.wallHeight, hz).setTranslation(x, 0, z));
  }
  return terrain;
}

function addDecks(world: RAPIER.World, w: World): DeckColliders[] {
  return atlasOf(w.terrain).decks.decks.map((deck) => addDeck(world, w, deck));
}

function addDeck(world: RAPIER.World, w: World, deck: Deck): DeckColliders {
  const B = PHYSICS.bridge;
  const halfWidth = (deck.width * S) / 2;
  const segments = deckSegments(w.terrain, deck);
  const plates: number[] = [];
  const rails: number[] = [];
  for (const seg of segments) {
    const box = segmentBox(world, deck, seg);
    const length = seg.length * S;
    plates.push(box({ along: length / 2, up: B.deckThickness / 2, across: halfWidth }, { along: 0, lift: 0, side: 0 }));
    for (const [i, side] of [-1, 1].entries()) {
      const off = railOffset(deck.axis, deck.width, side);
      const a = { x: seg.from.x + off.x, y: seg.from.y + off.y };
      const b = { x: seg.to.x + off.x, y: seg.to.y + off.y };
      const depth = deck.skirt ? skirtDepth(w.terrain, a, b, seg.h0, seg.h1) : 0;
      rails.push(box({ along: length / 2, up: (B.railHeight + depth) / 2, across: B.railThickness / 2 }, { along: 0, lift: B.railHeight, side: (i === 0 ? -1 : 1) * halfWidth }));
    }
  }
  const lips = deck.lips.map(([a, b]) => {
    const atTo = (a.x - deck.from.x) * deck.axis.x + (a.y - deck.from.y) * deck.axis.y > deck.length / 2;
    const seg = atTo ? segments[segments.length - 1] : segments[0];
    const h = atTo ? seg.h1 : seg.h0;
    const depth = skirtDepth(w.terrain, a, b, h, h);
    const end = (atTo ? 1 : -1) * ((seg.length * S) / 2 - B.railThickness / 2);
    return segmentBox(world, deck, seg)({ along: B.railThickness / 2, up: depth / 2, across: halfWidth }, { along: end, lift: 0, side: 0 });
  });
  return { plates, rails, lips };
}

function segmentBox(world: RAPIER.World, deck: Deck, seg: DeckSegment) {
  const { axis } = deck;
  const pitch = Math.atan2((seg.h1 - seg.h0) * S, seg.length * S);
  const yaw = headingQuat(Math.atan2(axis.y, axis.x));
  const rot = { x: yaw.y * Math.sin(pitch / 2), y: yaw.y * Math.cos(pitch / 2), z: yaw.w * Math.sin(pitch / 2), w: yaw.w * Math.cos(pitch / 2) };
  const along = { x: Math.cos(pitch) * axis.x, y: Math.sin(pitch), z: Math.cos(pitch) * axis.y };
  const up = { x: -Math.sin(pitch) * axis.x, y: Math.cos(pitch), z: -Math.sin(pitch) * axis.y };
  const across = { x: -axis.y, z: axis.x };
  const mid = {
    x: (seg.from.x + (axis.x * seg.length) / 2) * S,
    y: ((seg.h0 + seg.h1) / 2) * S,
    z: (seg.from.y + (axis.y * seg.length) / 2) * S,
  };
  return (half: { along: number; up: number; across: number }, at: { along: number; lift: number; side: number }): number => {
    const c = at.lift - half.up;
    const desc = RAPIER.ColliderDesc.cuboid(half.along, half.up, half.across)
      .setTranslation(
        mid.x + along.x * at.along + up.x * c + across.x * at.side,
        mid.y + along.y * at.along + up.y * c,
        mid.z + along.z * at.along + up.z * c + across.z * at.side,
      )
      .setRotation(rot);
    return world.createCollider(desc).handle;
  };
}

function skirtDepth(t: Terrain, a: Vec, b: Vec, h0: number, h1: number): number {
  const steps = Math.max(1, Math.ceil(dist(a, b)));
  let depth = 0;
  for (let k = 0; k <= steps; k++) {
    const f = k / steps;
    const line = h0 + (h1 - h0) * f;
    const ground = groundAt(t, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
    depth = Math.max(depth, (line - ground) * S + PHYSICS.rockSink);
  }
  return depth;
}
