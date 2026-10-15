import { SPAWN } from '../data/npcs';
import { combatFoesOf, isHostile } from './combat';
import { companyOf } from './companies';
import { isDefeated } from './defeat';
import type { Vehicle, World } from './types';
import { dist } from './vec';
import { canVehicleSee } from './vision';

type Ties = { member: Vehicle; company: ReadonlySet<string>; foes: ReadonlySet<string>; mates: readonly Vehicle[] };

function tiesOf(w: World, member: Vehicle): Ties {
  const { leader, members } = companyOf(w, member);
  const mates = [leader, ...members];
  return { member, company: new Set(mates.map((v) => v.id)), foes: new Set(combatFoesOf(w, member)), mates };
}

function mateNearby(member: Vehicle, v: Vehicle): boolean {
  return v.faction === member.faction && dist(v.pos, member.pos) <= SPAWN.neighborHelp;
}

function coBelligerent(w: World, ties: Ties, v: Vehicle): boolean {
  if (ties.foes.size === 0 || !combatFoesOf(w, v).some((id) => ties.foes.has(id))) return false;
  return !ties.mates.some((mate) => isHostile(w, v, mate) || isHostile(w, mate, v));
}

function tied(w: World, ties: Ties, v: Vehicle): boolean {
  return ties.company.has(v.id) || mateNearby(ties.member, v) || coBelligerent(w, ties, v);
}

function others(w: World, v: Vehicle, keep: (x: Vehicle) => boolean): Vehicle[] {
  return w.vehicles.filter((x) => x.id !== v.id && keep(x));
}

function awakeOther(observer: Vehicle, v: Vehicle): boolean {
  return v.id !== observer.id && !isDefeated(v);
}

export function perceivedGroup(w: World, observer: Vehicle, member: Vehicle): Vehicle[] {
  const ties = tiesOf(w, member);
  const seen = others(w, member, (v) => awakeOther(observer, v) && tied(w, ties, v) && canVehicleSee(w, observer, v.pos));
  return isDefeated(member) ? seen : [member, ...seen];
}

export function ownSide(w: World, v: Vehicle): Vehicle[] {
  const ties = tiesOf(w, v);
  return [v, ...others(w, v, (x) => !isDefeated(x) && !isHostile(w, v, x) && tied(w, ties, x) && canVehicleSee(w, v, x.pos))];
}

function sidesWithInSight(w: World, ties: Ties, x: Vehicle): boolean {
  return (ties.company.has(x.id) || coBelligerent(w, ties, x)) && canVehicleSee(w, ties.member, x.pos);
}

export function fightSide(w: World, v: Vehicle): Vehicle[] {
  const ties = tiesOf(w, v);
  const mates = (x: Vehicle) => v.brain !== null && x.brain !== null && mateNearby(v, x);
  return [v, ...others(w, v, (x) => mates(x) || sidesWithInSight(w, ties, x))];
}

export function spokesman(w: World, v: Vehicle): Vehicle {
  const { leader } = companyOf(w, v);
  if (leader.id === v.id || !leader.brain || isDefeated(leader) || !canVehicleSee(w, v, leader.pos)) return v;
  return leader;
}
