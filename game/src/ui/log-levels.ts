import { isPlayerTruckId } from '../sim/damage';
import type { GameEvent, SimNote, World } from '../sim/types';
import { eventText, type LogLine } from './format';

export type LogLevel = 'info' | 'notable' | 'attention' | 'critical';
export type LogReach = 'both' | 'verbose';
export type LogEntry = LogLine & { level: LogLevel; reach: LogReach };

type Leveled<K extends GameEvent['t']> = LogLevel | ((world: World, e: Extract<GameEvent, { t: K }>) => LogLevel);

const ATTENTION_NOTES = new Set<SimNote['id']>(['engineHot', 'engineOverheat', 'fuelLow', 'stranded', 'stormEntered', 'hazard', 'core', 'overdriveCutOut', 'setDown', 'tankLeak']);

function involvesPlayer(world: World, ...ids: (string | null | undefined)[]): LogLevel {
  return ids.some((id) => typeof id === 'string' && isPlayerTruckId(world, id)) ? 'notable' : 'info';
}

function onPlayerTruck(world: World, vehicle: string): LogLevel {
  return isPlayerTruckId(world, vehicle) ? 'attention' : 'info';
}

function infoLevel(e: Extract<GameEvent, { t: 'info' }>): LogLevel {
  if (e.debug) return 'info';
  return ATTENTION_NOTES.has(e.note.id) ? 'attention' : 'notable';
}

function supplyLevel(e: Extract<GameEvent, { t: 'supply' }>): LogLevel {
  if (e.note.id === 'outOfSupplies') return 'attention';
  return e.note.id === 'filledSupplies' ? 'info' : 'notable';
}

const EVENT_LEVELS: { [K in GameEvent['t']]: Leveled<K> } = {
  roadHorn: 'info',
  activity: 'info',
  stall: 'info',
  preyPassed: 'info',
  info: (_, e) => infoLevel(e),
  townPatch: 'notable',
  siteEvent: 'info',
  engineCredit: 'notable',
  scrapPatch: 'notable',
  npcKnockout: 'notable',
  npcWake: 'info',
  stateEnded: 'notable',
  lookedOver: 'notable',
  empty: 'info',
  utility: 'info',
  caltrops: 'info',
  lineTorn: 'info',
  pulse: (world, e) => (e.vehicle === world.player.vehicleId ? 'info' : 'attention'),
  claymore: 'info',
  claymoreCookOff: 'info',
  found: 'notable',
  say: (world, e) => involvesPlayer(world, e.speaker, e.to),
  job: (_, e) => (e.outcome === 'started' ? 'info' : 'notable'),
  weather: 'info',
  honk: 'info',
  patch: (world, e) => involvesPlayer(world, e.patcher, e.client),
  aid: (world, e) => involvesPlayer(world, e.giver, e.receiver),
  aidStarted: (world, e) => involvesPlayer(world, e.giver, e.receiver),
  towOffer: 'notable',
  towHitched: (world, e) => involvesPlayer(world, e.by, e.client),
  towDone: (world, e) => involvesPlayer(world, e.by, e.client),
  towDropped: (world, e) => involvesPlayer(world, e.by, e.client),
  call: 'info',
  plea: 'info',
  cargoSpilled: 'notable',
  escortPaid: 'info',
  guardPaid: 'info',
  shopMoney: 'info',
  transfer: 'info',
  holdUp: 'notable',
  escortHired: 'info',
  escortRefused: 'info',
  crewAsked: 'info',
  crewFormed: 'info',
  crewFailed: 'info',
  crewLeft: 'info',
  crewLed: 'info',
  crewDisbanded: 'info',
  guardHired: 'notable',
  guardEnded: 'notable',
  note: 'notable',
  lootArgument: (world, e) => involvesPlayer(world, e.warner, e.looter),
  collision: 'info',
  shot: 'info',
  partDisabled: (world, e) => onPlayerTruck(world, e.vehicle),
  destroyed: 'notable',
  hostile: 'info',
  joins: 'notable',
  standing: 'notable',
  practice: 'info',
  skillUp: 'notable',
  money: 'notable',
  outpostReached: 'notable',
  roadOpened: 'info',
  runLost: 'critical',
  bountyFiled: 'info',
  bountyClosed: 'notable',
  settlement: 'notable',
  asked: 'info',
  huntWithdrawn: 'info',
  discover: 'notable',
  encounter: 'info',
  supply: (_, e) => supplyLevel(e),
  death: 'critical',
  coreBurn: 'info',
  sunwardFallen: 'notable',
  knockout: 'critical',
  wake: 'notable',
  searched: 'notable',
  contract: (_, e) => (e.outcome === 'expiring' || e.outcome === 'overdue' ? 'attention' : 'notable'),
  claimRival: 'notable',
  claimLead: 'notable',
  escortEnded: 'notable',
  breakdown: (world, e) => onPlayerTruck(world, e.vehicle),
  spawn: 'info',
  despawn: 'info',
  enteredSite: 'info',
  leftSite: 'info',
  arrived: 'info',
};

export function eventLevel(world: World, e: GameEvent): LogLevel {
  const level = EVENT_LEVELS[e.t] as Leveled<GameEvent['t']>;
  return typeof level === 'function' ? (level as (world: World, e: GameEvent) => LogLevel)(world, e) : level;
}

export function leveled(line: LogLine, level: LogLevel): LogEntry {
  return { ...line, level, reach: level === 'info' ? 'verbose' : 'both' };
}

export function eventEntry(world: World, e: GameEvent): LogEntry | null {
  const line = eventText(world, e);
  return line ? leveled(line, eventLevel(world, e)) : null;
}
