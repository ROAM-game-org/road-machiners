import { CRATER_ACCOUNTS, SUNWARD } from '../data/sunward';
import { hashId } from './rng';
import { playerVehicle } from './damage';
import { isDefeated } from './defeat';
import { decide, npcProfile } from './npc-decisions';
import { fightCornered, fleeFrom, interrupt, pushGoal, topGoal } from './npc-activities';
import { inFeud, inTruce, reportIncident } from './relations';
import { canVehicleSee } from './vision';
import { inCore } from './hazard';
import { endFight, makePeace } from './parley';
import { addState, declareFeud, stateOf } from './states';
import { hazardZones, type HazardZone } from './territory';
import { routeLength, route } from './path';
import { vehicleStats } from './stats';
import { inCombatWith } from './combat';
import { checkDrag, isOnRope, releaseDragged } from './tow';
import { trackOf } from './tracks';
import type { CallVars, GoalReason, NpcActivity, NpcState, StateData, StateEnding, SunwardNight, Vehicle, VigilCalls, World } from './types';
import { dist, type Vec } from './vec';
import { dawnAfter, fallenSun, inFallenSun, isSunwardMember, lastDusk, nightWindow, orderStands, returnTurn, sunwardFacts, sunwardPhase } from './sunward';


let crater: HazardZone | null = null;

export function lightZone(): HazardZone {
  crater ??= hazardZones().find((z) => z.id === 'fallen-sun') ?? null;
  if (!crater?.core) throw new Error('The Fallen Sun has no reactor core to drag a truck to');
  return crater;
}

export type DropLane = { approach: Vec; stop: Vec };

function laneAt(angle: number): DropLane {
  const zone = lightZone();
  const at = (r: number): Vec => ({ x: zone.pos.x + Math.cos(angle) * r, y: zone.pos.y + Math.sin(angle) * r });
  const stop = at(zone.core!.radius + SUNWARD.dropGap);
  if (inCore(zone, stop)) throw new Error('A drop spot lies inside the reactor core');
  return { approach: at(zone.radius + SUNWARD.approachGap), stop };
}

export function dropSpot(from: Vec): DropLane {
  return SUNWARD.dropLanes.map(laneAt).reduce((a, b) => (dist(from, a.approach) <= dist(from, b.approach) ? a : b));
}

export function inDropRing(pos: Vec): boolean {
  const zone = lightZone();
  return dist(pos, zone.pos) < zone.radius && !inCore(zone, pos);
}

export function nearTheLight(pos: Vec): boolean {
  const zone = lightZone();
  return dist(pos, zone.pos) <= zone.radius + SUNWARD.straightReach;
}

export function dragDawn(s: NpcState): number {
  return dawnAfter(lastDusk(s.born));
}

export function checkSunwardDrag(world: World, s: NpcState): StateEnding | null {
  const ending = checkDrag(world, s);
  if (ending) return ending;
  const victim = world.vehicles.find((v) => v.id === s.other);
  if (victim && inDropRing(victim.pos)) return 'fulfilled';
  return world.turn >= dragDawn(s) ? 'expired' : null;
}

export function dropAtLight(world: World, s: NpcState): void {
  releaseDragged(world, s);
  const dragger = world.vehicles.find((v) => v.id === s.holder);
  const victim = world.vehicles.find((v) => v.id === s.other);
  if (!dragger || !victim) return;
  makePeace(world, dragger, victim);
  givenUntilDawn(world, victim, dragDawn(s));
}

function givenUntilDawn(world: World, victim: Vehicle, dawn: number): void {
  const left = Math.max(1, dawn - world.turn);
  for (const member of world.vehicles.filter(isSunwardMember)) {
    for (const [a, b] of [[member.id, victim.id], [victim.id, member.id]]) (stateOf(world, 'truce', a, b) ?? addState(world, 'truce', a, b, { kind: 'none' })).turnsLeft = left;
  }
}

function nightOf(world: World): SunwardNight | null {
  return orderStands(world) ? sunwardFacts(world).night : null;
}

function callsTo(world: World, id: string): VigilCalls {
  return nightOf(world)?.calls[id] ?? { count: 0, turn: -SUNWARD.callGap };
}

export function boundToOrder(world: World, member: Vehicle, stranger: Vehicle): boolean {
  return inTruce(world, member, stranger) || offeringOf(world, stranger.id) !== null || isOnRope(world, stranger.id);
}

export function vigilCallDue(world: World, member: Vehicle, nth: number): boolean {
  const me = playerVehicle(world);
  if (!isSunwardMember(member) || !atTheVigil(world, member) || !inFallenSun(me.pos)) return false;
  return onTheLine(world, member, nth) || nextCallDue(world, member, me, nth);
}

function nextCallDue(world: World, member: Vehicle, me: Vehicle, nth: number): boolean {
  const calls = callsTo(world, me.id);
  return !boundToOrder(world, member, me) && calls.count === nth - 1 && world.turn - calls.turn >= SUNWARD.callGap;
}

function onTheLine(world: World, member: Vehicle, nth: number): boolean {
  const call = world.player.call;
  return call !== null && call.with === member.id && call.topic === `vigilCall${nth}` && callsTo(world, world.player.vehicleId).count === nth;
}

function noteCall(world: World, strangerId: string): void {
  const night = nightOf(world);
  if (!night) throw new Error('The Sunward call strangers only on a night of their vigil');
  night.calls[strangerId] = { count: callsTo(world, strangerId).count + 1, turn: world.turn };
}

export function prepareVigilCall(world: World): CallVars {
  noteCall(world, world.player.vehicleId);
  return {};
}

export function knowsTheCrater(world: World, npc: Vehicle): boolean {
  if (!npc.brain) return false;
  return dist(npc.brain.home, fallenSun().pos) <= SUNWARD.talkReach || npc.brain.memories.some((m) => m.fact.kind === 'sighting' && sawMember(world, m.fact.vehicle));
}

function sawMember(world: World, id: string): boolean {
  const seen = world.vehicles.find((v) => v.id === id);
  return seen !== undefined && (isSunwardMember(seen) || seen.faction === 'sunward');
}

export function craterNews(world: World, npc: Vehicle): CallVars {
  if (!knowsTheCrater(world, npc)) throw new Error(`${npc.id} knows nothing of the crater to tell`);
  const pool = orderStands(world) ? CRATER_ACCOUNTS.standing : CRATER_ACCOUNTS.fallen;
  return { news: { kind: 'line', line: pool[Math.floor(hashId(`${npc.id}:crater`) * pool.length)] } };
}

export function offeredTonight(world: World, id: string): boolean {
  return nightWindow(world) && (nightOf(world)?.offered.includes(id) ?? false);
}

export function refuseVigil(world: World, caller: Vehicle): void {
  const me = playerVehicle(world);
  if (!offeringOf(world, me.id)) seize(world, caller, me);
}

export function offeringOf(world: World, holderId: string): NpcState | null {
  return world.states.find((s) => s.kind === 'offering' && s.holder === holderId) ?? null;
}

function offeringData(s: NpcState): Extract<StateData, { kind: 'offering' }> {
  if (s.data.kind !== 'offering') throw new Error(`State ${s.id} holds no offering`);
  return s.data;
}

export function giveWord(world: World, holder: Vehicle, caller: Vehicle): NpcState {
  const zone = lightZone();
  const night = nightOf(world);
  if (night && !night.offered.includes(holder.id)) night.offered.push(holder.id);
  for (const member of world.vehicles.filter(isSunwardMember)) if (inFeud(world, member, holder) || inCombatWith(world, member, holder)) endFight(world, member, holder);
  return addState(world, 'offering', holder.id, caller.id, { kind: 'offering', core: { ...zone.pos }, closest: dist(holder.pos, zone.pos) });
}

export function wordGap(world: World, holder: Vehicle): number {
  const core = lightZone().pos;
  if (nearTheLight(holder.pos)) return dist(holder.pos, core);
  const way = route(world, holder.pos, core, vehicleStats(world, holder).radius, []);
  return routeLength(holder.pos, way) + dist(way.at(-1) ?? holder.pos, core);
}

export function checkOffering(world: World, s: NpcState): StateEnding | null {
  const holder = world.vehicles.find((v) => v.id === s.holder);
  if (!holder) return null;
  const data = offeringData(s);
  if (inCore(lightZone(), holder.pos)) return 'fulfilled';
  if (!nightWindow(world) || world.turn >= returnTurn(lastDusk(world.turn))) return 'expired';
  if (!inFallenSun(holder.pos)) return 'broken';
  const gap = wordGap(world, holder);
  if (world.turn <= s.born + SUNWARD.wordGrace) {
    data.closest = gap;
    return null;
  }
  if (gap > data.closest + SUNWARD.offerMargin) return 'broken';
  data.closest = Math.min(data.closest, gap);
  return null;
}

export function breakWord(world: World, s: NpcState): void {
  const caller = world.vehicles.find((v) => v.id === s.other);
  const holder = world.vehicles.find((v) => v.id === s.holder);
  if (!caller || !holder || isDefeated(caller)) return;
  world.events.push({ t: 'say', speaker: caller.id, to: holder.id, line: 'wordBroken', vars: {} });
  seize(world, caller, holder);
}

function membersSeeing(world: World, victim: Vehicle): Vehicle[] {
  return world.vehicles.filter((v) => isSunwardMember(v) && !isDefeated(v) && canVehicleSee(world, v, victim.pos));
}

export function seize(world: World, caller: Vehicle, victim: Vehicle): void {
  for (const member of [caller, ...membersSeeing(world, victim).filter((v) => v.id !== caller.id)]) {
    declareFeud(world, member, victim.id);
    fightCornered(world, member, victim, 'keepVigil');
  }
  reportIncident(world, { aggressor: caller, victim, deed: 'robbed', victimFights: !isPlayerId(world, victim.id) });
}

function isPlayerId(world: World, id: string): boolean {
  return id === world.player.vehicleId;
}

function atTheVigil(world: World, member: Vehicle): boolean {
  if (!nightWindow(world)) return false;
  const phase = sunwardPhase(world);
  return phase === 'vigil' || (phase === 'ride' && inFallenSun(member.pos));
}

export function callStrangers(world: World): void {
  if (!nightOf(world)) return;
  meetStrangers(world);
  for (const member of world.vehicles.filter((v) => isSunwardMember(v) && !isDefeated(v) && atTheVigil(world, v))) {
    const stranger = world.vehicles.find((x) => calledStranger(world, member, x));
    if (stranger) answerCall(world, member, stranger);
  }
}

export function meetStrangers(world: World): void {
  const members = world.vehicles.filter((v) => isSunwardMember(v) && !isDefeated(v) && atTheVigil(world, v));
  const claimed = new Set(members.flatMap((m) => m.brain!.goals.filter(isMeeting).map((g) => g.targetId)));
  for (const stranger of world.vehicles.filter((x) => !claimed.has(x.id) && strangerToMeet(world, x))) {
    const claimer = members.filter((m) => freeAtPost(m) && !boundToOrder(world, m, stranger) && sensesNow(world, m, stranger)).sort((a, b) => dist(a.pos, stranger.pos) - dist(b.pos, stranger.pos))[0];
    if (!claimer) continue;
    pushGoal(world, claimer, { kind: 'meet', targetId: stranger.id, destination: { ...stranger.pos }, phase: 'travel', reason: 'meetStranger', until: world.turn + SUNWARD.meetTurns });
    members.splice(members.indexOf(claimer), 1);
  }
}

function isMeeting(g: NpcActivity): boolean {
  return g.kind === 'meet' && g.reason === 'meetStranger';
}

function strangerToMeet(world: World, x: Vehicle): boolean {
  return !isSunwardMember(x) && !isDefeated(x) && inFallenSun(x.pos) && !isOnRope(world, x.id) && offeringOf(world, x.id) === null;
}

function freeAtPost(member: Vehicle): boolean {
  const top = member.brain!.goals.at(-1);
  return top?.kind === 'wait' && top.reason === 'keepVigil';
}

function sensesNow(world: World, member: Vehicle, stranger: Vehicle): boolean {
  const track = trackOf(member, stranger.id);
  return track !== undefined && track.turn >= world.turn - 1;
}

export function meetingLapsed(world: World, member: Vehicle, goal: NpcActivity): GoalReason | null {
  const stranger = world.vehicles.find((x) => x.id === goal.targetId);
  if (!stranger || !stillToMeet(world, member, stranger)) return 'contactGone';
  return goal.until !== undefined && world.turn >= goal.until ? 'meetingOff' : null;
}

function stillToMeet(world: World, member: Vehicle, stranger: Vehicle): boolean {
  return nightOf(world) !== null && strangerToMeet(world, stranger) && !boundToOrder(world, member, stranger);
}

function calledStranger(world: World, member: Vehicle, x: Vehicle): boolean {
  return strangerAtVigil(x) && callsTo(world, x.id).count === 0 && !boundToOrder(world, member, x) && canVehicleSee(world, member, x.pos);
}

function strangerAtVigil(x: Vehicle): boolean {
  return x.brain !== null && !isSunwardMember(x) && !isDefeated(x) && inFallenSun(x.pos);
}

function answerCall(world: World, member: Vehicle, stranger: Vehicle): void {
  noteCall(world, stranger.id);
  const answer = decide(world, stranger, 'vigilCalled', member.id, null);
  if (answer === 'refuse') return seize(world, member, stranger);
  if (answer === 'flee') return interrupt(world, stranger, fleeFrom(world, stranger, npcProfile(stranger), member.id, member.pos, 'escapeThreat'));
  giveWord(world, stranger, member);
  pushGoal(world, stranger, { kind: 'wait', targetId: null, destination: { ...stranger.pos }, phase: 'act', reason: 'keepWord', until: returnTurn(lastDusk(world.turn)) });
}

export function keepsWordAtVigil(v: Vehicle): boolean {
  const top = topGoal(v);
  return top?.kind === 'wait' && top.reason === 'keepWord' && top.until !== undefined;
}

export function shoutGiven(world: World, shooter: Vehicle, target: Vehicle): void {
  const night = nightOf(world);
  if (!night || !isSunwardMember(shooter) || night.shouted.includes(target.id)) return;
  night.shouted.push(target.id);
  world.events.push({ t: 'say', speaker: shooter.id, to: target.id, line: 'givenBySky', vars: {} });
}
