import { SKILL_IDS } from '../../data/skills';
import { TIME } from '../../data/time';
import { inCombat } from '../combat';
import { isKnockedOut } from '../defeat';
import { goodsCount, mountedParts } from '../grid';
import { getResources } from '../resources';
import { clockOf } from '../sun';
import type { BakedMap } from '../terrain';
import type { GameEvent, NpcActivity, Vehicle, World } from '../types';
import { maxHp } from '../wear';
import type { BotOptions } from './bot';
import { emptyLedger, LEDGER_KEYS, type Ledger } from './orders';
import { archetypeWorldOn, FAR_MOVER, netWorth, playTurns, type PlayedTurn } from './record';
import { describe, QUIET, snap, turnLine } from './turn-log';

export type Marker = { id: string; x: number; y: number; heading: number; faction: string; player: boolean; out: boolean; combat: boolean };
export type LogEntry = { turn: number; kind: string; quiet: boolean; text: string; ids: string[] };
export type CardRow = [string, string];
export type CardSection = { name: string; lines: string[] };
export type Card = { id: string; title: string; rows: CardRow[]; sections: CardSection[] };
export type Frame = { turn: number; day: number; hour: number; markers: Marker[]; log: LogEntry[]; card: Card | null };

export type ToSim =
  | { kind: 'start'; seed: number }
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'step' }
  | { kind: 'watch'; id: string | null };

export type FromSim =
  | { kind: 'frame'; frame: Frame }
  | { kind: 'card'; card: Card | null }
  | { kind: 'ended'; turn: number; reason: string }
  | { kind: 'failed'; turn: number; message: string };

export const SIM_OPTIONS: BotOptions = { markovTurns: TIME.turnsPerDay, tolerateStalls: true };
const ENDLESS = Number.MAX_SAFE_INTEGER;

const round = (n: number): number => Math.round(n * 10) / 10;

export class SimRun {
  private ledger: Ledger = emptyLedger();
  private watched: string | null = null;
  private playing = false;
  private over = false;
  private world: World;
  private readonly turns: Generator<PlayedTurn>;

  constructor(start: World, seed: number, private readonly post: (message: FromSim) => void) {
    this.world = start;
    this.turns = playTurns(start, `sim seed ${seed}`, 'markov', ENDLESS, SIM_OPTIONS, FAR_MOVER);
    this.post({ kind: 'frame', frame: frameOf(start, [], this.ledger, null) });
  }

  handle(message: ToSim): void {
    if (message.kind === 'play') this.play();
    else if (message.kind === 'pause') this.playing = false;
    else if (message.kind === 'step') this.stepOnce();
    else if (message.kind === 'watch') this.watch(message.id);
    else throw new Error('The sim is already started');
  }

  private play(): void {
    if (this.playing || this.over) return;
    this.playing = true;
    this.tick();
  }

  private tick(): void {
    if (!this.playing) return;
    this.stepOnce();
    setTimeout(() => this.tick(), 0);
  }

  private watch(id: string | null): void {
    this.watched = id;
    this.post({ kind: 'card', card: id === null ? null : cardOf(this.world, id, this.ledger) });
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
    this.world = played.next;
    for (const key of LEDGER_KEYS) this.ledger[key] += played.ledger[key];
    this.post({ kind: 'frame', frame: frameOf(this.world, played.events, this.ledger, this.watched) });
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

export function frameOf(world: World, events: readonly GameEvent[], ledger: Ledger, watched: string | null): Frame {
  const { day, hour } = clockOf(world.turn);
  return { turn: world.turn, day, hour, markers: markersOf(world), log: logEntries(world, events), card: watched === null ? null : cardOf(world, watched, ledger) };
}

export function markersOf(world: World): Marker[] {
  return world.vehicles.map((v) => ({
    id: v.id,
    x: v.pos.x,
    y: v.pos.y,
    heading: v.heading,
    faction: v.faction,
    player: v.id === world.player.vehicleId,
    out: isKnockedOut(v),
    combat: inCombat(world, v),
  }));
}

export function logEntries(world: World, events: readonly GameEvent[]): LogEntry[] {
  const known = [...world.vehicles, ...world.removed].map((v) => v.id);
  return events.map((e) => {
    const json = JSON.stringify(e);
    return { turn: world.turn, kind: e.t, quiet: QUIET.has(e.t), text: describe(world, e), ids: known.filter((id) => json.includes(`"${id}"`)) };
  });
}

export function cardOf(world: World, id: string, ledger: Ledger): Card {
  if (id === world.player.vehicleId) return playerCard(world, ledger);
  const v = world.vehicles.find((x) => x.id === id);
  return v ? npcCard(world, v) : goneCard(id);
}

function goneCard(id: string): Card {
  return { id, title: `${id} is no longer in the world`, rows: [], sections: [] };
}

export function npcCard(world: World, v: Vehicle): Card {
  const brain = v.brain;
  if (!brain) throw new Error(`Truck ${v.id} has no driver brain`);
  const s = snap(world, v);
  return {
    id: v.id,
    title: `${v.id} ${brain.templateId} ${brain.driver}`,
    rows: [
      ['faction', v.faction],
      ['chassis', v.chassisId],
      ['at', `${s.pos[0]}, ${s.pos[1]}`],
      ['speed', `${s.speed}`],
      ['order', orderText(v)],
      ['job', v.job?.kind ?? '-'],
      ['money', `${s.money}`],
      ['fuel', `${s.fuel}`],
      ['supplies', `${s.sup}`],
      ['health', `${round(getResources(world, v).health)}`],
      ['mean hp', `${s.hp}%`],
      ['personality', brain.personality],
      ['traits', brain.traits.join(', ') || '-'],
      ['home', `${round(brain.home.x)}, ${round(brain.home.y)}`],
      ['stranded', `${s.stranded}`],
      ['knocked out', `${isKnockedOut(v)}`],
      ['in combat', `${inCombat(world, v)}`],
      ['keeps off roads', `${s.offRoad}`],
      ['road gap', `${s.roadGap}`],
    ],
    sections: [
      { name: 'goals', lines: brain.goals.map(goalText) },
      { name: 'states', lines: s.states },
      { name: 'parts', lines: partLines(v) },
      { name: 'goods', lines: Object.entries(goodsCount(v)).map(([good, n]) => `${good} ${n}`) },
      { name: 'memories', lines: brain.memories.map((m) => `${m.turn} ${JSON.stringify(m.fact)}`) },
    ],
  };
}

export function playerCard(world: World, ledger: Ledger): Card {
  const line = turnLine(world, [], ledger);
  const p = world.player;
  return {
    id: p.vehicleId,
    title: `${p.vehicleId} player, markov bot`,
    rows: [
      ['state', line.state],
      ['chassis', line.chassis],
      ['at', `${line.pos[0]}, ${line.pos[1]}`],
      ['speed', `${line.v} of ${line.speed}`],
      ['order', line.order ?? '-'],
      ['job', line.job ?? '-'],
      ['money', `${round(p.money)}`],
      ['net worth', `${Math.round(netWorth(world))}`],
      ['fuel', `${line.fuel}`],
      ['supplies', `${line.sup}`],
      ['engine heat', `${line.heat}`],
      ['xp', `${round(p.xp)}`],
      ['flags', line.flags.join(', ') || '-'],
      ['call', line.call ?? '-'],
      ...(line.run ? [['run', line.run] as CardRow] : []),
    ],
    sections: [
      { name: 'ranks', lines: SKILL_IDS.map((skill) => `${skill} ${p.ranks[skill]}`) },
      { name: 'contracts', lines: line.contracts },
      { name: 'foes in sight', lines: line.foes.map((f) => `${f.id} ${f.who} at ${f.dist}, win ${f.odds}%`) },
      { name: 'parts', lines: line.parts },
      { name: 'goods', lines: Object.entries(line.goods).map(([good, n]) => `${good} ${n}`) },
      { name: 'run ledger', lines: LEDGER_KEYS.filter((k) => ledger[k] !== 0).map((k) => `${k} ${round(ledger[k])}`) },
      { name: 'xp by source', lines: Object.entries(p.xpBySource).filter(([, n]) => n !== 0).map(([source, n]) => `${source} ${round(n)}`) },
    ],
  };
}

function orderText(v: Vehicle): string {
  if (!v.order) return '-';
  return 'dest' in v.order ? `${v.order.kind} ${Math.round(v.order.dest.x)}, ${Math.round(v.order.dest.y)}` : v.order.kind;
}

function goalText(g: NpcActivity): string {
  const target = g.targetId ? ` ${g.targetId}` : '';
  const dest = g.destination ? ` to ${Math.round(g.destination.x)}, ${Math.round(g.destination.y)}` : '';
  return `${g.kind} ${g.phase}${target}${dest} ${JSON.stringify(g.reason)}`;
}

function partLines(v: Vehicle): string[] {
  return mountedParts(v).map((p) => `${p.defId} ${Math.round((100 * p.hp) / maxHp(p))}%`);
}
