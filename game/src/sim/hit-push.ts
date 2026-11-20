import { RULES } from '../data/rules';
import { blastReach } from './armor';
import { cellCenter } from './body';
import { mountedItems, itemCells } from './grid';
import { nearestUnit, unitPose } from './rig';
import type { TimedShot } from './timed-combat';
import type { GameEvent, Vehicle } from './types';
import { dist, type Vec } from './vec';

export type HitPush = { vehicle: string; unit: number; dir: Vec; impulse: number; lift: number };

type ShotEvent = Extract<GameEvent, { t: 'shot' }>;

export function hitPushes(flight: TimedShot, event: ShotEvent, bodies: readonly Vehicle[]): HitPush[] {
  const flightDir = flightDirection(flight);
  if (!flightDir) return [];
  const pushes: HitPush[] = [];
  for (const round of event.rounds) {
    const struck = round.struck === null ? undefined : bodies.find((v) => v.id === round.struck);
    if (struck) pushes.push(struckPush(struck, round.hits[0]?.part, flight, flightDir));
    if (explodes(flight)) pushes.push(...burstPushes(bodies, round.struck, round.burst ?? flight.impactAt, flight, flightDir));
  }
  pushes.forEach(checkPush);
  return pushes.filter((p) => p.impulse > 0);
}

function explodes(flight: TimedShot): boolean {
  return flight.round.craterRadius > 0;
}

function flightDirection(flight: TimedShot): Vec | null {
  const length = dist(flight.from, flight.impactAt);
  if (length === 0) return null;
  return { x: (flight.impactAt.x - flight.from.x) / length, y: (flight.impactAt.y - flight.from.y) / length };
}

function struckPush(v: Vehicle, partId: string | undefined, flight: TimedShot, dir: Vec): HitPush {
  const unit = partId === undefined ? nearestUnit(v, flight.impactAt).unit : unitOfPart(v, partId);
  if (explodes(flight)) return { vehicle: v.id, unit, dir, impulse: flight.round.damage * RULES.hitPush.blast, lift: RULES.hitPush.lift };
  return { vehicle: v.id, unit, dir, impulse: flight.round.damage * RULES.hitPush.kinetic, lift: 0 };
}

function unitOfPart(v: Vehicle, partId: string): number {
  const item = mountedItems(v).find((it) => it.part.id === partId);
  const cell = item ? itemCells(item)[0] : undefined;
  if (!cell) throw new Error(`Struck truck ${v.id} has no unit for part ${partId}`);
  return cellCenter(v.chassisId, cell.x, cell.y).unit;
}

function burstPushes(bodies: readonly Vehicle[], struckId: string | null, burst: Vec, flight: TimedShot, flightDir: Vec): HitPush[] {
  const pushes: HitPush[] = [];
  for (const v of bodies) {
    if (v.id === struckId) continue;
    const hit = blastReach(v, burst, flight.round.splashRadius);
    if (!hit) continue;
    const dir = awayFrom(unitPose(v, hit.unit).pos, burst, flightDir);
    pushes.push({ vehicle: v.id, unit: hit.unit, dir, impulse: flight.round.damage * RULES.hitPush.blast * hit.reach, lift: RULES.hitPush.lift });
  }
  return pushes;
}

function awayFrom(at: Vec, burst: Vec, fallback: Vec): Vec {
  const length = dist(at, burst);
  if (length === 0) return fallback;
  return { x: (at.x - burst.x) / length, y: (at.y - burst.y) / length };
}

function checkPush(p: HitPush): void {
  if (!Number.isFinite(p.impulse) || p.impulse < 0) throw new Error(`Hit push on ${p.vehicle} has impulse ${p.impulse}`);
}
