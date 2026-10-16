import { CREW } from '../data/npcs';
import { declareFeud, endState, statesHeld } from './states';
import { fightsAgainst, isHostile } from './combat';
import { followersOf, followingOf, followingStatesOf, inCompany, joinCompany } from './companies';
import { isDefeated } from './defeat';
import { recall } from './memory';
import {
  decide, firepower, fitToHunt, getCombatCondition, hasSaleCargo, hasTrait, homeCamp, isWeak, npcProfile, offersChoice, perceiveDanger, raiderGrounds, strengthRatio,
} from './npc-decisions';
import { fightOdds } from './fight-odds';
import { dropGoal, fightCornered, fleeFrom, IDLE_GOALS, inDanger, interrupt, placeBase, replaceBase, topGoal } from './npc-activities';
import { liesUp } from './npc-service';
import { modeRules } from './settings';
import { siteGap } from './sites';
import type { CrewAskCause, CrewLeftCause, NpcActivity, NpcState, StateData, StateEnding, Vehicle, World } from './types';
import { dist } from './vec';
import { canVehicleSee } from './vision';

function campOf(v: Vehicle): string {
  return homeCamp(v).id;
}

function crewData(s: NpcState): Extract<StateData, { kind: 'crew' }> {
  if (s.data.kind !== 'crew') throw new Error(`State ${s.id} holds no crew`);
  return s.data;
}

function isRaider(v: Vehicle): boolean {
  return v.brain !== null && hasTrait(v, 'raider');
}

export function crewOf(w: World, leader: Vehicle): Vehicle[] {
  return followersOf(w, leader.id, ['crew']);
}

function atCamp(v: Vehicle): boolean {
  return siteGap(homeCamp(v), v.pos) <= CREW.campReach;
}

function musterRested(w: World, v: Vehicle): boolean {
  const last = v.brain!.musteredAt;
  return last === undefined || w.turn - last >= CREW.retryTurns;
}

function free(w: World, v: Vehicle): boolean {
  return fitToHunt(w, v) && !inCompany(w, v) && !isDefeated(v);
}

export function canMuster(w: World, v: Vehicle): boolean {
  if (!modeRules(w).traffic || !isRaider(v) || !free(w, v) || !atCamp(v) || !musterRested(w, v)) return false;
  return crewCandidates(w, v, []).length > 0;
}

function isCandidate(w: World, leader: Vehicle, v: Vehicle): boolean {
  if (v.id === leader.id || !isRaider(v) || !free(w, v) || liesUp(v)) return false;
  return campOf(v) === campOf(leader) && atCamp(v);
}

export function crewCandidates(w: World, leader: Vehicle, asked: readonly string[]): Vehicle[] {
  const seen = w.vehicles.filter((v) => !asked.includes(v.id) && isCandidate(w, leader, v) && canVehicleSee(w, leader, v.pos));
  return seen.sort((a, b) => dist(leader.pos, a.pos) - dist(leader.pos, b.pos) || (a.id < b.id ? -1 : 1));
}

export function musterGoal(w: World, v: Vehicle): NpcActivity {
  const first = crewCandidates(w, v, [])[0];
  if (!first) throw new Error(`${v.id} chose to muster with no raider in sight to ask`);
  return { kind: 'muster', targetId: first.id, destination: { ...first.pos }, phase: 'travel', reason: 'musterCrew', until: w.turn + CREW.musterTurns, asked: [] };
}

function askedOf(goal: NpcActivity): string[] {
  if (!goal.asked) throw new Error(`A muster on ${goal.targetId} keeps no list of asked raiders`);
  return goal.asked;
}

function musterOver(w: World, leader: Vehicle, goal: NpcActivity): boolean {
  if (goal.until === undefined) throw new Error(`${leader.id} musters with no end turn`);
  return w.turn >= goal.until || crewOf(w, leader).length >= CREW.size - 1;
}

export function steerMuster(w: World, leader: Vehicle, goal: NpcActivity): void {
  if (musterOver(w, leader, goal)) return endMuster(w, leader, goal);
  const next = crewCandidates(w, leader, askedOf(goal))[0];
  if (!next) return waitAtCamp(goal);
  if (dist(leader.pos, next.pos) <= CREW.askReach) return askInReach(w, leader, goal, next);
  goal.targetId = next.id;
  goal.destination = { ...next.pos };
  goal.phase = 'travel';
}

function waitAtCamp(goal: NpcActivity): void {
  goal.targetId = null;
  goal.destination = null;
  goal.phase = 'act';
}

function askInReach(w: World, leader: Vehicle, goal: NpcActivity, candidate: Vehicle): void {
  askedOf(goal).push(candidate.id);
  askToJoin(w, leader, candidate);
  goal.targetId = candidate.id;
  goal.destination = null;
  goal.phase = 'act';
  if (musterOver(w, leader, goal)) endMuster(w, leader, goal);
}

export function askToJoin(w: World, leader: Vehicle, candidate: Vehicle): 'join' | 'decline' {
  const answer = decide(w, candidate, 'crewAsked', leader.id, null);
  w.events.push({ t: 'crewAsked', leader: leader.id, member: candidate.id, answer, cause: askCause(w, candidate, leader, answer) });
  if (answer === 'join') joinCrew(w, candidate, leader);
  return answer;
}

function askCause(w: World, candidate: Vehicle, leader: Vehicle, answer: 'join' | 'decline'): CrewAskCause {
  if (answer === 'join') return 'joined';
  if (holdsGrudge(w, candidate, leader)) return 'grudge';
  if (isWeak(w, candidate)) return 'weak';
  return hasSaleCargo(candidate) ? 'busy' : 'declined';
}

const GRUDGES: readonly NpcState['kind'][] = ['feud', 'grievance', 'revenge'];

export function holdsGrudge(w: World, candidate: Vehicle, leader: Vehicle): boolean {
  const grudges = statesHeld(w, candidate.id).filter((s) => s.other === leader.id && GRUDGES.includes(s.kind));
  if (grudges.length > 0) return true;
  return recall(candidate, 'wronged').some((m) => m.fact.by === leader.id);
}

export function canJoin(w: World, candidate: Vehicle, leader: Vehicle): boolean {
  return !holdsGrudge(w, candidate, leader) && !isHostile(w, candidate, leader) && !isHostile(w, leader, candidate);
}

export function joinFactor(w: World, candidate: Vehicle, leader: Vehicle): number {
  const stronger = strengthRatio(fightOdds(w, [candidate], [leader])) > 1 ? CREW.strongerLeader : 1;
  return stronger * (hasSaleCargo(candidate) ? CREW.lowAppetite : 1);
}

function joinCrew(w: World, member: Vehicle, leader: Vehicle, turnsLeft?: number): void {
  joinCompany(w, member, leader, 'crew', { kind: 'crew', camp: campOf(leader) }, turnsLeft);
  placeBase(w, member, crewFollow(leader));
}

function crewFollow(leader: Vehicle): NpcActivity {
  return { kind: 'follow', targetId: leader.id, destination: { ...leader.pos }, phase: 'travel', reason: 'crewLeader' };
}

function endMuster(w: World, leader: Vehicle, goal: NpcActivity): void {
  leader.brain!.musteredAt = w.turn;
  const crew = crewOf(w, leader);
  if (crew.length === 0) {
    w.events.push({ t: 'crewFailed', leader: leader.id });
    dropGoal(w, leader, goal, 'nothingToDo');
    return;
  }
  w.events.push({ t: 'crewFormed', leader: leader.id, members: crew.map((v) => v.id) });
  setRaid(w, leader, IDLE_GOALS.raid(w, leader), goal);
}

function setRaid(w: World, leader: Vehicle, raid: NpcActivity, replaced: NpcActivity | null): void {
  if (replaced && leader.brain!.goals[0] === replaced) return replaceBase(w, leader, raid);
  if (replaced) dropGoal(w, leader, replaced, 'crewLeader');
  placeBase(w, leader, raid);
}

function leaderTarget(w: World, leader: Vehicle): Vehicle | null {
  const top = topGoal(leader);
  if (top?.kind !== 'fight' || top.targetId === null) return null;
  return w.vehicles.find((v) => v.id === top.targetId) ?? null;
}

export function crewLeaderOf(w: World, member: Vehicle): Vehicle | null {
  const s = followingOf(w, member);
  if (s?.kind !== 'crew') return null;
  const leader = w.vehicles.find((v) => v.id === s.other);
  return leader && !isDefeated(leader) ? leader : null;
}

export function heldBackByCrew(w: World, member: Vehicle, hostile: Vehicle): boolean {
  const leader = crewLeaderOf(w, member);
  if (!leader || !canVehicleSee(w, member, leader.pos)) return false;
  return ![member, leader].some((v) => attacks(w, hostile, v));
}

function attacks(w: World, hostile: Vehicle, v: Vehicle): boolean {
  return (v.brain !== null && hostile.id in v.brain.attackers) || fightsAgainst(w, hostile, v);
}

function calledKey(targetId: string): string {
  return `crewCalled:${targetId}`;
}

function callFrom(w: World, member: Vehicle): { leader: Vehicle; target: Vehicle } | null {
  const leader = inDanger(member) ? null : crewLeaderOf(w, member);
  const target = leader ? leaderTarget(w, leader) : null;
  if (!leader || !target) return null;
  return heedsCall(w, member, target) ? { leader, target } : null;
}

function heedsCall(w: World, member: Vehicle, target: Vehicle): boolean {
  return canVehicleSee(w, member, target.pos) && !(calledKey(target.id) in member.brain!.noticed);
}

export function onCrewCall(w: World, member: Vehicle): void {
  const call = callFrom(w, member);
  if (!call || !offersChoice(w, member, 'crewCalled', call.target.id)) return;
  member.brain!.noticed[calledKey(call.target.id)] = w.turn;
  const answer = decide(w, member, 'crewCalled', call.target.id, perceiveDanger(w, member, call.target));
  if (answer === 'fight') joinFight(w, member, call.target);
  if (answer === 'flee') defect(w, member, call.leader, call.target);
}

function joinFight(w: World, member: Vehicle, target: Vehicle): void {
  if (!isHostile(w, member, target)) declareFeud(w, member, target.id);
  fightCornered(w, member, target, 'crewLeader');
}

function defect(w: World, member: Vehicle, leader: Vehicle, threat: Vehicle): void {
  leaveCrew(w, member, leader, 'fled');
  interrupt(w, member, fleeFrom(w, member, npcProfile(member), threat.id, threat.pos, 'escapeThreat'));
}

function leaveCrew(w: World, member: Vehicle, leader: Vehicle, cause: CrewLeftCause): void {
  const s = followingOf(w, member);
  if (s?.kind !== 'crew' || s.other !== leader.id) throw new Error(`${member.id} rides in no crew of ${leader.id}`);
  w.events.push({ t: 'crewLeft', leader: leader.id, member: member.id, cause });
  endState(w, s, 'broken');
}

function gone(w: World, id: string): boolean {
  const v = w.vehicles.find((x) => x.id === id);
  return !v || isDefeated(v);
}

export function checkCrew(w: World, s: NpcState): StateEnding | null {
  const member = w.vehicles.find((v) => v.id === s.holder);
  const leader = w.vehicles.find((v) => v.id === s.other);
  if (!member || !leader) return null;
  return isDefeated(member) || isDefeated(leader) || turnedOn(w, member, leader) ? 'broken' : null;
}

function turnedOn(w: World, a: Vehicle, b: Vehicle): boolean {
  return isHostile(w, a, b) || isHostile(w, b, a);
}

const settling = new Set<string>();

export function endCrewState(w: World, s: NpcState, ending: StateEnding): void {
  if (settling.has(s.other)) return;
  if (ending === 'expired') return void disbandOnce(w, s.other);
  if (ending !== 'broken') throw new Error(`A crew state never ends ${ending}`);
  if (gone(w, s.other)) return succeed(w, s);
  const cause = brokenCause(w, s);
  if (cause) w.events.push({ t: 'crewLeft', leader: s.other, member: s.holder, cause });
  disbandOnce(w, s.other);
}

function brokenCause(w: World, s: NpcState): CrewLeftCause | null {
  if (gone(w, s.holder)) return 'knockedOut';
  return turnedOn(w, vehicleOf(w, s.holder), vehicleOf(w, s.other)) ? 'hostile' : null;
}

function vehicleOf(w: World, id: string): Vehicle {
  const v = w.vehicles.find((x) => x.id === id);
  if (!v) throw new Error(`No vehicle ${id}`);
  return v;
}

function disbandOnce(w: World, leaderId: string): void {
  if (followingStatesOf(w, leaderId).some((x) => x.kind === 'crew')) return;
  w.events.push({ t: 'crewDisbanded', leader: leaderId });
}

function succeed(w: World, ended: NpcState): void {
  const fallen = ended.other;
  settling.add(fallen);
  try {
    const rest = followingStatesOf(w, fallen).filter((x) => x.kind === 'crew');
    for (const r of rest) endState(w, r, 'broken');
    const survivors = [ended, ...rest].flatMap((x) => (gone(w, x.holder) ? [] : [{ member: vehicleOf(w, x.holder), turnsLeft: x.turnsLeft }]));
    if (survivors.length < 2) {
      w.events.push({ t: 'crewDisbanded', leader: fallen });
      return;
    }
    const heir = heirOf(w, survivors.map((x) => x.member));
    takeOver(w, heir, fallen, crewData(ended).camp);
    for (const { member, turnsLeft } of survivors) if (member !== heir) joinCrew(w, member, heir, turnsLeft ?? undefined);
    w.events.push({ t: 'crewLed', leader: heir.id, fallen });
  } finally {
    settling.delete(fallen);
  }
}

export function heirOf(w: World, members: readonly Vehicle[]): Vehicle {
  if (members.length === 0) throw new Error('A crew with nobody left has no heir');
  const strength = (v: Vehicle) => firepower(w, v) * getCombatCondition(w, v);
  return [...members].sort((a, b) => strength(b) - strength(a) || (a.id < b.id ? -1 : 1))[0];
}

function takeOver(w: World, heir: Vehicle, fallenId: string, camp: string): void {
  if (campOf(heir) !== camp) throw new Error(`${heir.id} of ${campOf(heir)} cannot lead a crew of ${camp}`);
  const follow = heir.brain!.goals.find((g) => g.kind === 'follow');
  if (follow) dropGoal(w, heir, follow, 'crewLeader');
  setRaid(w, heir, inheritedRaid(w, fallenId) ?? nearestPostRaid(w, heir), null);
}

function inheritedRaid(w: World, fallenId: string): NpcActivity | null {
  const base = w.vehicles.find((v) => v.id === fallenId)?.brain?.goals[0];
  return base?.kind === 'raid' ? structuredClone(base) : null;
}

function nearestPostRaid(w: World, v: Vehicle): NpcActivity {
  const posts = [...raiderGrounds(w, homeCamp(v))].sort((a, b) => dist(v.pos, a) - dist(v.pos, b));
  if (posts.length === 0) throw new Error(`${v.id} has no hunting ground to lead its crew to`);
  return { kind: 'raid', targetId: null, destination: { ...posts[0] }, phase: 'travel', reason: 'raid' };
}

export function settleCrews(w: World): void {
  for (const s of w.states.filter((x) => x.kind === 'crew')) {
    if (w.states.includes(s) && (gone(w, s.holder) || gone(w, s.other))) endState(w, s, 'broken');
  }
}
