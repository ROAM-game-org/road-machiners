import { BOUNTY, CRIME, SHOPS } from '../data/market';
import { BANDS, SITE_FACTIONS, STANDING } from '../data/npc-behavior';
import { goodValue } from './market';
import type { Vec } from './vec';
import { TIME } from '../data/time';
import { isDefeated } from './defeat';
import { shopMoney, transfer } from './economy';
import { recall, remember, reviseMemories } from './memory';
import { getKnownSite, tradeSpend } from './npc-decisions';
import { bandOf, favors, inTruce, isOrganized, isOutlaw, settleStanding, witnessesOf, type Incident } from './relations';
import { getResources } from './resources';
import { modeRules } from './settings';
import { canUseSite, parkedOn } from './sites';
import { boundTo } from './states';
import type { CaseIssuer, CaseLead, CrimeCase, Memory, Refusal, StandingFactionId, Vehicle, WitnessedOffense, World } from './types';
import { canVehicleSee } from './vision';
import { playerVehicle } from './damage';
import { vehicleHasPerk } from './progress';
import { newId } from './factory';
import { playerCommand, Refused } from './world';

type Witnessed = Extract<Memory['fact'], { kind: 'witnessed' }>;
const SHOP_IDS: ReadonlySet<string> = new Set(Object.keys(SHOPS));
type ClosedStatus = Exclude<CrimeCase['status'], 'open'>;

export function crimeOf(world: World, culprit: Vehicle, victim: Vehicle, offense: WitnessedOffense): boolean {
  if (!modeRules(world).bounties || !(offense in CRIME.fine)) return false;
  if (isOutlaw(culprit.faction) || isOutlaw(victim.faction)) return false;
  if (huntsAs(world, culprit, victim.id)) return false;
  return !foughtAnother(world, victim, culprit);
}

function huntsAs(world: World, hunter: Vehicle, targetId: string): boolean {
  const hunts = vehicleHasPerk(world, hunter, 'bountyHunter') && hunter.id !== targetId;
  return world.crimes.some((c) => c.status === 'open' && c.target === targetId && (hunts || c.hunter === hunter.id));
}

function foughtAnother(world: World, victim: Vehicle, culprit: Vehicle): boolean {
  return world.states.some((s) => s.kind === 'combat' && s.holder === victim.id && s.other !== culprit.id);
}

export function noteCrime(world: World, i: Incident, seen: Vehicle[]): void {
  recordCrime(world, i.aggressor, i.victim, i.deed, seen, true);
}

export function noteKilling(world: World, killer: Vehicle, victim: Vehicle): void {
  if (!modeRules(world).bounties || !victim.brain) return;
  if (!recall(victim, 'wronged').some((m) => m.fact.by === killer.id)) return;
  const seen = witnessesOf(world, { aggressor: killer, victim, deed: 'attacked', victimFights: false });
  recordCrime(world, killer, victim, 'killed', seen, false);
}

function recordCrime(world: World, culprit: Vehicle, victim: Vehicle, offense: WitnessedOffense, seen: Vehicle[], victimReports: boolean): void {
  requireInWorld(world, culprit);
  requireInWorld(world, victim);
  if (!crimeOf(world, culprit, victim, offense)) return;
  const reporters = [...(victimReports && namesCulprit(world, victim, culprit) ? [victim] : []), ...seen.filter((w) => willReport(world, w, culprit, victim))];
  const crime = `${world.turn}:${culprit.id}:${victim.id}:${offense}`;
  for (const r of reporters) remember(world, r, { kind: 'witnessed', crime, by: culprit.id, victim: victim.id, offense, at: { ...victim.pos }, heading: culprit.heading });
}

function requireInWorld(world: World, v: Vehicle): void {
  if (!world.vehicles.some((x) => x.id === v.id)) throw new Error(`Crime by or on ${v.id}, which is not in the world`);
}

function namesCulprit(world: World, victim: Vehicle, culprit: Vehicle): boolean {
  return victim.brain !== null && !isDefeated(victim) && canVehicleSee(world, victim, culprit.pos);
}

function willReport(world: World, w: Vehicle, culprit: Vehicle, victim: Vehicle): boolean {
  return canReport(w, victim) && !shields(world, w, culprit, victim);
}

function canReport(w: Vehicle, victim: Vehicle): boolean {
  return w.brain !== null && w.id !== victim.id && !isOutlaw(w.faction) && !isDefeated(w);
}

function shields(world: World, w: Vehicle, culprit: Vehicle, victim: Vehicle): boolean {
  return boundTo(world, w.id, culprit.id) || inTruce(world, w, culprit) || favors(world, w, culprit, victim);
}

export function forgetCrimesBy(witness: Vehicle, culpritId: string): void {
  if (!witness.brain || !witness.brain.memories.some((m) => m.fact.kind === 'witnessed' && m.fact.by === culpritId)) return;
  reviseMemories(witness, (m) => (m.fact.kind === 'witnessed' && m.fact.by === culpritId ? null : m));
}

export function fileReports(world: World, driver: Vehicle): void {
  if (!driver.brain || !driver.brain.memories.some((m) => m.fact.kind === 'witnessed')) return;
  const site = reportSiteUnder(driver);
  if (!site) return;
  const held = recall(driver, 'witnessed').map((m) => m.fact);
  for (const fact of held) fileCrime(world, driver, fact, site);
  reviseMemories(driver, (m) => (m.fact.kind === 'witnessed' ? null : m));
}

function reportSiteUnder(driver: Vehicle): string | null {
  return CRIME.reportSites.find((id) => parkedOn(driver, getKnownSite(id))) ?? null;
}

function fileCrime(world: World, reporter: Vehicle, fact: Witnessed, site: string): void {
  const known = world.crimes.find((c) => c.crime === fact.crime);
  if (known) return addReporter(known, reporter);
  const target = world.vehicles.find((v) => v.id === fact.by);
  if (target) openCase(world, reporter, fact, site, target);
}

function addReporter(c: CrimeCase, reporter: Vehicle): void {
  if (!c.reporters.includes(reporter.id)) c.reporters.push(reporter.id);
}

function openCase(world: World, reporter: Vehicle, fact: Witnessed, site: string, target: Vehicle): void {
  const victim = world.vehicles.find((v) => v.id === fact.victim) ?? null;
  const issuer = issuerOf(victim, reporter);
  const stake = Math.min(stakeOf(world, issuer, reporter, fact.offense), CRIME.maxOwed - owedBy(world, target.id));
  if (stake < CRIME.minStake) return;
  const escrow = issuer.kind === 'driver' ? stake : 0;
  if (escrow > 0) shopMoney(world, reporter, -escrow, 'bountyEscrow');
  const c: CrimeCase = {
    id: newId(world, 'case'), crime: fact.crime, offense: fact.offense, target: target.id, victim: fact.victim, issuer,
    reporters: [reporter.id], site, at: { ...fact.at }, turn: crimeTurn(fact.crime), filed: world.turn, owed: stake, escrow,
    status: 'open', closed: null, hunter: null, retryAt: null, offered: null, lead: { at: { ...fact.at }, turn: crimeTurn(fact.crime), heading: fact.heading },
  };
  world.crimes = [...world.crimes, c];
  world.events.push({ t: 'bountyFiled', case: c.id, target: c.target, reporter: reporter.id, offense: c.offense, victim: c.victim, site, owed: c.owed });
}

export function fileEmbezzlement(world: World, shopId: string, crates: number, good: string, at: Vec): void {
  if (!SHOP_IDS.has(shopId)) throw new Error(`${shopId} is not a shop that can post a bounty`);
  if (!Number.isInteger(crates) || crates <= 0) throw new Error(`An embezzlement needs crates kept, got ${crates}`);
  if (!modeRules(world).bounties) return;
  const target = playerVehicle(world);
  const owed = Math.min(crates * goodValue(good), CRIME.maxOwed - owedBy(world, target.id));
  if (owed < CRIME.minStake) return;
  const turn = world.turn;
  const c: CrimeCase = {
    id: newId(world, 'case'), crime: `${turn}:${target.id}:${shopId}:embezzled`, offense: 'embezzled', target: target.id, victim: shopId, issuer: shopIssuer(shopId),
    reporters: [], site: shopId, at: { ...at }, turn, filed: turn, owed, escrow: 0,
    status: 'open', closed: null, hunter: null, retryAt: null, offered: null, lead: { at: { ...at }, turn, heading: null },
  };
  world.crimes = [...world.crimes, c];
  world.events.push({ t: 'bountyFiled', case: c.id, target: c.target, reporter: shopId, offense: c.offense, victim: shopId, site: shopId, owed, kept: { good, crates } });
}

function shopIssuer(shopId: string): CaseIssuer {
  const faction = SITE_FACTIONS[shopId];
  return faction && isOrganized(faction) && !isOutlaw(faction) ? { kind: 'faction', faction } : { kind: 'shop', shop: shopId };
}

function crimeTurn(crime: string): number {
  const turn = Number(crime.split(':')[0]);
  if (!Number.isInteger(turn)) throw new Error(`Crime ${crime} names no turn`);
  return turn;
}

function issuerOf(victim: Vehicle | null, reporter: Vehicle): CaseIssuer {
  for (const faction of [victim?.faction, reporter.faction]) {
    if (faction && isOrganized(faction) && !isOutlaw(faction)) return { kind: 'faction', faction };
  }
  return { kind: 'driver', id: reporter.id };
}

export function stakeOf(world: World, issuer: CaseIssuer, reporter: Vehicle, offense: WitnessedOffense): number {
  const fine = CRIME.fine[offense];
  if (issuer.kind !== 'driver') return fine;
  return Math.max(0, Math.floor(Math.min(fine, CRIME.purseShare * tradeSpend(world, reporter))));
}

export function openCasesOn(world: World, targetId: string): CrimeCase[] {
  return world.crimes.filter((c) => c.status === 'open' && c.target === targetId);
}

export function owedBy(world: World, targetId: string): number {
  return openCasesOn(world, targetId).reduce((sum, c) => sum + c.owed, 0);
}

export function canPayBounty(world: World, payer: Vehicle): boolean {
  const owed = owedBy(world, payer.id);
  return owed > 0 && getResources(world, payer).money >= owed;
}

export function payBounty(world: World, payer: Vehicle, cases: CrimeCase[], collector: Vehicle | null): void {
  const total = cases.reduce((sum, c) => sum + c.owed, 0);
  if (getResources(world, payer).money < total) {
    if (payer.id === world.player.vehicleId) throw new Refused({ id: 'noMoney' });
    throw new Error(`${payer.id} cannot pay ${total} of bounty`);
  }
  for (const c of cases) {
    if (c.target !== payer.id) throw new Error(`${payer.id} pays case ${c.id} on ${c.target}`);
    const fee = Math.round(c.owed * CRIME.feeShare);
    if (collector) transfer(world, payer, collector, fee);
    else shopMoney(world, payer, -fee, 'bountyOffice');
    payIssuer(world, payer, c, c.owed - fee);
    returnEscrow(world, c);
    closeCase(world, c, 'paid');
  }
}

function payIssuer(world: World, payer: Vehicle, c: CrimeCase, amount: number): void {
  const issuer = issuerVehicle(world, c);
  if (issuer && issuer.id !== payer.id) transfer(world, payer, issuer, amount);
  else shopMoney(world, payer, -amount, 'bountyCoffers');
}

function returnEscrow(world: World, c: CrimeCase): void {
  const issuer = issuerVehicle(world, c);
  if (c.escrow > 0 && issuer) shopMoney(world, issuer, c.escrow, 'bountyEscrow');
}

function issuerVehicle(world: World, c: CrimeCase): Vehicle | null {
  if (c.issuer.kind !== 'driver') return null;
  const id = c.issuer.id;
  return world.vehicles.find((v) => v.id === id) ?? null;
}

export function collectBounty(world: World, hunter: Vehicle, target: Vehicle): void {
  for (const c of openCasesOn(world, target.id)) {
    const paid = c.issuer.kind === 'driver' ? c.escrow : c.owed;
    shopMoney(world, hunter, paid, c.issuer.kind === 'driver' ? 'bountyEscrow' : 'bountyFund');
    closeCase(world, c, 'collected', { collector: hunter.id, amount: paid });
  }
}

export function closeCase(world: World, c: CrimeCase, how: ClosedStatus, closing: { collector: string | null; amount: number } = { collector: null, amount: c.owed }): void {
  if (c.status !== 'open') throw new Error(`Case ${c.id} is already ${c.status}`);
  c.status = how;
  c.closed = world.turn;
  c.hunter = null;
  world.events.push({ t: 'bountyClosed', case: c.id, target: c.target, status: how, amount: closing.amount, collector: closing.collector });
}

export function noteKnockout(world: World, beaten: Vehicle): void {
  const by = world.vehicles.find((v) => v.id === beaten.lastHitBy);
  if (!by || by.id === beaten.id) return;
  forgetCrimesBy(beaten, by.id);
  if (huntsAs(world, by, beaten.id)) collectBounty(world, by, beaten);
}

export function takeHunt(world: World, targetId: string, hunterId: string): CrimeCase {
  const cases = openCasesOn(world, targetId);
  if (cases.length === 0) throw new Error(`No open case on ${targetId} to hunt`);
  for (const c of cases) c.hunter = hunterId;
  return cases[0];
}

export function offerCases(world: World, cases: CrimeCase[]): void {
  for (const c of cases) c.offered = world.turn;
}

export function lastOffer(cases: CrimeCase[]): number {
  return Math.max(-Infinity, ...cases.map((c) => c.offered ?? -Infinity));
}

export function leadCases(cases: CrimeCase[], lead: CaseLead): void {
  for (const c of cases) c.lead = { ...lead, at: { ...lead.at } };
}

export function dropHunt(world: World, cases: CrimeCase[]): void {
  for (const c of cases.filter((x) => x.status === 'open')) {
    c.hunter = null;
    c.retryAt = world.turn + BOUNTY.retryTurns;
  }
}

export function huntedBy(world: World, targetId: string): string | null {
  return openCasesOn(world, targetId).find((c) => c.hunter !== null)?.hunter ?? null;
}

export function advanceCrimes(world: World): void {
  if (world.crimes.length === 0) return;
  const open = world.crimes.filter((x) => x.status === 'open');
  if (open.length > 0) {
    const alive = new Set(world.vehicles.map((v) => v.id));
    for (const c of open) ageCase(world, c, alive);
  }
  const kept = world.crimes.filter((c) => c.closed === null || world.turn - c.closed < CRIME.keepClosedTurns);
  if (kept.length !== world.crimes.length) world.crimes = kept;
}

function ageCase(world: World, c: CrimeCase, alive: ReadonlySet<string>): void {
  if (c.hunter !== null && !huntsOn(world, c.hunter, c.target)) c.hunter = null;
  if (world.turn - c.filed < BOUNTY.lapseTurns && alive.has(c.target)) return;
  returnEscrow(world, c);
  closeCase(world, c, 'lapsed');
}

function huntsOn(world: World, hunterId: string, targetId: string): boolean {
  const hunter = world.vehicles.find((v) => v.id === hunterId);
  return hunter !== undefined && !isDefeated(hunter) && hunter.brain !== null && hunter.brain.goals.some((g) => g.kind === 'pursue' && g.targetId === targetId);
}

export function deskNear(world: World): string | null {
  if (!modeRules(world).bounties) return null;
  const me = world.vehicles.find((v) => v.id === world.player.vehicleId);
  return me && canUseSite(me.pos, getKnownSite(CRIME.post)) ? CRIME.post : null;
}

export function deskAt(world: World): string | null {
  if (!modeRules(world).bounties) return null;
  const me = world.vehicles.find((v) => v.id === world.player.vehicleId);
  return me && parkedOn(me, getKnownSite(CRIME.post)) ? CRIME.post : null;
}

export type SettlementQuote = { faction: StandingFactionId; price: number; refusal: Refusal | null };
export type DeskRows = { cases: CrimeCase[]; owed: number; settlements: SettlementQuote[] };

export function deskRows(world: World): DeskRows {
  const cases = openCasesOn(world, world.player.vehicleId);
  const settlements = settleable(world).flatMap((faction) => settlementQuote(world, faction) ?? []);
  return { cases, owed: cases.reduce((sum, c) => sum + c.owed, 0), settlements };
}

function settleable(world: World): StandingFactionId[] {
  return (Object.keys(world.player.standing) as StandingFactionId[]).filter((f) => f !== 'marshals' && !isOutlaw(f));
}

export function settlePrice(standing: number): number {
  const days = (BANDS.hostile + 1 - standing) / STANDING.dailyDrift;
  return Math.round(days * TIME.turnsPerDay * CRIME.wage * CRIME.settleWage);
}

export function settlementQuote(world: World, faction: StandingFactionId): SettlementQuote | null {
  if (faction === 'marshals' || isOutlaw(faction)) return null;
  const standing = world.player.standing[faction];
  if (bandOf(standing) !== 'hostile') return null;
  const price = settlePrice(standing);
  return { faction, price, refusal: settleRefusal(world, faction, price) };
}

function settleRefusal(world: World, faction: StandingFactionId, price: number): Refusal | null {
  if (!deskAt(world)) return { id: 'notAtDesk' };
  if (openCasesOn(world, world.player.vehicleId).some((c) => c.issuer.kind === 'faction' && c.issuer.faction === faction)) return { id: 'payBountiesFirst', faction };
  return world.player.money < price ? { id: 'noMoney' } : null;
}

export function settle(world: World, faction: StandingFactionId): void {
  const quote = settlementQuote(world, faction);
  if (!quote) throw new Error(`No settlement with ${faction} to make`);
  if (quote.refusal) throw new Error(`Settlement with ${faction} refused: ${quote.refusal.id}`);
  shopMoney(world, playerVehicle(world), -quote.price, 'bountyCoffers');
  settleStanding(world, faction);
  world.events.push({ t: 'settlement', faction, price: quote.price });
}

export function payCasesAtDesk(world: World, ids: string[]): void {
  if (!deskAt(world)) throw new Error('The Marshalls desk is not here');
  const mine = openCasesOn(world, world.player.vehicleId);
  const cases = [...new Set(ids)].map((id) => {
    const c = mine.find((x) => x.id === id);
    if (!c) throw new Error(`No open case ${id} on the player`);
    return c;
  });
  payBounty(world, playerVehicle(world), cases, null);
}

export function payAtDesk(world: World, ids: string[]): World {
  return playerCommand(world, (w) => payCasesAtDesk(w, ids));
}

export function settleAtDesk(world: World, faction: StandingFactionId): World {
  return playerCommand(world, (w) => settle(w, faction));
}
