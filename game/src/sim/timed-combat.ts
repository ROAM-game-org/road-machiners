import type { WeaponRound } from '../data/parts';
import { applyGodMode } from './cheats';
import { attachLine } from './harpoon';
import { PROJECTILE_FLIGHT } from '../data/weapons';
import { segmentTruckEntry } from './rig';
import { PHYSICS } from '../data/physics';
import { aiming, rollRound, spendShot, noteStrayHits, practiceLandedHits, directRound, explode, burstPoint, npcFate, tickGuns, fireBlock, targetBlock, hitOdds, noteAttack, isHostile, missPoint, laneOfOffset, shotDamage, wreckVehicle, type Shot, type Landing } from './combat';
import { type MountedWeapon, vehicleStats } from './stats';
import { corePart, mountedParts } from './grid';
import { checkDeath, checkKnockout, isKnockedOut, knockOutNpc } from './defeat';
import { isShutDown } from './utility';
import { walkLane, heldPart, type Side } from './armor';
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
  advanceFlights(world, state, end);
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
function impactFlight(world: World, state: TimedCombatState, flight: TimedFlight, end: number, struck: string | null): void {
    const event = landTimedRound(world, flight, struck);
    state.records.push({ at: end, kind: 'impact', flight, event });
    if (event) {
      const from = world.events.length;
      settleTimedImpact(world, event);
      for (const outcome of world.events.slice(from)) if (outcome.t === 'destroyed') state.destroyedAt[outcome.vehicle] = end;
    }
}

export type TimedShot = { shooterId: string; targetId: string; weaponId: string; weaponDefId: string; aim: Aim; chance: number; damageChance: number; round: WeaponRound; lineTurns: number | null; targetSide: Side; roll: { hit: boolean; error: number; crit: boolean }; from: Vec; aimedAt: Vec; impactAt: Vec; launchedMs: number; speed: number };

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
  return { shooterId: shooter.id, targetId: target.id, weaponId: weapon, weaponDefId: mw.def.id, aim, chance: odds.chance, damageChance: odds.damageChance, round: { ...mw.def.round }, lineTurns: mw.def.line?.turns ?? null, targetSide: a.side, roll: shot.rolls[0], from: { ...shooter.pos }, aimedAt: { ...target.pos }, impactAt: missPoint(shooter.pos, target.pos, a.center + shot.rolls[0].error * odds.distance), launchedMs, speed };
}

export function landTimedRound(world: World, flight: TimedShot, struck?: string | null): Extract<GameEvent, { t: 'shot' }> | null {
  const target = impactTarget(world, flight, struck);
  const a = target ? aiming({ pos: flight.from }, target, 'body') : null;
  const { landing, offset } = timedLanding(world, flight, target, a, struck !== undefined);
  const rounds = timedRounds(world, flight, landing, offset);
  const event = { t: 'shot' as const, shooter: flight.shooterId, weapon: flight.weaponId, target: flight.targetId, aim: flight.aim, chance: flight.chance, damageChance: flight.damageChance, side: a?.side ?? flight.targetSide, rounds };
  attributeImpact(world, flight, event);
  hookFlight(world, flight, landing, event.side);
  world.events.push(event);
  return event;
}

export function finishTimedGuns(world: World, fired: readonly string[]): void {
  tickGuns(world, new Set(fired));
}

export function settleTimedImpact(world: World, event: Extract<GameEvent, { t: 'shot' }>): void {
  applyGodMode(world);
  checkDeath(world);
  checkKnockout(world, [event]);
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
  if (shooter.id === world.player.vehicleId && world.player.state !== 'active') return false;
  return mw.part.hp > 0 && !isKnockedOut(shooter) && !isShutDown(world, shooter);
}
function impactGeometry(flight: TimedShot, target: Vehicle, contacted: boolean): { inside: boolean; offset: number } {
  const angle = bearing(flight.from, target.pos);
  const rel = { x: (flight.impactAt.x - target.pos.x) * PHYSICS.metersPerTile, y: (flight.impactAt.y - target.pos.y) * PHYSICS.metersPerTile };
  const inside = contacted || segmentTruckEntry(target, flight.impactAt, flight.impactAt) !== null;
  return { inside, offset: -rel.x * Math.sin(angle) + rel.y * Math.cos(angle) };
}
function timedLanding(world: World, flight: TimedShot, target: Vehicle | undefined, a: ReturnType<typeof aiming> | null, contacted: boolean): { landing: Landing; offset: number } {
  if (!target || !a) return missedLanding(flight, 0);
  const { inside, offset } = impactGeometry(flight, target, contacted);
  if (!inside) return missedLanding(flight, offset);
  const filled = a.filled[laneOfOffset(a.side, a.body, a.lanes, offset)];
  if (filled === undefined) return missedLanding(flight, offset);
  const hits = walkLane(world, target, a.side, filled, directRound(world, flight.round, flight.roll.crit && target.id === flight.targetId));
  return { landing: { struck: target, lane: filled, hits, point: flight.impactAt }, offset };
}
function missedLanding(flight: TimedShot, offset: number): { landing: Landing; offset: number } {
  return { landing: { struck: null, lane: null, hits: [], point: flight.impactAt }, offset };
}
function timedRounds(world: World, flight: TimedShot, landing: Landing, offset: number): ShotRound[] {
  const hit = landing.struck?.id === flight.targetId;
  return [{ hit, crit: hit && flight.roll.crit, offset, struck: landing.struck?.id ?? null, hits: landing.hits, blast: explode(world, flight.round, landing), burst: burstPoint(world, flight.round, landing) }];
}
function hookFlight(world: World, flight: TimedShot, landing: Landing, side: Side): void {
  if (flight.lineTurns === null || landing.lane === null || !landing.struck) return;
  const source = hookSource(world, flight);
  if (!source) return;
  const part = heldPart(landing.struck, side, landing.lane);
  if (part) attachLine(world, { from: source.shooter, fromPart: source.weapon.id, to: landing.struck, toPart: part.id }, flight.lineTurns);
}

export const combatState = (world: World): TimedCombatState => world.combat;

function hookSource(world: World, flight: TimedShot): { shooter: Vehicle; weapon: MountedWeapon['part'] } | null {
  const shooter = world.vehicles.find(v => v.id === flight.shooterId);
  if (!shooter) return null;
  const weapon = mountedParts(shooter, 'weapon').find(p => p.id === flight.weaponId && p.hp > 0);
  return weapon ? { shooter, weapon } : null;
}

export function transformedCombat(state: TimedCombatState, point: (position: Vec) => Vec, scale: number): TimedCombatState {
  if (state.active || state.attempts.length > 0) throw new Error('Cannot move an active combat step to another map');
  if (!(scale > 0 && Number.isFinite(scale))) throw new Error('Combat map scale must be positive');
  return { ...newTimedCombat(), now: state.now, flights: state.flights.map(flight => transformedFlight(state.now, flight, point, scale)) };
}
function transformedFlight(now: number, flight: TimedFlight, point: (position: Vec) => Vec, scale: number): TimedFlight {
  const moved = { ...flight, from: point(flight.from), aimedAt: point(flight.aimedAt), impactAt: point(flight.impactAt) };
  if (scale === 1) return moved;
  const share = Math.max(0, Math.min(1, (now - flight.launchedMs) / (flight.landsAt - flight.launchedMs)));
  moved.from = point({ x: flight.from.x + (flight.impactAt.x - flight.from.x) * share, y: flight.from.y + (flight.impactAt.y - flight.from.y) * share });
  moved.launchedMs = now;
  moved.landsAt = now + Math.max(0, flight.landsAt - now) * scale;
  return moved;
}

function flightPoint(flight: TimedFlight, at: number): Vec {
  const share = Math.max(0, Math.min(1, (at - flight.launchedMs) / (flight.landsAt - flight.launchedMs)));
  return { x: flight.from.x + (flight.impactAt.x - flight.from.x) * share, y: flight.from.y + (flight.impactAt.y - flight.from.y) * share };
}

function advanceFlights(world: World, state: TimedCombatState, end: number): void {
  const due = state.flights.flatMap(flight => flightContact(world, flight, state.now, end));
  due.sort((a, b) => a.at - b.at);
  for (const contact of due) {
    const flight = contact.flight;
    flight.impactAt = flightPoint(flight, contact.at);
    flight.landsAt = contact.at;
    state.flights = state.flights.filter(f => f !== flight);
    impactFlight(world, state, flight, contact.at, contact.struck);
  }
}

type FlightContact = { flight: TimedFlight; at: number; struck: string | null };
function flightContact(world: World, flight: TimedFlight, now: number, end: number): FlightContact[] {
  const from = flightPoint(flight, now), to = flightPoint(flight, end);
  const contacts = world.vehicles.filter(v => v.id !== flight.shooterId).flatMap(v => {
    const entry = segmentTruckEntry(v, from, to);
    return entry === null ? [] : [{ flight, at: Math.max(now, flight.launchedMs) + entry * (Math.min(end, flight.landsAt) - Math.max(now, flight.launchedMs)), struck: v.id }];
  });
  contacts.sort((a, b) => a.at - b.at);
  if (contacts.length > 0) return [contacts[0]];
  return flight.landsAt <= end ? [{ flight, at: flight.landsAt, struck: null }] : [];
}

function impactTarget(world: World, flight: TimedShot, struck: string | null | undefined): Vehicle | undefined {
  const id = struck === undefined ? flight.targetId : struck;
  return world.vehicles.find(v => v.id === id);
}

function attributeImpact(world: World, flight: TimedShot, event: Extract<GameEvent, { t: 'shot' }>): void {
  for (const id of shotDamage(event).keys()) requiredVehicle(world, id).lastHitBy = flight.shooterId;
  const shooter = world.vehicles.find(v => v.id === flight.shooterId);
  if (shooter) noteStrayHits(world, shooter, flight.targetId, event);
  practiceLandedHits(world, flight.shooterId, flight.targetId, Number(event.rounds[0].hit), flight.chance);
}
