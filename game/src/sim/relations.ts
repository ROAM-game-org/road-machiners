import {
  ATTITUDE, BANDS, DEEDS, FACTIONS, INTERVENE, LAW_CAP, PERSONAL, PERSONAL_RANGE, SCORE_LIMIT, SITE_FACTIONS, STANDING,
  STANDING_DELTA, STANDING_FACTION_IDS, startStanding, type Band, type FactionDef,
} from '../data/npc-behavior';
import { NPCS, type NpcTemplate } from '../data/npcs';
import { workDayOf } from '../data/time';
import { isDefeated } from './defeat';
import { hasLoot } from './grid';
import { chance } from './rng';
import { boundTo, declareFeud, stateOf } from './states';
import { isStranded } from './stats';
import { followersOf } from './companies';
import { recall, remember } from './memory';
import { modeRules } from './settings';
import type { DeedId, Faction, StandingCause, HelpDeed, MemoryFact, NpcFactionId, StandingFactionId, Vehicle, World, WrongDeed } from './types';
import { dist } from './vec';
import { canVehicleSee } from './vision';
import { noteSunwardDefeat } from './sunward';
import { noteCrime, noteKilling } from './crime';

export function isOutlaw(faction: Faction): boolean {
  return faction !== 'player' && factionDef(faction).outlaw;
}

export function isOrganized(faction: Faction): faction is StandingFactionId {
  return faction !== 'player' && factionDef(faction).organized;
}

function factionDef(faction: NpcFactionId): FactionDef {
  const def = FACTIONS[faction];
  if (!def) throw new Error(`Unknown faction ${faction}`);
  return def;
}

export function isRaider(v: Vehicle): boolean {
  return v.brain ? v.brain.traits.includes('raider') : isOutlaw(v.faction);
}

export function isLawman(v: Vehicle): boolean {
  return v.brain?.traits.includes('lawman') === true;
}

export function inFeud(world: World, a: Vehicle, b: Vehicle): boolean {
  return stateOf(world, 'feud', a.id, b.id) !== null || stateOf(world, 'feud', b.id, a.id) !== null;
}

export function inTruce(world: World, a: Vehicle, b: Vehicle): boolean {
  return stateOf(world, 'truce', a.id, b.id) !== null || stateOf(world, 'truce', b.id, a.id) !== null;
}

export type Incident = { aggressor: Vehicle; victim: Vehicle; deed: Exclude<WrongDeed, 'stole'>; victimFights: boolean };

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

export function attitude(world: World, a: Vehicle, b: Vehicle): number {
  const holder = npcHolder(a);
  if (inFeud(world, a, b)) return -SCORE_LIMIT;
  const score = clamp(factionTerm(world, holder, b) + personalTerm(a, b.id), -SCORE_LIMIT, SCORE_LIMIT);
  if (inTruce(world, a, b)) return clamp(score, BANDS.unfriendly + 1, 0);
  return isLawman(a) && isOutlaw(b.faction) ? Math.min(score, LAW_CAP) : score;
}

function npcHolder(a: Vehicle): NpcFactionId {
  if (a.faction === 'player') throw new Error(`${a.id} is on the player's side, which decides by acting and holds no attitude`);
  factionDef(a.faction);
  return a.faction;
}

function factionTerm(world: World, holder: NpcFactionId, b: Vehicle): number {
  if (b.faction !== 'player') return factionRow(holder)[npcHolder(b)];
  return isOrganized(holder) ? world.player.standing[holder] : factionRow(holder).independent;
}

function factionRow(id: NpcFactionId): Record<NpcFactionId, number> {
  const row = ATTITUDE[id];
  if (!row) throw new Error(`No attitude row for faction ${id}`);
  return row;
}

export function personalTerm(holder: Vehicle, otherId: string): number {
  if (!holder.brain) return 0;
  let sum = 0;
  for (const m of holder.brain.memories) {
    if ((m.fact.kind === 'wronged' || m.fact.kind === 'helped') && m.fact.by === otherId) sum += PERSONAL[m.fact.deed];
  }
  return clamp(sum, PERSONAL_RANGE.min, PERSONAL_RANGE.max);
}

export function bandOf(score: number): Band {
  if (score <= BANDS.hostile) return 'hostile';
  if (score <= BANDS.unfriendly) return 'unfriendly';
  if (score < BANDS.friendly) return 'neutral';
  return score < BANDS.allied ? 'friendly' : 'allied';
}

const BAND_ORDER: readonly Band[] = ['hostile', 'unfriendly', 'neutral', 'friendly', 'allied'];

export function bandAtLeast(band: Band, floor: Band): boolean {
  return BAND_ORDER.indexOf(band) >= BAND_ORDER.indexOf(floor);
}

export function bandToward(world: World, a: Vehicle, b: Vehicle): Band {
  return bandOf(attitude(world, a, b));
}

function judges(a: Vehicle): boolean {
  return a.faction !== 'player';
}

export function attacks(world: World, a: Vehicle, b: Vehicle): boolean {
  return judges(a) && bandToward(world, a, b) === 'hostile';
}

export function hostileFrom(world: World, a: Vehicle, b: Vehicle): boolean {
  if (!judges(a)) return false;
  const band = bandToward(world, a, b);
  return band === 'hostile' || (isRaider(a) && band === 'unfriendly' && hasLoot(b));
}

export function huntsAsPrey(world: World, a: Vehicle, b: Vehicle): boolean {
  return judges(a) && isRaider(a) && !bandAtLeast(bandToward(world, a, b), 'neutral');
}

export function isAlly(world: World, a: Vehicle, b: Vehicle): boolean {
  if (boundTo(world, a.id, b.id)) return true;
  return judges(a) && bandToward(world, a, b) === 'allied';
}

export function stanceToward(world: World, npc: Vehicle): Band {
  const player = world.vehicles.find((v) => v.id === world.player.vehicleId);
  if (!player) throw new Error('The player truck is gone');
  if (npc.id === player.id) throw new Error('The player holds no stance toward itself');
  return bandToward(world, npc, player);
}

export type StandingRow = { faction: StandingFactionId; score: number; band: Band };

export function standingBands(world: World): StandingRow[] {
  const joinable = (joinableCache ??= joinableFactions());
  return STANDING_FACTION_IDS.filter((id) => joinable.has(id)).map((id) => {
    const score = world.player.standing[id];
    return { faction: id, score, band: bandOf(score) };
  });
}

export type StandingDeedPart = { deed: DeedId; delta: number };

export function standingParts(world: World, row: StandingRow): { base: number; deeds: StandingDeedPart[]; earlier: number } {
  const base = startStanding()[row.faction];
  const deeds: StandingDeedPart[] = [];
  for (const d of world.player.deeds) {
    if (d.faction !== row.faction) continue;
    const part = deeds.find((p) => p.deed === d.deed);
    if (part) part.delta += d.delta;
    else deeds.push({ deed: d.deed, delta: d.delta });
  }
  const recent = deeds.reduce((sum, p) => sum + p.delta, 0);
  return { base, deeds, earlier: row.score - base - recent };
}

let joinableCache: Set<NpcFactionId> | null = null;

function joinableFactions(): Set<NpcFactionId> {
  const ids = Object.values(NPCS).flatMap(templateFactions);
  return new Set([...ids, ...Object.values(SITE_FACTIONS).filter((id): id is NpcFactionId => id !== undefined)]);
}

function templateFactions(tpl: NpcTemplate): NpcFactionId[] {
  const rule = tpl.allegiance;
  if (rule.kind === 'fixed') return [rule.faction];
  return rule.kind === 'town' ? ['independent'] : [rule.fallback];
}

export function witnessesOf(world: World, i: Incident): Vehicle[] {
  return world.vehicles.filter((v) => v.id !== i.aggressor.id && v.id !== i.victim.id && judges(v)
    && canVehicleSee(world, v, i.aggressor.pos) && canVehicleSee(world, v, i.victim.pos));
}

function escortsWhoSee(world: World, i: Incident): Vehicle[] {
  return followersOf(world, i.victim.id).filter((v) => v.id !== i.aggressor.id && judges(v) && canVehicleSee(world, v, i.aggressor.pos));
}

export function reportIncident(world: World, i: Incident): Vehicle[] {
  const seen = witnessesOf(world, i);
  const escorts = escortsWhoSee(world, i);
  const willing = [
    ...(judges(i.victim) && i.victimFights ? [i.victim] : []),
    ...escorts,
    ...seen.filter((w) => !escorts.includes(w) && willsToStepIn(world, w, i)),
  ];
  for (const w of willing) joinAgainst(world, w, i);
  noteDeed(world, i.aggressor, i.victim, i.deed, isAttributed(world, i, seen));
  noteCrime(world, i, seen);
  return willing;
}

function willsToStepIn(world: World, w: Vehicle, i: Incident): boolean {
  if (isRestrained(world, w, i.aggressor) || favors(world, w, i.aggressor, i.victim)) return false;
  if (answersLawCall(w, i.victim)) return true;
  return dist(w.pos, i.victim.pos) <= INTERVENE.range && defendsByBand(world, bandToward(world, w, i.victim));
}

function answersLawCall(w: Vehicle, victim: Vehicle): boolean {
  return isLawman(w) && judges(victim) && !isOutlaw(victim.faction);
}

function defendsByBand(world: World, band: Band): boolean {
  if (band === 'allied') return true;
  return band === 'friendly' && chance(world, INTERVENE.friendly);
}

export function isRestrained(world: World, w: Vehicle, aggressor: Vehicle): boolean {
  return isDefeated(w) || isStranded(world, w) || boundTo(world, w.id, aggressor.id) || inTruce(world, w, aggressor);
}

export function favors(world: World, w: Vehicle, aggressor: Vehicle, victim: Vehicle): boolean {
  return !isLawman(w) && w.brain?.traits.includes('marshal') !== true && attitude(world, w, aggressor) >= attitude(world, w, victim);
}

export function sideAgainst(world: World, w: Vehicle, aggressorId: string): boolean {
  if (stateOf(world, 'feud', w.id, aggressorId)) return false;
  declareFeud(world, w, aggressorId);
  return true;
}

function joinAgainst(world: World, w: Vehicle, i: Incident): void {
  if (!sideAgainst(world, w, i.aggressor.id)) return;
  const player = world.player.vehicleId;
  if (w.id !== i.victim.id && (i.aggressor.id === player || i.victim.id === player)) world.events.push({ t: 'joins', vehicle: w.id, against: i.aggressor.id, victim: i.victim.id });
}

function wrongedLawfulFoe(caller: Vehicle, foes: Vehicle[]): boolean {
  return foes.some((foe) => judges(foe) && !isOutlaw(foe.faction) && foe.brain !== null
    && recall(foe, 'wronged').some((m) => m.fact.by === caller.id));
}

export function lawCalls(helper: Vehicle, caller: Vehicle, foes: Vehicle[]): boolean {
  return isLawman(helper) && !wrongedLawfulFoe(caller, foes);
}

export function heedsCall(world: World, helper: Vehicle, caller: Vehicle, foes: Vehicle[]): boolean {
  if (isOutlaw(helper.faction) || !bandAtLeast(bandToward(world, helper, caller), 'neutral')) return false;
  if (isLawman(helper) && wrongedLawfulFoe(caller, foes)) return false;
  return foes.every((foe) => !isRestrained(world, helper, foe) && !favors(world, helper, foe, caller));
}

function isAttributed(world: World, i: Incident, seen: Vehicle[]): boolean {
  if (canVehicleSee(world, i.victim, i.aggressor.pos)) return true;
  return seen.some((w) => isLawman(w) || isAlly(world, w, i.victim));
}

export function noteDeed(world: World, actor: Vehicle, subject: Vehicle, deed: DeedId, seen: boolean): void {
  if (subject.brain && isPersonal(deed)) remember(world, subject, personalFact(actor, deed));
  if (seen && actor.id === world.player.vehicleId && isOrganized(subject.faction)) shiftStanding(world, subject.id, subject.faction, deed);
}

function isPersonal(deed: DeedId): deed is WrongDeed | HelpDeed {
  return deed in PERSONAL;
}

function personalFact(actor: Vehicle, deed: WrongDeed | HelpDeed): MemoryFact {
  return isWrong(deed) ? { kind: 'wronged', by: actor.id, deed } : { kind: 'helped', by: actor.id, deed };
}

function isWrong(deed: WrongDeed | HelpDeed): deed is WrongDeed {
  return PERSONAL[deed] < 0;
}

export function noteContractDeed(world: World, contractId: string, faction: Faction, deed: 'contract' | 'failedContract'): void {
  if (isOrganized(faction)) shiftStanding(world, contractId, faction, deed);
}

function shiftStanding(world: World, subject: string, faction: StandingFactionId, deed: DeedId): void {
  if (!modeRules(world).standing || repeats(world, subject, deed)) return;
  const delta = allowedDelta(world, faction, STANDING_DELTA[deed]);
  if (delta === 0) return;
  world.player.deeds.push({ subject, faction, deed, delta, turn: world.turn });
  setStanding(world, faction, world.player.standing[faction] + delta, { kind: 'deed', deed });
}

function repeats(world: World, subject: string, deed: DeedId): boolean {
  return world.player.deeds.some((d) => d.subject === subject && d.deed === deed && world.turn - d.turn < DEEDS.repeatTurns);
}

function allowedDelta(world: World, faction: StandingFactionId, delta: number): number {
  if (delta <= 0) return delta;
  const day = workDayOf(world.turn);
  const gained = world.player.deeds.filter((d) => d.faction === faction && d.delta > 0 && workDayOf(d.turn) === day).reduce((sum, d) => sum + d.delta, 0);
  return Math.max(0, Math.min(delta, STANDING.dailyGainCap - gained));
}

function setStanding(world: World, faction: StandingFactionId, score: number, cause: StandingCause): void {
  const before = bandOf(world.player.standing[faction]);
  world.player.standing[faction] = clamp(Math.round(score), -SCORE_LIMIT, SCORE_LIMIT);
  const band = bandOf(world.player.standing[faction]);
  if (band !== before) world.events.push({ t: 'standing', faction, band, cause });
}

export function settleStanding(world: World, faction: StandingFactionId): void {
  if (bandOf(world.player.standing[faction]) !== 'hostile') throw new Error(`${faction} does not hold the player hostile, so there is nothing to settle`);
  setStanding(world, faction, BANDS.hostile + 1, { kind: 'settled' });
}

export function driftStanding(world: World): void {
  if (workDayOf(world.turn) === workDayOf(world.turn - 1)) return;
  const start = startStanding();
  for (const id of STANDING_FACTION_IDS) {
    const now = world.player.standing[id];
    const step = clamp(start[id] - now, -STANDING.dailyDrift, STANDING.dailyDrift);
    if (step !== 0) setStanding(world, id, now + step, { kind: 'drift', toward: step > 0 ? 'up' : 'down' });
  }
  const fresh = world.player.deeds.filter((d) => world.turn - d.turn < DEEDS.repeatTurns);
  if (fresh.length !== world.player.deeds.length) world.player.deeds = fresh;
}

export function noteDefeat(world: World, beaten: Vehicle, wrecked: boolean): void {
  const actor = world.vehicles.find((v) => v.id === beaten.lastHitBy);
  if (!actor || actor.id === beaten.id) return;
  noteSunwardDefeat(world, beaten, actor);
  for (const subject of defendedBy(world, beaten, actor)) noteDeed(world, actor, subject, 'defended', canVehicleSee(world, subject, actor.pos));
  if (wrecked) noteWreck(world, actor, beaten);
}

function noteWreck(world: World, actor: Vehicle, beaten: Vehicle): void {
  if (wrongedBefore(world, actor, beaten)) noteDeed(world, actor, beaten, 'killed', true);
  noteKilling(world, actor, beaten);
}

function defendedBy(world: World, beaten: Vehicle, actor: Vehicle): Vehicle[] {
  const fought = new Set(world.states.filter((s) => s.kind === 'combat' && s.holder === beaten.id).map((s) => s.other));
  return world.vehicles.filter((v) => fought.has(v.id) && v.id !== actor.id && stateOf(world, 'combat', v.id, actor.id) === null && !foughtBack(world, beaten, v));
}

function foughtBack(world: World, beaten: Vehicle, subject: Vehicle): boolean {
  if (recall(beaten, 'wronged').some((m) => m.fact.by === subject.id)) return true;
  const theirs = stateOf(world, 'combat', subject.id, beaten.id);
  const mine = stateOf(world, 'combat', beaten.id, subject.id);
  return theirs !== null && mine !== null && theirs.born <= mine.born;
}

function wrongedBefore(world: World, actor: Vehicle, beaten: Vehicle): boolean {
  if (actor.id !== world.player.vehicleId) return false;
  return world.player.deeds.some((d) => d.subject === beaten.id && (d.deed === 'attacked' || d.deed === 'robbed') && world.turn - d.turn < DEEDS.repeatTurns);
}
