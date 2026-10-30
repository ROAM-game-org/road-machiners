
import { inCombat } from '../combat';
import { playerVehicle } from '../damage';
import { goodsCount, mountedParts } from '../grid';
import { onRouteRoad, terrainNav } from '../nav/layer';
import { fightOddsAgainst } from '../npc-decisions';
import { routeStyle, type RouteStyle } from '../off-road';
import { REGION } from '../../data/region';
import { ROAD_INDEX } from '../road-index';
import { getResources } from '../resources';
import { isStranded, vehicleStats } from '../stats';
import { isTowed } from '../tow';
import type { GameEvent, Vehicle, World } from '../types';
import { dist } from '../vec';
import { playerSees } from '../vision';
import { maxHp } from '../wear';
import { hostileToPlayer } from '../world';
import type { Ledger } from './orders';
import { netWorth } from './record';
import type { NpcLedger } from './npc-ledger';
import { chaosHighwayReadout } from '../chaos-highway';
import { EFFORT } from '../../data/market';

export type SeenFoe = { id: string; who: string; dist: number; odds: number; speed: number };

export type TurnLine = {
  t: number;
  pos: [number, number];
  money: number;
  nw: number;
  fuel: number;
  sup: number;
  heat: number;
  chassis: string;
  speed: number;
  v: number;
  state: string;
  goods: Record<string, number>;
  parts: string[];
  contracts: string[];
  order: string | null;
  job: string | null;
  flags: string[];
  call: string | null;
  foes: SeenFoe[];
  ledger: Partial<Ledger>;
  ev: string[];
  run?: string;
};

export function turnLine(world: World, events: readonly GameEvent[], ledger: Ledger): TurnLine {
  const me = playerVehicle(world);
  const p = world.player;
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    t: world.turn,
    pos: [round(me.pos.x), round(me.pos.y)],
    money: p.money,
    nw: Math.round(netWorth(world)),
    fuel: round(p.fuel),
    sup: round(p.supplies),
    heat: round(p.engineHeat),
    chassis: me.chassisId,
    speed: round(vehicleStats(world, me).maxSpeed),
    v: round(me.speed),
    state: p.state,
    goods: goodsCount(me),
    parts: mountedParts(me).map((part) => `${part.defId}:${Math.round((100 * part.hp) / maxHp(part))}`),
    contracts: p.contracts.map((c) => `${c.kind}:${'good' in c ? c.good : ''}${'units' in c ? c.units : ''}${'client' in c ? c.client : ''}>${'to' in c ? c.to : c.shop}`),
    order: me.order ? `${me.order.kind}${'dest' in me.order ? `@${Math.round(me.order.dest.x)},${Math.round(me.order.dest.y)}` : ''}` : null,
    job: me.job ? me.job.kind : null,
    flags: flagsOf(world, me),
    call: p.call ? `${p.call.with}:${p.call.topic ?? 'hub'}` : null,
    foes: foesSeen(world, me),
    ledger: Object.fromEntries(Object.entries(ledger).filter(([, v]) => v !== 0)),
    ev: events.filter((e) => touchesPlayer(e, me.id)).map((e) => describe(world, e)),
    ...runField(world),
  };
}

function runField(world: World): { run?: string } {
  const run = chaosHighwayReadout(world);
  return run ? { run: `${run.stretch} ${Math.round(run.toOutpost)}` } : {};
}

const SNAPSHOT_TURNS = 10;

export type WorldLine = { t: number; events?: GameEvent[]; money?: NpcLedger; trucks?: TruckSnap[] };
export type TruckSnap = { id: string; who: string; faction: string; chassis: string; pos: [number, number]; speed: number; order: string | null; goals: string[]; money: number; fuel: number; sup: number; stranded: boolean; hp: number; states: string[]; style: RouteStyle; onRoad: boolean; roadGap: number };

export function worldLine(world: World, events: readonly GameEvent[], npcMoney: NpcLedger = {}): WorldLine | null {
  const line: WorldLine = { t: world.turn, ...eventsField(events), ...moneyField(npcMoney) };
  if (world.turn % SNAPSHOT_TURNS === 0) line.trucks = world.vehicles.map((v) => snap(world, v));
  return Object.keys(line).length > 1 ? line : null;
}

function eventsField(events: readonly GameEvent[]): Pick<WorldLine, 'events'> {
  return events.length > 0 ? { events: [...events] } : {};
}

function moneyField(npcMoney: NpcLedger): Pick<WorldLine, 'money'> {
  return Object.keys(npcMoney).length > 0 ? { money: npcMoney } : {};
}

function meanHp(v: Vehicle): number {
  const parts = mountedParts(v);
  return Math.round(parts.reduce((sum, p) => sum + (100 * p.hp) / maxHp(p), 0) / Math.max(1, parts.length));
}

export function snap(world: World, v: Vehicle): TruckSnap {
  const hp = meanHp(v);
  return {
    id: v.id,
    who: v.brain?.templateId ?? 'player',
    faction: v.faction,
    chassis: v.chassisId,
    pos: [Math.round(v.pos.x * 10) / 10, Math.round(v.pos.y * 10) / 10],
    speed: Math.round(v.speed * 10) / 10,
    order: v.order ? v.order.kind : null,
    goals: v.brain?.goals.map((g) => `${g.kind}${g.targetId ? `:${g.targetId}` : ''}`) ?? [],
    money: Math.round(getResources(world, v).money),
    fuel: Math.round(getResources(world, v).fuel),
    sup: Math.round(getResources(world, v).supplies * 10) / 10,
    stranded: isStranded(world, v),
    hp,
    states: world.states.filter((s) => s.holder === v.id).map((s) => `${s.kind}>${s.other}`),
    style: routeStyle(world, v),
    onRoad: onRouteRoad(terrainNav(world.terrain), v.pos.x, v.pos.y),
    roadGap: roadGap(v),
  };
}

const ROAD_GAP_CAP = 20;

function roadGap(v: Vehicle): number {
  const centre = ROAD_INDEX.nearestWithin(v.pos.x, v.pos.y, ROAD_GAP_CAP + REGION.roadWidth / 2);
  return Math.min(ROAD_GAP_CAP, Math.round(Math.max(0, centre - REGION.roadWidth / 2)));
}

function flagsOf(world: World, me: Vehicle): string[] {
  const p = world.player;
  const on: [string, boolean][] = [['combat', inCombat(world, me)], ['stranded', isStranded(world, me)], ['towed', isTowed(world)], ['beacon', p.beacon], ['fire', p.autoFire]];
  return on.filter(([, v]) => v).map(([name]) => name);
}

function foesSeen(world: World, me: Vehicle): SeenFoe[] {
  return world.vehicles
    .filter((v) => v.id !== me.id && hostileToPlayer(world, v) && playerSees(world, v.pos))
    .map((v) => ({ id: v.id, who: `${v.brain?.templateId ?? v.faction}/${v.chassisId}`, dist: Math.round(dist(v.pos, me.pos)), odds: Math.round(100 * fightOddsAgainst(world, me, v).win), speed: Math.round(vehicleStats(world, v).maxSpeed * 10) / 10 }));
}

const OWN = new Set(['money', 'contract', 'claimRival', 'claimLead', 'death', 'knockout', 'wake', 'skillUp', 'supply', 'townPatch', 'scrapPatch', 'searched', 'discover', 'outpostReached', 'roadOpened', 'runLost']);
export const QUIET = new Set(['practice', 'activity', 'arrived', 'spawn', 'despawn', 'info', 'weather', 'enteredSite', 'leftSite']);

export function touchesPlayer(e: GameEvent, me: string): boolean {
  if (QUIET.has(e.t)) return false;
  if (OWN.has(e.t) || (e.t === 'shopMoney' && e.kind === 'claimReward')) return true;
  return JSON.stringify(e).includes(`"${me}"`);
}

function truck(world: World, id: string): string {
  const v = world.vehicles.find((x) => x.id === id);
  return v ? `${id}:${v.brain?.templateId ?? 'player'}/${v.chassisId}` : id;
}

function contractLine(e: Extract<GameEvent, { t: 'contract' }>): string {
  return `contract ${e.outcome} ${e.contract.kind}${e.cause ? ` ${e.cause}` : ''}`;
}

export function describe(world: World, e: GameEvent): string {
  if (e.t === 'say') return `say ${e.speaker}: ${e.line}`;
  if (e.t === 'shot') return `shot ${truck(world, e.shooter)}>${truck(world, e.target)} ${e.weapon} hits ${e.rounds.filter((r) => r.hit).length}/${e.rounds.length}`;
  if (e.t === 'money') return `money ${e.amount} ${e.reason.kind}`;
  if (e.t === 'contract') return contractLine(e);
  if (e.t === 'stateEnded') return `stateEnded ${e.state.kind}:${e.state.holder}>${e.state.other} ${e.ending}`;
  const { t, ...rest } = e;
  return `${t} ${JSON.stringify(rest)}`;
}

export type SearchEffort = {
  accepted: number;
  claimed: number;
  failed: number;
  lapsed: number;
  open: number;
  efforts: number[];
  searchTurns: number;
  runningCost: number;
  turns: number;
};

const RUNNING_COSTS = ['fuel', 'supplies', 'repairs'] as const;
const ENDS = { done: 'claimed', failed: 'failed', lapsed: 'lapsed' } as const;

export function searchEffort(lines: readonly TurnLine[]): SearchEffort {
  const out: SearchEffort = { accepted: 0, claimed: 0, failed: 0, lapsed: 0, open: 0, efforts: [], searchTurns: 0, runningCost: 0, turns: lines.length };
  let since: number | null = null;
  for (const line of lines) {
    out.runningCost -= runningCostOf(line);
    for (const ev of line.ev) since = countEvent(out, ev, line.t, since);
  }
  countOpen(out, since, lines.at(-1)?.t);
  out.runningCost = out.turns > 0 ? out.runningCost / out.turns : 0;
  return out;
}

function runningCostOf(line: TurnLine): number {
  return RUNNING_COSTS.reduce((sum, cost) => sum + (line.ledger[cost] ?? 0), 0);
}

function countOpen(out: SearchEffort, since: number | null, last: number | undefined): void {
  if (since === null) return;
  out.open += 1;
  out.searchTurns += (last ?? since) - since;
}

function countEvent(out: SearchEffort, ev: string, turn: number, since: number | null): number | null {
  const [t, outcome, kind] = ev.split(' ');
  if (t !== 'contract' || kind !== 'search') return since;
  if (outcome !== 'accepted') return endSearch(out, ENDS[outcome as keyof typeof ENDS], turn, since);
  out.accepted += 1;
  return turn;
}

function endSearch(out: SearchEffort, end: (typeof ENDS)[keyof typeof ENDS] | undefined, turn: number, since: number | null): number | null {
  if (!end || since === null) return since;
  out[end] += 1;
  out.searchTurns += turn - since;
  if (end === 'claimed') out.efforts.push(turn - since);
  return null;
}

export function measuredRewardTurns(effortTurns: number, runningCostPerTurn: number): number {
  const wage = EFFORT.wage[1];
  return Math.round((effortTurns * (runningCostPerTurn + wage)) / wage / 10) * 10;
}
