import { PROJECTILE_FLIGHT } from '../data/weapons';
import { spanOf } from './body';
import { PHYSICS } from '../data/physics';
import { aiming, rollRound, spendShot, noteStray, practiceHits, tieLine, directRound, explode, burstPoint, npcFate, tickGuns, fireBlock, targetBlock, hitOdds, noteAttack, isHostile, missPoint, laneOfOffset, shotDamage, wreckVehicle, type Shot, type Landing } from './combat';
import { type MountedWeapon, vehicleStats } from './stats';
import { corePart } from './grid';
import { isKnockedOut, knockOutNpc } from './defeat';
import { isShutDown } from './utility';
import { walkLane } from './armor';
import { bearing, type Vec } from './vec';
import type { World, Vehicle, Aim, GameEvent, ShotRound } from './types';

export type TimedAttempt = { at: number; shooter: string; target: string; weapon: string; aim: Aim; volley: string };
export type TimedFlight = TimedShot & { landsAt: number };
export type TimedRecord = { at: number; kind: 'launch' | 'cancel' | 'impact'; flight: TimedFlight | null; event: Extract<GameEvent, { t: 'shot' }> | null };
export type TimedCombatState = { now: number; turnStart: number; active: boolean; flights: TimedFlight[]; attempts: TimedAttempt[]; fired: string[]; volleys: string[]; records: TimedRecord[]; destroyedAt: Record<string, number> };

export function newTimedCombat(): TimedCombatState {
  return { now: 0, turnStart: 0, active: false, flights: [], attempts: [], fired: [], volleys: [], records: [], destroyedAt: {} };
}

export function beginTimedCombat(world: World, state: TimedCombatState, durationMs: number): void {
  if (state.attempts.length) throw new Error('Unfinished firing schedule at turn start');
  state.active = true;
  state.turnStart = state.now;
  state.records = [];
  state.destroyedAt = {};
  state.fired = [];
  state.volleys = [];
  for (const shooter of world.vehicles) scheduleVehicle(world, state, shooter.id, durationMs);
  state.attempts.sort((a, b) => a.at - b.at);
}

export function stepTimedCombat(world: World, state: TimedCombatState, ms: number): void {
  if (!(Number.isFinite(ms) && ms > 0)) throw new Error('Combat step must be positive');
  const end = state.now + ms;
  while (attemptDue(state)) launchAttempt(world, state, state.attempts.shift()!);
  const due = state.flights.filter(f => f.landsAt <= end).sort((a, b) => a.landsAt - b.landsAt);
  state.flights = state.flights.filter(f => f.landsAt > end);
  for (const flight of due) impactFlight(world, state, flight, end);
  state.now = end;
}

export function endTimedCombat(world: World, state: TimedCombatState): void {
  if (state.attempts.length) throw new Error('Turn ended before scheduled attempts');
  state.active = false;
  finishTimedGuns(world, state.fired);
}

function scheduleVehicle(world: World, state: TimedCombatState, id: string, durationMs: number): void {
  const shooter = world.vehicles.find(v => v.id === id);
  if (!shooter) throw new Error(`Missing shooter ${id}`);
  for (const mounted of vehicleStats(world, shooter).weapons) {
    const order = shooter.weaponOrders[mounted.part.id];
    if (!order) continue;
    const look = timedSpec(mounted.def.id);
    for (let i = 0; i < mounted.def.rounds; i++) {
      const phase = look.pellets ? 0.5 : (i + 0.5) / mounted.def.rounds;
      state.attempts.push({ at: state.now + phase * durationMs, shooter: shooter.id, target: order.targetId, weapon: mounted.part.id, aim: order.aim, volley: mounted.part.id });
    }
  }
}

function attemptDue(state: TimedCombatState): boolean {
  return state.attempts.length > 0 && state.attempts[0].at <= state.now + 1e-6;
}
function timedSpec(id: string) {
  const spec = PROJECTILE_FLIGHT[id];
  if (!spec) throw new Error(`No projectile flight settings for ${id}`);
  return spec;
}
function tryLaunch(world: World, state: TimedCombatState, attempt: TimedAttempt): TimedShot | null {
  const shooter = world.vehicles.find(v => v.id === attempt.shooter);
  const target = world.vehicles.find(v => v.id === attempt.target);
  if (!shooter || !target) return null;
  const weapon = vehicleStats(world, shooter).weapons.find(w => w.part.id === attempt.weapon);
  if (!weapon) return null;
  return launchTimedRound(world, shooter, attempt.weapon, target, attempt.aim, state.now, timedSpec(weapon.def.id).speed, state.volleys.includes(attempt.volley));
}
function launchAttempt(world: World, state: TimedCombatState, attempt: TimedAttempt): void {
    const flight = tryLaunch(world, state, attempt);
    if (!flight) {
      state.records.push({ at: state.now, kind: 'cancel', flight: null, event: null });
      return;
    }
    const distance = Math.hypot(flight.impactAt.x - flight.from.x, flight.impactAt.y - flight.from.y) * PHYSICS.metersPerTile;
    const pending = { ...flight, landsAt: state.now + distance / flight.speed * 1000 };
    state.flights.push(pending);
    if (!state.volleys.includes(attempt.volley)) state.volleys.push(attempt.volley);
    if (!state.fired.includes(attempt.weapon)) state.fired.push(attempt.weapon);
    state.records.push({ at: state.now, kind: 'launch', flight: pending, event: null });
}
function impactFlight(world: World, state: TimedCombatState, flight: TimedFlight, end: number): void {
    const event = landTimedRound(world, flight);
    state.records.push({ at: end, kind: 'impact', flight, event });
    if (event) {
      const from = world.events.length;
      settleTimedImpact(world, event);
      for (const outcome of world.events.slice(from)) if (outcome.t === 'destroyed') state.destroyedAt[outcome.vehicle] = end;
    }
}

export type TimedShot = { shot: Shot; from: Vec; aimedAt: Vec; impactAt: Vec; launchedMs: number; speed: number };

export function launchTimedRound(world: World, shooter: Vehicle, weapon: string, target: Vehicle, aim: Aim, launchedMs: number, speed: number, continuing: boolean): TimedShot | null {
  const mw = vehicleStats(world, shooter).weapons.find(w => w.part.id === weapon);
  if (!mw) return null;
  if (!canLaunch(world, shooter, target, mw, continuing)) return null;
  checkSpeed(speed);
  const odds = hitOdds(world, shooter, mw, target, aim);
  const a = aiming(shooter, target, aim);
  const shot: Shot = { shooter, mw, target, aim, odds, aiming: a, rolls: [rollRound(world, odds, a)] };
  if (!continuing) spendShot(world, shot);
  noteAttack(world, shooter, target, !isHostile(world, target, shooter));
  return { shot, from: { ...shooter.pos }, aimedAt: { ...target.pos }, impactAt: missPoint(shooter.pos, target.pos, a.center + shot.rolls[0].error * odds.distance), launchedMs, speed };
}

export function landTimedRound(world: World, flight: TimedShot): Extract<GameEvent, { t: 'shot' }> | null {
  const source = flight.shot;
  const target = world.vehicles.find(v => v.id === source.target.id) ?? source.target;
  const shooter = world.vehicles.find(v => v.id === source.shooter.id) ?? source.shooter;
  const from = { ...shooter, pos: flight.from };
  const a = aiming(from, target, 'body');
  const shot = { ...source, shooter: from, target, aiming: a };
  const { landing, offset } = timedLanding(world, flight, shot);
  const rounds = timedRounds(world, shot, landing, offset);
  const event = { t: 'shot' as const, shooter: shooter.id, weapon: shot.mw.part.id, target: target.id, aim: shot.aim, chance: shot.odds.chance, damageChance: shot.odds.damageChance, side: shot.aiming.side, rounds };
  for (const id of shotDamage(event).keys()) requiredVehicle(world, id).lastHitBy = shooter.id;
  const landedShot = { ...shot, rolls: shot.rolls.map((roll, i) => ({ ...roll, hit: rounds[i].hit })) };
  noteStray(world, landedShot, event);
  practiceHits(world, landedShot);
  tieLine(world, landedShot, rounds);
  world.events.push(event);
  return event;
}

export function finishTimedGuns(world: World, fired: readonly string[]): void {
  tickGuns(world, new Set(fired));
}

export function settleTimedImpact(world: World, event: Extract<GameEvent, { t: 'shot' }>): void {
  const hit = new Set(shotDamage(event).keys());
  for (const id of hit) {
    const v = world.vehicles.find(v => v.id === id);
    if (!v || v.faction === 'player') continue;
    const cabDamage = cabDamageOf(event, v);
    const fate = npcFate(world, v, hit, cabDamage);
    if (fate === 'dies') wreckVehicle(world, v);
    else if (fate === 'knockedOut') knockOutNpc(world, v);
  }
}

function requiredVehicle(world: World, id: string): Vehicle {
  const vehicle = world.vehicles.find(v => v.id === id);
  if (!vehicle) throw new Error(`No vehicle ${id}`);
  return vehicle;
}

function cabDamageOf(event: Extract<GameEvent, { t: 'shot' }>, vehicle: Vehicle): number {
  const cab = corePart(vehicle, 'cab');
  return (shotDamage(event).get(vehicle.id) ?? []).reduce((sum, hit) => sum + (hit.part === cab.id ? hit.damage : 0), 0);
}
function checkSpeed(speed: number): void {
  if (!(speed > 0 && Number.isFinite(speed))) throw new Error('Projectile speed must be positive');
}
function canLaunch(world: World, shooter: Vehicle, target: Vehicle, mw: MountedWeapon, continuing: boolean): boolean {
  if (!canOperate(world, shooter, mw)) return false;
  return continuing ? targetBlock(world, shooter, mw, target) === null : fireBlock(world, shooter, mw, target) === null;
}
function canOperate(world: World, shooter: Vehicle, mw: MountedWeapon): boolean {
  return corePart(shooter, 'cab').hp > 0 && mw.part.hp > 0 && !isKnockedOut(shooter) && !isShutDown(world, shooter);
}
function impactGeometry(flight: TimedShot, target: Vehicle): { inside: boolean; offset: number } {
  const rel = { x: (flight.impactAt.x - target.pos.x) * PHYSICS.metersPerTile, y: (flight.impactAt.y - target.pos.y) * PHYSICS.metersPerTile };
  const half = spanOf(target.chassisId).half;
  const along = rel.x * Math.cos(target.heading) + rel.y * Math.sin(target.heading);
  const across = -rel.x * Math.sin(target.heading) + rel.y * Math.cos(target.heading);
  const inside = Math.abs(along) <= half.x && Math.abs(across) <= half.z;
  const angle = bearing(flight.from, target.pos);
  const offset = -rel.x * Math.sin(angle) + rel.y * Math.cos(angle);
  return { inside, offset };
}
function timedLanding(world: World, flight: TimedShot, shot: Shot): { landing: Landing; offset: number } {
  if (!world.vehicles.includes(shot.target)) return { landing: { struck: null, lane: null, hits: [], point: flight.impactAt }, offset: 0 };
  const { inside, offset } = impactGeometry(flight, shot.target);
  if (!inside) return { landing: { struck: null, lane: null, hits: [], point: flight.impactAt }, offset };
  const a = shot.aiming;
  const lane = laneOfOffset(a.side, a.body, a.lanes, offset);
  const filled = a.filled[lane];
  if (filled === undefined) return { landing: { struck: null, lane: null, hits: [], point: flight.impactAt }, offset };
  const hits = walkLane(world, shot.target, a.side, filled, directRound(world, shot.mw.def.round, shot.rolls[0].crit));
  return { landing: { struck: shot.target, lane: filled, hits, point: flight.impactAt }, offset };
}

function timedRounds(world: World, shot: Shot, landing: Landing, offset: number): ShotRound[] {
  const hit = landing.struck !== null;
  return [{ hit, crit: hit && shot.rolls[0].crit, offset, struck: landing.struck?.id ?? null, hits: landing.hits, blast: explode(world, shot.mw.def.round, landing), burst: burstPoint(world, shot.mw.def.round, landing) }];
}

export type PrototypeWorld = World & { prototypeCombat?: TimedCombatState };
export const combatState = (world: World) => (world as PrototypeWorld).prototypeCombat;
