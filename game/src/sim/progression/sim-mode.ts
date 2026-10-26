import { SKILL_IDS } from '../../data/skills';
import { TIME } from '../../data/time';
import { inCombat } from '../combat';
import { playerVehicle } from '../damage';
import { isKnockedOut } from '../defeat';
import { goodsCount, mountedParts } from '../grid';
import type { Contract } from '../market';
import { topGoal } from '../npc-activities';
import { getResources } from '../resources';
import { worldPlaces } from '../sites';
import { vehicleStats } from '../stats';
import type { BakedMap } from '../terrain';
import type { GameEvent, Memory, NpcActivity, PartInstance, StateKindId, Vehicle, World } from '../types';
import type { Vec } from '../vec';
import { maxHp } from '../wear';
import type { BotOptions } from './bot';
import { emptyLedger, LEDGER_KEYS, type Ledger } from './orders';
import { archetypeWorldOn, FAR_MOVER, netWorth, playTurns, type PlayedTurn } from './record';
import { describe, QUIET, snap, turnLine, type TruckSnap } from './turn-log';

export type Marker = { id: string; name: string; chassis: string; x: number; y: number; heading: number; faction: string; player: boolean; out: boolean; combat: boolean };
export type LogEntry = { turn: number; kind: string; quiet: boolean; tone: string; text: string; raw: string; ids: string[] };
export type CardRow = [string, string];
export type CardSection = { name: string; lines: string[] };
export type Way = { dest: Vec | null; target: Vec | null; home: Vec | null };
export type Card = { id: string; title: string; rows: CardRow[]; tags: string[]; sections: CardSection[]; way: Way };
export type Hud = { money: string; worth: string; xp: number; state: string; doing: string };
export type Sample = { turn: number; money: number; worth: number; xp: number };
export type Frame = { turn: number; markers: Marker[]; log: LogEntry[]; hud: Hud; card: Card | null; sample: Sample | null };
export type Spoken = { text: string; tone: string; quiet?: boolean };

export type SimText = {
  event(world: World, e: GameEvent): Spoken;
  truck(world: World, v: Vehicle): string;
  doing(world: World, v: Vehicle): string;
  name(world: World, id: string): string;
  target(world: World, id: string): string;
  goal(world: World, g: NpcActivity): string;
  memory(world: World, m: Memory): string;
  state(kind: StateKindId): string;
  words(id: string): string;
  money(cents: number): string;
  fuel(units: number): string;
  speed(tilesPerTurn: number): string;
  distance(tiles: number): string;
  heat(engineHeat: number): string;
  place(pos: Vec): string;
  part(defId: string): string;
  good(id: string): string;
  faction(id: string): string;
  template(id: string): string;
  chassis(id: string): string;
  trait(id: string): string;
  skill(id: string): string;
  personality(id: string): string;
  contract(c: Contract): string;
};

export type ToSim =
  | { kind: 'start'; seed: number | null }
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'step' }
  | { kind: 'speed'; gapMs: number }
  | { kind: 'watch'; id: string | null }
  | { kind: 'save' }
  | { kind: 'download' };

export type FromSim =
  | { kind: 'started'; seed: number; turn: number; resumed: boolean; dropped: boolean }
  | { kind: 'history'; samples: Sample[] }
  | { kind: 'saved'; turn: number }
  | { kind: 'saveFile'; name: string; json: string }
  | { kind: 'frame'; frame: Frame }
  | { kind: 'card'; card: Card | null }
  | { kind: 'ended'; turn: number; reason: string }
  | { kind: 'failed'; turn: number; message: string };

export const SIM_OPTIONS: BotOptions = { markovTurns: TIME.turnsPerDay, tolerateStalls: true };
export const TURNS_PER_HOUR = TIME.turnsPerDay / 24;
const ENDLESS = Number.MAX_SAFE_INTEGER;
const NO_WAY: Way = { dest: null, target: null, home: null };

const round = (n: number): number => Math.round(n * 10) / 10;
const hourOf = (turn: number): number => Math.floor(turn / TURNS_PER_HOUR);

export function sampleOf(world: World): Sample {
  return { turn: world.turn, money: world.player.money, worth: Math.round(netWorth(world)), xp: Math.floor(world.player.xp) };
}

export class SimRun {
  private watched: string | null = null;
  private playing = false;
  private over = false;
  private gapMs = 0;
  private world: World;
  private readonly ledger: Ledger;
  private readonly history: Sample[];
  private readonly turns: Generator<PlayedTurn>;

  constructor(start: World, private readonly text: SimText, private readonly post: (message: FromSim) => void, ledger: Ledger = emptyLedger(), history: Sample[] = []) {
    this.world = start;
    this.ledger = { ...ledger };
    this.history = history.length > 0 ? [...history] : [sampleOf(start)];
    this.turns = playTurns(start, `sim seed ${start.seed}`, 'markov', ENDLESS, SIM_OPTIONS, FAR_MOVER);
    this.post({ kind: 'history', samples: [...this.history] });
    this.post({ kind: 'frame', frame: frameOf(start, [], this.ledger, null, text, null) });
  }

  current(): { world: World; ledger: Ledger; history: Sample[] } {
    return { world: this.world, ledger: { ...this.ledger }, history: [...this.history] };
  }

  handle(message: ToSim): void {
    if (message.kind === 'play') this.play();
    else if (message.kind === 'pause') this.playing = false;
    else if (message.kind === 'step') this.stepOnce();
    else if (message.kind === 'speed') this.gapMs = message.gapMs;
    else if (message.kind === 'watch') this.watch(message.id);
    else throw new Error(`The sim run does not handle ${message.kind}`);
  }

  private play(): void {
    if (this.playing || this.over) return;
    this.playing = true;
    this.tick();
  }

  private tick(): void {
    if (!this.playing) return;
    const began = performance.now();
    this.stepOnce();
    setTimeout(() => this.tick(), Math.max(0, this.gapMs - (performance.now() - began)));
  }

  private watch(id: string | null): void {
    this.watched = id;
    try {
      this.post({ kind: 'card', card: id === null ? null : cardOf(this.world, id, this.ledger, this.text) });
    } catch (error) {
      this.stop();
      this.post({ kind: 'failed', turn: this.world.turn, message: errorText(error) });
    }
  }

  private stepOnce(): void {
    if (this.over) return;
    try {
      this.advance();
    } catch (error) {
      this.stop();
      this.post({ kind: 'failed', turn: this.world.turn, message: errorText(error) });
    }
  }

  private advance(): void {
    const next = this.turns.next();
    if (next.done) {
      this.stop();
      this.post({ kind: 'ended', turn: this.world.turn, reason: this.world.player.state });
      return;
    }
    const played = next.value;
    const before = this.world.turn;
    this.world = played.next;
    for (const key of LEDGER_KEYS) this.ledger[key] += played.ledger[key];
    const sample = hourOf(this.world.turn) === hourOf(before) ? null : sampleOf(this.world);
    if (sample) this.history.push(sample);
    this.post({ kind: 'frame', frame: frameOf(this.world, played.events, this.ledger, this.watched, this.text, sample) });
  }

  private stop(): void {
    this.playing = false;
    this.over = true;
  }
}

export function simWorld(map: BakedMap, seed: number): World {
  return archetypeWorldOn(map, seed, 'markov', SIM_OPTIONS);
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

export function frameOf(world: World, events: readonly GameEvent[], ledger: Ledger, watched: string | null, text: SimText, sample: Sample | null): Frame {
  return {
    turn: world.turn,
    markers: markersOf(world, text),
    log: logEntries(world, events, text),
    hud: hudOf(world, text),
    card: watched === null ? null : cardOf(world, watched, ledger, text),
    sample,
  };
}

export function hudOf(world: World, text: SimText): Hud {
  const p = world.player;
  return { money: text.money(p.money), worth: text.money(netWorth(world)), xp: Math.floor(p.xp), state: p.state, doing: text.doing(world, playerVehicle(world)) };
}

export function markersOf(world: World, text: SimText): Marker[] {
  return world.vehicles.map((v) => ({
    id: v.id,
    name: text.truck(world, v),
    chassis: v.chassisId,
    x: v.pos.x,
    y: v.pos.y,
    heading: v.heading,
    faction: v.faction,
    player: v.id === world.player.vehicleId,
    out: isKnockedOut(v),
    combat: inCombat(world, v),
  }));
}

export function logEntries(world: World, events: readonly GameEvent[], text: SimText): LogEntry[] {
  const known = [...world.vehicles, ...world.removed].map((v) => v.id);
  return events.map((e) => {
    const json = JSON.stringify(e);
    const plain = text.event(world, e);
    return { turn: world.turn, kind: e.t, quiet: QUIET.has(e.t) || plain.quiet === true, tone: e.t === 'stall' ? 'bad' : plain.tone, text: plain.text, raw: describe(world, e), ids: known.filter((id) => json.includes(`"${id}"`)) };
  });
}

export function cardOf(world: World, id: string, ledger: Ledger, text: SimText): Card {
  if (id === world.player.vehicleId) return playerCard(world, ledger, text);
  const v = world.vehicles.find((x) => x.id === id);
  return v ? npcCard(world, v, text) : goneCard(world, id, text);
}

function goneCard(world: World, id: string, text: SimText): Card {
  const v = world.removed.find((x) => x.id === id);
  const name = v ? text.truck(world, v) : 'This truck';
  return { id, title: `${name} has left the world`, rows: [], tags: [], sections: [], way: NO_WAY };
}

function driverlessCard(world: World, v: Vehicle, text: SimText): Card {
  return {
    id: v.id,
    title: `${text.truck(world, v)} with no driver`,
    rows: [['mean hp', `${snap(world, v).hp}%`], ['faction', text.faction(v.faction)], ['at', text.place(v.pos)], ...orderRow(v, text)],
    tags: [],
    sections: [{ name: 'states', lines: stateLines(world, v, text) }, { name: 'parts', lines: partLines(v, text) }],
    way: { ...NO_WAY, dest: destOf(v) },
  };
}

function npcTags(world: World, v: Vehicle, s: TruckSnap): string[] {
  const on: [string, boolean][] = [['in combat', inCombat(world, v)], ['knocked out', isKnockedOut(v)], ['stranded', s.stranded], ['keeps off roads', s.offRoad]];
  return on.filter(([, yes]) => yes).map(([name]) => name);
}

export function npcCard(world: World, v: Vehicle, text: SimText): Card {
  const brain = v.brain;
  if (!brain) return driverlessCard(world, v, text);
  const res = getResources(world, v);
  const s = snap(world, v);
  return {
    id: v.id,
    title: text.truck(world, v),
    rows: [
      ['doing', text.doing(world, v)],
      ['speed', text.speed(v.speed)],
      ['money', text.money(res.money)],
      ['fuel', text.fuel(res.fuel)],
      ['supplies', `${round(res.supplies)}`],
      ['health', `${round(res.health)}`],
      ['mean hp', `${s.hp}%`],
      ['driver', text.template(brain.templateId)],
      ['faction', text.faction(v.faction)],
      ['chassis', text.chassis(v.chassisId)],
      ['at', text.place(v.pos)],
      ...orderRow(v, text),
      ['personality', text.personality(brain.personality)],
      ['traits', brain.traits.map((x) => text.trait(x)).join(', ')],
      ['home', text.place(brain.home)],
      ...(s.roadGap > 0 ? [['off the road by', text.distance(s.roadGap)] as CardRow] : []),
    ],
    tags: npcTags(world, v, s),
    sections: [
      { name: 'goals', lines: [...brain.goals].reverse().map((g) => text.goal(world, g)) },
      { name: 'states', lines: stateLines(world, v, text) },
      { name: 'parts', lines: partLines(v, text) },
      { name: 'goods', lines: goodsLines(v, text) },
      { name: 'memories', lines: [...brain.memories].sort((a, b) => b.turn - a.turn).map((m) => text.memory(world, m)) },
    ],
    way: { dest: destOf(v), target: targetOf(world, v), home: brain.home },
  };
}

function playerTags(world: World, flags: string[]): string[] {
  const state = world.player.state === 'active' ? [] : [world.player.state === 'knockedOut' ? 'knocked out' : world.player.state];
  const names: Record<string, string> = { combat: 'in combat', stranded: 'stranded', towed: 'towed', beacon: 'beacon on', fire: 'auto fire' };
  return [...state, ...flags.map((f) => names[f] ?? f)];
}

function callRow(world: World, text: SimText): CardRow[] {
  const call = world.player.call;
  return call ? [['on the radio with', `${text.name(world, call.with)}${call.topic ? `, ${text.words(call.topic)}` : ''}`]] : [];
}

export function playerCard(world: World, ledger: Ledger, text: SimText): Card {
  const line = turnLine(world, [], ledger);
  const p = world.player;
  const me = playerVehicle(world);
  return {
    id: p.vehicleId,
    title: 'Your truck, driven by the markov bot',
    rows: [
      ['doing', text.doing(world, me)],
      ['speed', text.speed(me.speed)],
      ['money', text.money(p.money)],
      ['net worth', text.money(netWorth(world))],
      ['fuel', text.fuel(p.fuel)],
      ['supplies', `${round(p.supplies)}`],
      ['engine heat', text.heat(p.engineHeat)],
      ['xp', `${Math.floor(p.xp)}`],
      ['chassis', text.chassis(me.chassisId)],
      ['top speed', text.speed(vehicleStats(world, me).maxSpeed)],
      ['at', text.place(me.pos)],
      ...orderRow(me, text),
      ...callRow(world, text),
      ...(line.run ? [['run', line.run] as CardRow] : []),
    ],
    tags: playerTags(world, line.flags),
    sections: [
      { name: 'contracts', lines: p.contracts.map((c) => text.contract(c)) },
      { name: 'foes in sight', lines: line.foes.map((f) => `${text.name(world, f.id)}, ${text.distance(f.dist)} away, ${f.odds}% to win`) },
      { name: 'ranks', lines: SKILL_IDS.map((skill) => `${text.skill(skill)} ${p.ranks[skill]}`) },
      { name: 'parts', lines: partLines(me, text) },
      { name: 'goods', lines: goodsLines(me, text) },
      { name: 'run ledger', lines: LEDGER_KEYS.filter((k) => ledger[k] !== 0).map((k) => `${text.words(k)} ${text.money(ledger[k])}`) },
      { name: 'xp by source', lines: Object.entries(p.xpBySource).filter(([, n]) => n !== 0).map(([source, n]) => `${text.words(source)} ${round(n)}`) },
    ],
    way: { ...NO_WAY, dest: destOf(me) },
  };
}

function destOf(v: Vehicle): Vec | null {
  return v.order && 'dest' in v.order ? v.order.dest : null;
}

function orderRow(v: Vehicle, text: SimText): CardRow[] {
  const order = v.order;
  if (!order) return [];
  if (!('dest' in order)) return [['order', 'brake']];
  const how = order.kind === 'stopAt' ? 'stop at' : 'drive through';
  const far = Math.hypot(order.dest.x - v.pos.x, order.dest.y - v.pos.y);
  return [['order', `${how} ${text.place(order.dest)}, ${text.distance(far)} away`]];
}

function targetOf(world: World, v: Vehicle): Vec | null {
  const goal = topGoal(v);
  if (!goal) return null;
  return goal.destination ?? (goal.targetId ? placeOf(world, goal.targetId) : null);
}

function placeOf(world: World, id: string): Vec | null {
  const at = world.vehicles.find((x) => x.id === id) ?? world.salvage.find((s) => s.id === id) ?? worldPlaces(world).find((s) => s.id === id);
  return at ? at.pos : null;
}

function hpPercent(p: PartInstance): number {
  return Math.round((100 * p.hp) / maxHp(p));
}

function stateLines(world: World, v: Vehicle, text: SimText): string[] {
  return world.states.filter((s) => s.holder === v.id).map((s) => `${text.state(s.kind)} with ${text.name(world, s.other)}${s.turnsLeft === null ? '' : `, ${s.turnsLeft} turns left`}`);
}

function partLines(v: Vehicle, text: SimText): string[] {
  return mountedParts(v).sort((a, b) => hpPercent(a) - hpPercent(b)).map((p) => `${text.part(p.defId)} ${hpPercent(p)}%`);
}

function goodsLines(v: Vehicle, text: SimText): string[] {
  return Object.entries(goodsCount(v)).map(([good, n]) => `${text.good(good)} ${n}`);
}
