import type { TopicId } from '../data/dialogue';
import { ENCOUNTERS } from '../data/encounters';
import { SALVAGE } from '../data/salvage';
import { getResources } from './resources';
import { inCombat, isHostile } from './combat';
import { playerVehicle } from './damage';
import { isKnockedOut } from './defeat';
import { talkOf } from './dialogue';
import { aidValue, hasAid, playerAid, wantedAid } from './aid';
import { recall } from './memory';
import { judgeDanger, firepower, hasTrait, isManageable, yields } from './npc-decisions';
import { react } from './npc-activities';
import { emptiedWreck, siteRumor, tradeTip, wreckRumor, type Rumor } from './rumors';
import { meanLootValue } from './salvage';
import { modeRules } from './settings';
import type { CourierBeat, CourierStory, CourierTopic, EncounterId, EncounterLog, StateEnding, Vehicle, World } from './types';
import { canVehicleSee } from './vision';

const TOPIC_OF: Record<EncounterId, TopicId> = { tale: 'tale', tip: 'salvageTip', challenge: 'challenge', courier: 'courierShort' };

const RAISED: Partial<Record<TopicId, EncounterId | CourierTopic>> = {
  tale: 'tale',
  salvageTip: 'tip',
  challenge: 'challenge',
  courierShort: 'courierShort',
  courierThanks: 'courierThanks',
  courierSquare: 'courierSquare',
  courierCold: 'courierCold',
  courierGrudge: 'courierGrudge',
  courierFavor: 'courierFavor',
};

const BEAT_TOPIC: Partial<Record<CourierBeat, CourierTopic>> = {
  helped: 'courierThanks',
  paid: 'courierSquare',
  refused: 'courierCold',
  owed: 'courierFavor',
};

function logOf(world: World): EncounterLog {
  return world.player.encounters;
}

export function wrongedBy(npc: Vehicle, truckId: string): boolean {
  return recall(npc, 'wronged').some((m) => m.fact.by === truckId);
}

function playerFree(world: World): boolean {
  return world.player.state === 'active' && !world.player.frozen && world.player.call === null;
}

export function encounterOpen(world: World): boolean {
  const log = logOf(world);
  if (world.turn < log.next || log.pending !== null) return false;
  return modeRules(world).radio && playerFree(world) && !inCombat(world, playerVehicle(world));
}

function mayCall(world: World, npc: Vehicle): boolean {
  const me = playerVehicle(world);
  return !isKnockedOut(npc) && !isHostile(world, npc, me) && !inCombat(world, npc) && canVehicleSee(world, npc, me.pos);
}

export function onStrangerSeen(world: World, npc: Vehicle): void {
  if (!encounterOpen(world) || !mayCall(world, npc)) return;
  const choice = react(world, npc, 'strangerSeen', world.player.vehicleId);
  if (choice === null || choice === 'keep') return;
  logOf(world).pending = { encounter: choice, driver: npc.id, until: world.turn + ENCOUNTERS.pendingTurns };
}

function offerable(world: World, npc: Vehicle, id: EncounterId): boolean {
  const topic = TOPIC_OF[id];
  return talkOf(npc).topics.includes(topic) && world.player.talked[npc.id]?.[topic] === undefined;
}

function opensTale(npc: Vehicle): boolean {
  return (talkOf(npc).personality.gates.tale ?? 'open') === 'open';
}

function taleAvailable(world: World, npc: Vehicle): boolean {
  return opensTale(npc) && (siteRumor(world, npc) !== null || tradeTip(npc) !== null);
}

export function tipTarget(world: World, npc: Vehicle): Rumor | null {
  const lie = hasTrait(npc, 'scumbag') ? emptiedWreck(world, npc) : null;
  return lie ?? wreckRumor(world, npc);
}

function challengeAvailable(world: World, npc: Vehicle): boolean {
  const me = playerVehicle(world);
  if (!yields(world) || wrongedBy(npc, me.id) || firepower(world, npc) <= 0) return false;
  return isManageable(npc, judgeDanger(world, npc, me));
}

function courierAvailable(world: World, npc: Vehicle): boolean {
  if (logOf(world).story !== null || !hasTrait(npc, 'courier') || wrongedBy(npc, world.player.vehicleId)) return false;
  return hasAid(wantedAid(world, npc, true)) && playerAid(world) === null;
}

const AVAILABLE: Record<EncounterId, (world: World, npc: Vehicle) => boolean> = {
  tale: taleAvailable,
  tip: (world, npc) => tipTarget(world, npc) !== null,
  challenge: challengeAvailable,
  courier: courierAvailable,
};

export function encounterAvailable(world: World, npc: Vehicle, id: EncounterId): boolean {
  if (!Object.hasOwn(AVAILABLE, id)) throw new Error(`Unknown encounter ${id}`);
  return offerable(world, npc, id) && AVAILABLE[id](world, npc);
}

export function encounterOfTopic(topic: TopicId): EncounterId {
  const found = (Object.keys(TOPIC_OF) as EncounterId[]).find((id) => TOPIC_OF[id] === topic);
  if (!found) throw new Error(`Topic ${topic} is no encounter`);
  return found;
}

export function pendingFor(world: World, npc: Vehicle, id: EncounterId): boolean {
  const pending = logOf(world).pending;
  return pending !== null && pending.driver === npc.id && pending.encounter === id;
}

export function requirePending(world: World, npc: Vehicle, id: EncounterId): void {
  if (!pendingFor(world, npc, id)) throw new Error(`${npc.id} has no ${id} encounter pending`);
}

export function closeEncounter(world: World, npc: Vehicle, id: EncounterId): void {
  requirePending(world, npc, id);
  logOf(world).pending = null;
}

export function tipPrice(): number {
  return Math.round(ENCOUNTERS.tip.valueShare * meanLootValue(SALVAGE.roadWreck));
}

export function raiseEncounter(world: World, npc: Vehicle, topic: TopicId): void {
  const encounter = RAISED[topic];
  if (!encounter) return;
  logOf(world).next = world.turn + ENCOUNTERS.gapTurns;
  world.events.push({ t: 'encounter', vehicle: npc.id, encounter });
  if (topic === 'courierShort') startStory(world, npc);
}

function storyOf(world: World, npc: Vehicle): CourierStory {
  const story = logOf(world).story;
  if (!story || story.driver !== npc.id) throw new Error(`${npc.id} is not the courier of the story`);
  return story;
}

function startStory(world: World, npc: Vehicle): void {
  if (logOf(world).story !== null) throw new Error('A courier story is already running');
  logOf(world).story = { driver: npc.id, beat: 'asked', turn: world.turn, aidValue: aidValue(wantedAid(world, npc, true)), free: false };
}

export function moveStory(world: World, npc: Vehicle, from: readonly CourierBeat[], to: CourierBeat, free?: boolean): void {
  const story = storyOf(world, npc);
  if (!from.includes(story.beat)) throw new Error(`The courier story is at ${story.beat}, not ${from.join(' or ')}`);
  story.beat = to;
  story.turn = world.turn;
  if (free !== undefined) story.free = free;
}

export function endStoryAid(world: World, aid: { holder: string }, ending: StateEnding): void {
  const story = logOf(world).story;
  if (!story || story.beat !== 'promised' || aid.holder !== story.driver) return;
  story.beat = ending === 'fulfilled' ? (story.free ? 'helped' : 'paid') : 'refused';
  story.turn = world.turn;
}

export function favorAmount(world: World, npc: Vehicle): number {
  const story = storyOf(world, npc);
  if (story.aidValue < 0) throw new Error(`The courier story holds a negative aid value ${story.aidValue}`);
  const spare = getResources(world, npc).money - ENCOUNTERS.favorReserve;
  return Math.max(0, Math.min(Math.round(story.aidValue * ENCOUNTERS.favorShare), spare));
}

function dueTopic(world: World, npc: Vehicle, story: CourierStory): CourierTopic | null {
  const topic = BEAT_TOPIC[story.beat];
  if (!topic) return null;
  if (wrongedBy(npc, world.player.vehicleId)) return 'courierGrudge';
  return topic === 'courierFavor' && favorAmount(world, npc) <= 0 ? null : topic;
}

export function storyBeatDue(world: World, npc: Vehicle): CourierTopic | null {
  const story = logOf(world).story;
  if (!story || story.driver !== npc.id) return null;
  return world.turn - story.turn >= ENCOUNTERS.storyGapTurns ? dueTopic(world, npc, story) : null;
}

function callWith(world: World, id: string): boolean {
  return world.player.call?.with === id;
}

function lapsePending(world: World, log: EncounterLog): void {
  const pending = log.pending;
  if (!pending || callWith(world, pending.driver)) return;
  const gone = !world.vehicles.some((v) => v.id === pending.driver);
  if (gone || world.turn > pending.until) log.pending = null;
}

function lapseStory(world: World, log: EncounterLog): void {
  const story = log.story;
  if (!story) return;
  if (story.beat !== 'ended' && !world.vehicles.some((v) => v.id === story.driver)) log.story = null;
  else if (story.beat === 'asked' && !callWith(world, story.driver)) {
    story.beat = 'refused';
    story.turn = world.turn;
  }
}

export function lapseEncounter(world: World): void {
  lapsePending(world, logOf(world));
  lapseStory(world, logOf(world));
}
