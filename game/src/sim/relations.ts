import {
  ATTITUDE, BANDS, FACTIONS, LAW_CAP, PERSONAL, PERSONAL_RANGE, SCORE_LIMIT, SITE_FACTIONS, STANDING_FACTION_IDS,
  type Band, type FactionDef,
} from '../data/npc-behavior';
import { NPCS, type NpcTemplate } from '../data/npcs';
import { hasLoot } from './grid';
import { boundTo, stateOf } from './states';
import type { Faction, NpcFactionId, StandingFactionId, Vehicle, World } from './types';

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
  return v.brain?.traits.includes('raider') === true;
}

function isLawman(v: Vehicle): boolean {
  return v.brain?.traits.includes('lawman') === true;
}

export function inFeud(world: World, a: Vehicle, b: Vehicle): boolean {
  return stateOf(world, 'feud', a.id, b.id) !== null || stateOf(world, 'feud', b.id, a.id) !== null;
}

export function inTruce(world: World, a: Vehicle, b: Vehicle): boolean {
  return stateOf(world, 'truce', a.id, b.id) !== null || stateOf(world, 'truce', b.id, a.id) !== null;
}

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

export function attitude(world: World, a: Vehicle, b: Vehicle): number {
  const holder = npcHolder(a);
  if (inFeud(world, a, b)) return -SCORE_LIMIT;
  const score = clamp(factionTerm(world, holder, b) + personalTerm(a, b.id), -SCORE_LIMIT, SCORE_LIMIT);
  if (inTruce(world, a, b)) return Math.min(score, 0);
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

export function preys(world: World, a: Vehicle, b: Vehicle): boolean {
  return judges(a) && isRaider(a) && hasLoot(b) && !bandAtLeast(bandToward(world, a, b), 'neutral');
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
  const joinable = joinableFactions();
  return STANDING_FACTION_IDS.filter((id) => joinable.has(id)).map((id) => {
    const score = world.player.standing[id];
    return { faction: id, score, band: bandOf(score) };
  });
}

function joinableFactions(): Set<NpcFactionId> {
  const ids = Object.values(NPCS).flatMap(templateFactions);
  return new Set([...ids, ...Object.values(SITE_FACTIONS).filter((id): id is NpcFactionId => id !== undefined)]);
}

function templateFactions(tpl: NpcTemplate): NpcFactionId[] {
  const rule = tpl.allegiance;
  if (rule.kind === 'fixed') return [rule.faction];
  return rule.kind === 'town' ? ['independent'] : [rule.fallback];
}
