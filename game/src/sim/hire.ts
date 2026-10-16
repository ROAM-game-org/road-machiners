import { HIRE } from '../data/npcs';
import { EFFORT } from '../data/market';
import { inCombat, isHostile } from './combat';
import { followingOf, followingStatesOf, joinCompany } from './companies';
import { playerVehicle } from './damage';
import { isDefeated } from './defeat';
import { dutyPrice } from './duty';
import { transfer } from './economy';
import { inDanger, placeBase } from './npc-activities';
import { decide } from './npc-decisions';
import { modeRules } from './settings';
import { endState } from './states';
import { isFreeMerc } from './tow';
import type { GuardEnd, NpcActivity, NpcState, StateEnding, Vehicle, World } from './types';
import { canVehicleSee } from './vision';

export function guardFee(w: World, merc: Vehicle): number {
  const fee = dutyPrice(w, merc, HIRE.turns * EFFORT.refSpeed, HIRE.turns);
  if (!Number.isFinite(fee) || fee <= 0) throw new Error(`${merc.id} names a guard fee of ${fee}`);
  return fee;
}

export function playerGuard(w: World): { merc: Vehicle; turnsLeft: number } | null {
  const s = guardState(w);
  if (!s) return null;
  if (s.turnsLeft === null) throw new Error(`Hire ${s.id} has no end`);
  const merc = w.vehicles.find((v) => v.id === s.holder);
  return merc ? { merc, turnsLeft: s.turnsLeft } : null;
}

function guardState(w: World): NpcState | null {
  const held = followingStatesOf(w, w.player.vehicleId).filter((s) => s.kind === 'hire');
  if (held.length > 1) throw new Error(`The player holds ${held.length} hired guards`);
  return held[0] ?? null;
}

export function canHireGuard(w: World, merc: Vehicle): boolean {
  if (!modeRules(w).radio || w.player.state !== 'active' || guardState(w) !== null) return false;
  return isFreeMerc(w, merc) && calmToward(w, merc, playerVehicle(w));
}

function calmToward(w: World, merc: Vehicle, me: Vehicle): boolean {
  if (isHostile(w, merc, me) || isHostile(w, me, merc)) return false;
  return !inCombat(w, merc) && !inDanger(merc) && canVehicleSee(w, me, merc.pos);
}

export function guardTaken(w: World, merc: Vehicle): boolean {
  return decide(w, merc, 'hireOffered', w.player.vehicleId, null) === 'take';
}

export function hireGuard(w: World, merc: Vehicle, fee: number): void {
  if (!canHireGuard(w, merc)) throw new Error(`The player cannot hire ${merc.id}`);
  if (fee !== guardFee(w, merc)) throw new Error(`${merc.id} named ${fee}, but its fee is ${guardFee(w, merc)}`);
  const me = playerVehicle(w);
  transfer(w, me, merc, fee);
  joinCompany(w, merc, me, 'hire', { kind: 'hire', fee });
  placeBase(w, merc, guardFollow(me));
  w.events.push({ t: 'guardHired', merc: merc.id, fee, until: w.turn + HIRE.turns });
}

function guardFollow(me: Vehicle): NpcActivity {
  return { kind: 'follow', targetId: me.id, destination: { ...me.pos }, phase: 'travel', reason: 'hiredGuard' };
}

export function isPlayerGuard(w: World, merc: Vehicle): boolean {
  const s = followingOf(w, merc);
  return s?.kind === 'hire' && s.other === w.player.vehicleId;
}

export function dismissGuard(w: World): void {
  const s = guardState(w);
  if (!s) throw new Error('The player holds no guard to dismiss');
  endState(w, s, 'fulfilled');
}

export function checkHire(w: World, s: NpcState): StateEnding | null {
  const merc = w.vehicles.find((v) => v.id === s.holder);
  const client = w.vehicles.find((v) => v.id === s.other);
  if (!merc || !client) return null;
  if (outOfJob(w, merc)) return 'broken';
  return isHostile(w, merc, client) || isHostile(w, client, merc) ? 'broken' : null;
}

function outOfJob(w: World, merc: Vehicle): boolean {
  return isDefeated(merc) || w.player.state !== 'active';
}

const ENDS: Record<Exclude<StateEnding, 'broken'>, GuardEnd> = { expired: 'expired', fulfilled: 'dismissed' };

export function endHireState(w: World, s: NpcState, ending: StateEnding): void {
  const merc = w.vehicles.find((v) => v.id === s.holder);
  const end = ending === 'broken' ? brokenEnd(w, merc) : ENDS[ending];
  w.events.push({ t: 'guardEnded', merc: s.holder, end });
}

function brokenEnd(w: World, merc: Vehicle | undefined): GuardEnd {
  return !merc || outOfJob(w, merc) ? 'knockedOut' : 'hostile';
}
