import { BOUNTY, CRIME } from '../data/market';
import { OFFENSE_LINES } from '../data/personalities';
import { anyOptionOpen, getKnownSite, decide, judgeDanger, npcProfile, wantsPeace } from './npc-decisions';
import { createActivity, dropGoal, finishGoal, fightGoal, fleeFrom, goalsOf, interrupt, placeBase, pushGoal, topGoal } from './npc-activities';
import { canPayBounty, dropHunt, lastOffer, leadCases, offerCases, openCasesOn, owedBy, payBounty, takeHunt, targetNeed, tellCases, withdrawCases } from './crime';
import { followersOf, followingOf, followingStatesOf, inCompany } from './companies';
import { followGoal, startEscort } from './tow';
import { playerVehicle, vehicleById } from './damage';
import { isDefeated } from './defeat';
import { endLines } from './harpoon';
import { heldSearch } from './market';
import { sightingOf } from './memory';
import { lieUpSpot } from './npc-service';
import { modeRules } from './settings';
import { nearestPad, type Site } from './sites';
import { addState, declareFeud, endState, stateOf } from './states';
import type { CallVars, CaseLead, CrimeCase, CrimeOffense, NpcActivity, NpcState, Vehicle, World } from './types';
import { dist, type Vec } from './vec';
import { canVehicleSee } from './vision';

export type DemandAnswer = 'pay' | 'refuse';

export function isMarshal(v: Vehicle): boolean {
  return v.brain?.traits.includes('marshal') === true;
}

export function marshalLead(world: World): { at: Vec; turn: number } | null {
  const search = heldSearch(world);
  if (!search || search.delivered) return null;
  let newest: { at: Vec; turn: number } | null = null;
  for (const car of world.vehicles) {
    if (!isMarshal(car) || isDefeated(car)) continue;
    const seen = sightingOf(car, search.target);
    if (seen && (!newest || seen.turn > newest.turn)) newest = { at: { ...seen.fact.at }, turn: seen.turn };
  }
  return newest && newest.turn > search.lead.turn ? newest : null;
}

export function planMarshal(world: World, marshal: Vehicle, seen: Vehicle[]): void {
  if (ridesInPair(world, marshal)) return;
  const top = topGoal(marshal);
  if (!top) return planAtPost(world, marshal, null, seen);
  planOnGoal(world, marshal, top, seen);
}

function planOnGoal(world: World, marshal: Vehicle, top: NpcActivity, seen: Vehicle[]): void {
  if (top.kind === 'flee') return withdrawOnFlight(world, marshal, top);
  if (top.kind === 'pursue') return hunt(world, marshal, seen);
  if (waitsAtPost(top)) planAtPost(world, marshal, top, seen);
}

function planAtPost(world: World, marshal: Vehicle, top: NpcActivity | null, seen: Vehicle[]): void {
  const taken = takeCase(world, marshal, seen);
  if (taken) return startHunt(world, marshal, taken, seen);
  if (!top) pushGoal(world, marshal, postGoal(world, marshal));
}

function ridesInPair(world: World, marshal: Vehicle): boolean {
  const held = followingOf(world, marshal);
  if (held?.kind !== 'escort') return false;
  const leader = hunterOf(world, marshal);
  if (!leader || leader.id === marshal.id) {
    breakPair(world, marshal, held);
    return false;
  }
  if (!goalsOf(marshal).some((g) => g.kind === 'follow')) placeBase(world, marshal, followGoal(leader));
  return true;
}

function breakPair(world: World, follower: Vehicle, held: NpcState): void {
  endState(world, held, 'expired');
  for (const goal of goalsOf(follower).filter((g) => g.kind === 'follow' && g.targetId === held.other)) dropGoal(world, follower, goal, 'leftLeader');
}

function idlePartner(world: World, marshal: Vehicle, seen: Vehicle[]): Vehicle | null {
  return seen.find((v) => v.id !== marshal.id && isMarshal(v) && idleAtPost(v) && !isDefeated(v) && !inCompany(world, v)) ?? null;
}

function idleAtPost(marshal: Vehicle): boolean {
  const top = topGoal(marshal);
  return top !== null && waitsAtPost(top) && top.phase === 'act';
}

function waitsAtPost(goal: NpcActivity): boolean {
  return goal.kind === 'wait' && goal.reason === 'atPost';
}

function startHunt(world: World, marshal: Vehicle, taken: TakenCase, seen: Vehicle[]): void {
  if (topGoal(marshal)) finishGoal(world, marshal, 'bountyHunt');
  if (taken.partner) startEscort(world, taken.partner, marshal, null, 0);
  pushGoal(world, marshal, pursueGoal(world, taken.case));
  hunt(world, marshal, seen);
}

function postGoal(world: World, marshal: Vehicle): NpcActivity {
  const post = getKnownSite(CRIME.post);
  return { ...createActivity('wait', post.id, lieUpSpot(world, marshal, post), 'atPost'), until: world.turn + BOUNTY.postTurns };
}

function pursueGoal(world: World, c: CrimeCase): NpcActivity {
  return { ...createActivity('pursue', c.target, { ...c.lead.at }, 'bountyHunt'), until: world.turn + BOUNTY.huntTurns, asked: [] };
}

export type TakenCase = { case: CrimeCase; partner: Vehicle | null };

export function takeCase(world: World, marshal: Vehicle, seen: Vehicle[]): TakenCase | null {
  if (!modeRules(world).bounties) return null;
  for (const target of rankedTargets(world, marshal)) {
    const need = targetNeed(world, target);
    const partner = need === 'pair' ? idlePartner(world, marshal, seen) : null;
    if (need === 'lone' || partner) return { case: takeHunt(world, target, marshal.id), partner };
  }
  return null;
}

type TargetTotal = { owed: number; oldest: number };

function rankedTargets(world: World, marshal: Vehicle): string[] {
  const totals = [...targetTotals(world, marshal).entries()].filter(([target]) => huntable(world, target));
  totals.sort(([, a], [, b]) => b.owed - a.owed || a.oldest - b.oldest);
  return totals.map(([target]) => target);
}

function targetTotals(world: World, marshal: Vehicle): Map<string, TargetTotal> {
  const totals = new Map<string, TargetTotal>();
  for (const c of world.crimes.filter((x) => x.status === 'open' && x.target !== marshal.id)) {
    const t = totals.get(c.target) ?? { owed: 0, oldest: Infinity };
    totals.set(c.target, { owed: t.owed + c.owed, oldest: Math.min(t.oldest, c.filed) });
  }
  return totals;
}

function huntable(world: World, targetId: string): boolean {
  if (targetNeed(world, targetId) === null) return false;
  if (openCasesOn(world, targetId).some((c) => c.hunter !== null || (c.retryAt ?? -Infinity) > world.turn)) return false;
  const target = world.vehicles.find((v) => v.id === targetId);
  return target !== undefined && !isDefeated(target);
}

export function huntedCases(world: World, marshal: Vehicle, targetId: string): CrimeCase[] {
  return openCasesOn(world, targetId).filter((c) => c.hunter === marshal.id);
}

export function hunt(world: World, marshal: Vehicle, seen: Vehicle[]): void {
  const goal = pursuitOf(marshal);
  const cases = huntedCases(world, marshal, goal.targetId);
  if (cases.length === 0) return;
  if (lostPartner(world, marshal, goal.targetId)) return giveUp(world, marshal, cases);
  const lead = newLead(world, marshal, goal, seen, cases[0].lead);
  if (!lead) return trackLead(world, marshal, goal, cases);
  follow(world, goal, cases, lead);
  if (waitsToAsk(world, marshal, goal.targetId, cases, seen)) rideHomeUntil(world, marshal, cases, lastOffer(cases) + BOUNTY.offerGapTurns);
}

function waitsToAsk(world: World, marshal: Vehicle, targetId: string, cases: CrimeCase[], seen: Vehicle[]): boolean {
  if (!sighted(world, marshal, targetId, seen) || stateOf(world, 'bountyStop', marshal.id, targetId)) return false;
  return cases.some((c) => c.status === 'open') && world.turn - lastOffer(cases) < BOUNTY.offerGapTurns;
}

function sighted(world: World, marshal: Vehicle, targetId: string, seen: Vehicle[]): Vehicle | null {
  return seen.find((v) => v.id === targetId && canVehicleSee(world, marshal, v.pos)) ?? null;
}

function rideHomeUntil(world: World, marshal: Vehicle, cases: CrimeCase[], retryAt: number): void {
  dropHunt(world, cases, retryAt);
  finishGoal(world, marshal, 'backToPost');
}

function newLead(world: World, marshal: Vehicle, goal: NpcActivity & { targetId: string }, seen: Vehicle[], lead: CaseLead): CaseLead | null {
  const target = sighted(world, marshal, goal.targetId, seen);
  if (target) return contactLead(world, marshal, target);
  const told = askAround(world, marshal, goal, seen, lead);
  return told === lead ? null : told;
}

function lostPartner(world: World, leader: Vehicle, targetId: string): boolean {
  return targetNeed(world, targetId) === 'pair' && followersOf(world, leader.id, ['escort']).length === 0;
}

function posseOf(world: World, leader: Vehicle): Vehicle[] {
  return [leader, ...followersOf(world, leader.id, ['escort']).filter((v) => isMarshal(v) && !isDefeated(v))];
}

function trackLead(world: World, marshal: Vehicle, goal: NpcActivity, cases: CrimeCase[]): void {
  const lead = cases[0].lead;
  if (world.turn >= (goal.until ?? Infinity)) return giveUp(world, marshal, cases);
  if (dist(marshal.pos, lead.at) <= BOUNTY.leadReach) searchOn(world, goal, cases, lead);
}

function pursuitOf(marshal: Vehicle): NpcActivity & { targetId: string } {
  const goal = topGoal(marshal);
  if (goal?.kind !== 'pursue' || !goal.targetId) throw new Error(`${marshal.id} hunts with no pursue goal on top`);
  return goal as NpcActivity & { targetId: string };
}

function searchOn(world: World, goal: NpcActivity, cases: CrimeCase[], lead: CaseLead): void {
  const searched = searchLead(lead) ?? nextPad(lead.at);
  follow(world, goal, cases, { at: searched, turn: lead.turn, heading: null });
}

function nextPad(from: Vec): Vec {
  const pads = CRIME.reportSites.map((id) => nearestPad(getKnownSite(id), from)).filter((pad) => dist(pad, from) > BOUNTY.leadReach);
  pads.sort((a, b) => dist(a, from) - dist(b, from));
  if (!pads[0]) throw new Error('No reporting pad to search from');
  return { ...pads[0] };
}

function follow(world: World, goal: NpcActivity, cases: CrimeCase[], lead: CaseLead): void {
  if (lead.turn > cases[0].lead.turn) goal.until = world.turn + BOUNTY.huntTurns;
  leadCases(cases, lead);
  goal.destination = { ...lead.at };
}

function contactLead(world: World, marshal: Vehicle, target: Vehicle): CaseLead {
  demand(world, marshal, target);
  return { at: { ...target.pos }, turn: world.turn, heading: target.heading };
}

function askAround(world: World, marshal: Vehicle, goal: NpcActivity & { targetId: string }, seen: Vehicle[], lead: CaseLead): CaseLead {
  const asked = (goal.asked ??= []);
  const fresh = seen.filter((d) => d.brain !== null && d.id !== goal.targetId && !asked.includes(d.id));
  let best = lead;
  for (const driver of fresh) {
    asked.push(driver.id);
    best = askDriver(world, marshal, goal.targetId, driver, best);
  }
  return best;
}

function askDriver(world: World, marshal: Vehicle, targetId: string, driver: Vehicle, best: CaseLead): CaseLead {
  const sighting = sightingOf(driver, targetId);
  const newer = sighting !== null && sighting.turn > best.turn;
  world.events.push({ t: 'asked', by: marshal.id, of: driver.id, target: targetId, told: newer });
  return sighting !== null && newer ? { at: { ...sighting.fact.at }, turn: sighting.turn, heading: sighting.fact.heading } : best;
}

export function searchLead(lead: CaseLead): Vec | null {
  if (lead.heading === null) return null;
  const dir = { x: Math.cos(lead.heading), y: Math.sin(lead.heading) };
  const ahead = CRIME.reportSites.map((id) => rayTo(lead.at, dir, getKnownSite(id))).filter((r) => r.along > 0 && r.along <= BOUNTY.searchReach);
  ahead.sort((a, b) => a.off - b.off);
  return ahead[0] ? { ...nearestPad(ahead[0].site, lead.at) } : null;
}

function rayTo(from: Vec, dir: Vec, site: Site): { site: Site; along: number; off: number } {
  const rel = { x: site.pos.x - from.x, y: site.pos.y - from.y };
  return { site, along: rel.x * dir.x + rel.y * dir.y, off: Math.abs(rel.x * dir.y - rel.y * dir.x) };
}

function giveUp(world: World, marshal: Vehicle, cases: CrimeCase[]): void {
  dropHunt(world, cases);
  if (topGoal(marshal)?.kind === 'pursue') finishGoal(world, marshal, 'huntGaveUp');
}

export function outmatched(world: World, marshal: Vehicle, target: Vehicle): boolean {
  return wantsPeace(world, marshal, judgeDanger(world, marshal, target));
}

export function hunterOf(world: World, marshal: Vehicle): Vehicle | null {
  if (!isMarshal(marshal)) return null;
  if (holdsHunt(world, marshal)) return marshal;
  const leader = escortLeaderOf(world, marshal);
  return leader && isMarshal(leader) && holdsHunt(world, leader) ? leader : null;
}

function escortLeaderOf(world: World, follower: Vehicle): Vehicle | null {
  const held = followingOf(world, follower);
  return held?.kind === 'escort' ? vehicleById(world, held.other) : null;
}

function holdsHunt(world: World, marshal: Vehicle): boolean {
  return world.crimes.some((c) => c.status === 'open' && c.hunter === marshal.id);
}

export type Withdrawal = { hunter: Vehicle; target: Vehicle };

export function callsPartner(world: World, marshal: Vehicle): boolean {
  const withdrawal = withdrawsOnTruce(world, marshal, playerVehicle(world));
  return withdrawal !== null && targetNeed(world, withdrawal.target.id) === 'lone';
}

export function withdrawsOnTruce(world: World, a: Vehicle, b: Vehicle): Withdrawal | null {
  for (const [side, other] of [[a, b], [b, a]]) {
    const hunter = hunterOf(world, side);
    if (hunter && huntedCases(world, hunter, other.id).length > 0 && outmatched(world, hunter, other)) return { hunter, target: other };
  }
  return null;
}

function withdrawOnFlight(world: World, marshal: Vehicle, flight: NpcActivity): void {
  const hunter = hunterOf(world, marshal);
  const foe = world.vehicles.find((v) => v.id === flight.targetId);
  if (!hunter || !foe || huntedCases(world, hunter, foe.id).length === 0 || !outmatched(world, hunter, foe)) return;
  withdrawHunt(world, hunter, foe);
}

export function withdrawHunt(world: World, hunter: Vehicle, target: Vehicle): void {
  const cases = huntedCases(world, hunter, target.id);
  if (cases.length === 0) throw new Error(`${hunter.id} withdraws from no hunt on ${target.id}`);
  withdrawCases(cases);
  for (const s of followingStatesOf(world, hunter.id).filter((x) => x.kind === 'escort')) breakPair(world, vehicleById(world, s.holder), s);
  world.events.push({ t: 'huntWithdrawn', by: hunter.id, target: target.id, posse: targetNeed(world, target.id) === null ? 'spent' : 'pair' });
}

export function demandOpen(world: World, marshal: Vehicle, target: Vehicle): NpcState | null {
  const s = stateOf(world, 'bountyStop', marshal.id, target.id);
  return s && s.data.kind === 'bountyStop' && !s.data.answered ? s : null;
}

export function demand(world: World, marshal: Vehicle, target: Vehicle): void {
  if (stateOf(world, 'bountyStop', marshal.id, target.id)) return;
  const cases = openCasesOn(world, target.id);
  if (cases.length === 0 || world.turn - lastOffer(cases) < BOUNTY.offerGapTurns) return;
  const owed = owedBy(world, target.id);
  offerCases(world, cases);
  addState(world, 'bountyStop', marshal.id, target.id, { kind: 'bountyStop', owed, answered: false });
  if (target.brain) answerDemandAsNpc(world, marshal, target);
}

function answerDemandAsNpc(world: World, marshal: Vehicle, target: Vehicle): void {
  if (!anyOptionOpen(world, target, 'bountyDemanded', marshal.id)) return answerDemand(world, marshal, target, 'refuse');
  const choice = decide(world, target, 'bountyDemanded', marshal.id, null);
  if (choice === 'pay' && canPayBounty(world, target)) return answerDemand(world, marshal, target, 'pay');
  answerDemand(world, marshal, target, 'refuse');
  if (choice === 'flee') interrupt(world, target, fleeFrom(world, target, npcProfile(target), marshal.id, marshal.pos, 'escapeThreat'));
  else interrupt(world, target, fightGoal(world, target, marshal, 'fightBack'));
}

export function answerDemand(world: World, marshal: Vehicle, target: Vehicle, answer: DemandAnswer): void {
  const s = demandOpen(world, marshal, target);
  if (!s || s.data.kind !== 'bountyStop') throw new Error(`${marshal.id} holds no open demand on ${target.id}`);
  if (answer === 'pay') payBounty(world, target, openCasesOn(world, target.id), marshal);
  s.data = { ...s.data, answered: true };
  if (answer === 'pay') {
    endState(world, s, 'fulfilled');
    return truceWithPosse(world, posseOf(world, marshal), target);
  }
  endState(world, s, 'broken');
  refused(world, marshal, target);
}

function truceWithPosse(world: World, posse: readonly Vehicle[], target: Vehicle): void {
  for (const m of posse) addState(world, 'truce', m.id, target.id, { kind: 'none' });
  endLines(world);
}

export function refused(world: World, marshal: Vehicle, target: Vehicle): void {
  if (huntedCases(world, marshal, target.id).length === 0 || isDefeated(marshal)) return;
  for (const m of posseOf(world, marshal)) {
    declareFeud(world, m, target.id);
    if (m === marshal || canVehicleSee(world, m, target.pos)) interrupt(world, m, fightGoal(world, m, target, 'fightHostile'));
  }
}

export function demandLapsed(world: World, s: NpcState): void {
  if (s.data.kind !== 'bountyStop' || s.data.answered) return;
  const marshal = world.vehicles.find((v) => v.id === s.holder);
  const target = world.vehicles.find((v) => v.id === s.other);
  if (marshal && target) refused(world, marshal, target);
}

export function payHailedBounty(world: World, marshal: Vehicle, target: Vehicle): void {
  if (huntedCases(world, marshal, target.id).length === 0) throw new Error(`${marshal.id} hunts no case on ${target.id}`);
  const open = demandOpen(world, marshal, target);
  if (open) return answerDemand(world, marshal, target, 'pay');
  const posse = posseOf(world, marshal);
  payBounty(world, target, openCasesOn(world, target.id), marshal);
  truceWithPosse(world, posse, target);
}

const OFFENSE_ORDER: readonly CrimeOffense[] = ['killed', 'robbed', 'embezzled', 'attacked'];

export function hearTerms(world: World): CallVars {
  tellCases(openCasesOn(world, world.player.vehicleId));
  return bountyTerms(world);
}

export function bountyTerms(world: World): CallVars {
  const cases = openCasesOn(world, world.player.vehicleId);
  const worst = OFFENSE_ORDER.find((o) => cases.some((c) => c.offense === o)) ?? 'attacked';
  return { price: { kind: 'money', amount: owedBy(world, world.player.vehicleId) }, offense: { kind: 'line', line: OFFENSE_LINES[worst] } };
}
