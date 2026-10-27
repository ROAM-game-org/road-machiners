import type { TruckPaint } from '../../data/chassis';
import { TIME } from '../../data/time';
import { inCombat } from '../combat';
import { playerVehicle } from '../damage';
import { isKnockedOut } from '../defeat';
import type { Contract } from '../market';
import type { BakedMap } from '../terrain';
import type { GameEvent, Memory, NpcActivity, StateKindId, Vehicle, World } from '../types';
import type { Vec } from '../vec';
import type { BotOptions } from './bot';
import { emptyLedger, LEDGER_KEYS, type Ledger } from './orders';
import { archetypeWorldOn, FAR_MOVER, netWorth, playTurns, type PlayedTurn } from './record';
import { cardOf } from './sim-cards';
import { describe, QUIET } from './turn-log';

export { cardOf, npcCard, playerCard } from './sim-cards';

export type Marker = { id: string; name: string; chassis: string; x: number; y: number; heading: number; faction: string; template: string | null; paint: TruckPaint; player: boolean; out: boolean; combat: boolean };
export type LogEntry = { turn: number; kind: string; quiet: boolean; tone: string; text: string; raw: string; ids: string[] };
export type CardRow = [string, string];
export type CardSection = { name: string; lines: string[]; rows: CardRow[] };
export type Way = { dest: Vec | null; target: Vec | null; home: Vec | null };
export type Card = { id: string; title: string; doing: string; tags: string[]; stats: CardRow[]; facts: CardRow[]; sections: CardSection[]; way: Way };
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
const ROUTINE = new Set<GameEvent['t']>(['job', 'shopMoney', 'stateEnded', 'lookedOver', 'shot', 'empty', 'asked', 'transfer', 'preyPassed', 'collision', 'found', 'guardPaid']);

const hourOf = (turn: number): number => Math.floor(turn / TURNS_PER_HOUR);

export function sampleOf(world: World): Sample {
  return { turn: world.turn, money: world.player.money, worth: Math.round(netWorth(world)), xp: Math.floor(world.player.xp) };
}

export class SimRun {
  private watched: string | null = null;
  private playing = false;
  private over = false;
  private gapMs = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastTurnStart = 0;
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
    else if (message.kind === 'pause') this.pause();
    else if (message.kind === 'step') this.stepOnce();
    else if (message.kind === 'speed') this.setGap(message.gapMs);
    else if (message.kind === 'watch') this.watch(message.id);
    else throw new Error(`The sim run does not handle ${message.kind}`);
  }

  private play(): void {
    if (this.playing || this.over) return;
    this.playing = true;
    this.tick();
  }

  private pause(): void {
    this.playing = false;
    this.cancelTimer();
  }

  private setGap(gapMs: number): void {
    this.gapMs = gapMs;
    if (this.playing && this.timer !== null) this.schedule();
  }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    this.cancelTimer();
    this.timer = setTimeout(() => this.tick(), Math.max(0, this.gapMs - (performance.now() - this.lastTurnStart)));
  }

  private tick(): void {
    this.timer = null;
    if (!this.playing) return;
    this.lastTurnStart = performance.now();
    this.stepOnce();
    if (this.playing) this.schedule();
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
    template: v.brain ? v.brain.templateId : null,
    paint: world.player.paint,
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
    const ids = known.filter((id) => json.includes(`"${id}"`));
    return { turn: world.turn, kind: e.t, quiet: isQuiet(world, e, plain, ids), tone: e.t === 'stall' ? 'bad' : plain.tone, text: plain.text, raw: describe(world, e), ids };
  });
}

function isQuiet(world: World, e: GameEvent, plain: Spoken, ids: string[]): boolean {
  if (QUIET.has(e.t) || plain.quiet === true) return true;
  return ROUTINE.has(e.t) && !ids.includes(world.player.vehicleId);
}

