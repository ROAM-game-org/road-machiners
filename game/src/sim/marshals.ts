import { BOUNTY, CRIME } from '../data/market';
import { OFFENSE_LINES } from '../data/personalities';
import { getKnownSite, decide, npcProfile } from './npc-decisions';
import { createActivity, finishGoal, fightGoal, fleeFrom, interrupt, pushGoal, topGoal } from './npc-activities';
import { canPayBounty, dropHunt, lastOffer, leadCases, offerCases, openCasesOn, owedBy, payBounty, takeHunt } from './crime';
import { isDefeated } from './defeat';
import { endLines } from './harpoon';
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

export function planMarshal(world: World, marshal: Vehicle, seen: Vehicle[]): void {
  const top = topGoal(marshal);
  if (top?.kind === 'pursue') return hunt(world, marshal, seen);
  if (!top || waitsAtPost(top)) planAtPost(world, marshal, top, seen);
}

function planAtPost(world: World, marshal: Vehicle, top: NpcActivity | null, seen: Vehicle[]): void {
  const c = takeCase(world, marshal);
  if (c) return startHunt(world, marshal, c, seen);
  if (!top) pushGoal(world, marshal, postGoal(world, marshal));
}

function waitsAtPost(goal: NpcActivity): boolean {
  return goal.kind === 'wait' && goal.reason === 'atPost';
}

function startHunt(world: World, marshal: Vehicle, c: CrimeCase, seen: Vehicle[]): void {
  if (topGoal(marshal)) finishGoal(world, marshal, 'bountyHunt');
  pushGoal(world, marshal, pursueGoal(world, c));
  hunt(world, marshal, seen);
}

function postGoal(world: World, marshal: Vehicle): NpcActivity {
  const post = getKnownSite(CRIME.post);
  return { ...createActivity('wait', post.id, lieUpSpot(world, marshal, post), 'atPost'), until: world.turn + BOUNTY.postTurns };
}

function pursueGoal(world: World, c: CrimeCase): NpcActivity {
  return { ...createActivity('pursue', c.target, { ...c.lead.at }, 'bountyHunt'), until: world.turn + BOUNTY.huntTurns, asked: [] };
}

export function takeCase(world: World, marshal: Vehicle): CrimeCase | null {
  if (!modeRules(world).bounties) return null;
  const pick = rankedTargets(world, marshal)[0];
  return pick ? takeHunt(world, pick, marshal.id) : null;
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
  const lead = newLead(world, marshal, goal, seen, cases[0].lead);
  if (lead) follow(world, goal, cases, lead);
  else trackLead(world, marshal, goal, cases);
}

function newLead(world: World, marshal: Vehicle, goal: NpcActivity & { targetId: string }, seen: Vehicle[], lead: CaseLead): CaseLead | null {
  const target = seen.find((v) => v.id === goal.targetId && canVehicleSee(world, marshal, v.pos));
  if (target) return contactLead(world, marshal, target);
  const told = askAround(world, marshal, goal, seen, lead);
  return told === lead ? null : told;
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
    truceWith(world, marshal, target);
    return;
  }
  endState(world, s, 'broken');
  refused(world, marshal, target);
}

export function refused(world: World, marshal: Vehicle, target: Vehicle): void {
  if (huntedCases(world, marshal, target.id).length === 0 || isDefeated(marshal)) return;
  declareFeud(world, marshal, target.id);
  interrupt(world, marshal, fightGoal(world, marshal, target, 'fightHostile'));
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
  payBounty(world, target, openCasesOn(world, target.id), marshal);
  truceWith(world, marshal, target);
}

function truceWith(world: World, marshal: Vehicle, target: Vehicle): void {
  addState(world, 'truce', marshal.id, target.id, { kind: 'none' });
  endLines(world);
}

const OFFENSE_ORDER: readonly CrimeOffense[] = ['killed', 'robbed', 'attacked'];

export function bountyTerms(world: World): CallVars {
  const cases = openCasesOn(world, world.player.vehicleId);
  const worst = OFFENSE_ORDER.find((o) => cases.some((c) => c.offense === o)) ?? 'attacked';
  return { price: { kind: 'money', amount: owedBy(world, world.player.vehicleId) }, offense: { kind: 'line', line: OFFENSE_LINES[worst] } };
}
