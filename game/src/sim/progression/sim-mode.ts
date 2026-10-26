import { SKILL_IDS } from '../../data/skills';
import { TIME } from '../../data/time';
import { inCombat } from '../combat';
import { playerVehicle } from '../damage';
import { isKnockedOut } from '../defeat';
import { goodsCount, mountedParts } from '../grid';
import { getResources } from '../resources';
import { vehicleStats } from '../stats';
import type { BakedMap } from '../terrain';
import type { GameEvent, NpcActivity, Vehicle, World } from '../types';
import { maxHp } from '../wear';
import type { BotOptions } from './bot';
import { emptyLedger, LEDGER_KEYS, type Ledger } from './orders';
import { archetypeWorldOn, FAR_MOVER, netWorth, playTurns, type PlayedTurn } from './record';
import { describe, QUIET, snap, turnLine } from './turn-log';

export type Marker = { id: string; name: string; x: number; y: number; heading: number; faction: string; player: boolean; out: boolean; combat: boolean };
export type LogEntry = { turn: number; kind: string; quiet: boolean; tone: string; text: string; raw: string; ids: string[] };
export type CardRow = [string, string];
export type CardSection = { name: string; lines: string[] };
export type Card = { id: string; title: string; rows: CardRow[]; sections: CardSection[] };
export type Hud = { money: string; worth: string; xp: number; state: string; doing: string };
export type Frame = { turn: number; markers: Marker[]; log: LogEntry[]; hud: Hud; card: Card | null };

export type SimText = {
  event(world: World, e: GameEvent): { text: string; tone: string } | null;
  truck(world: World, v: Vehicle): string;
  doing(world: World, v: Vehicle): string;
  money(cents: number): string;
  fuel(units: number): string;
  speed(tilesPerTurn: number): string;
};

export type ToSim =
  | { kind: 'start'; seed: number }
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'step' }
  | { kind: 'speed'; gapMs: number }
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
  private gapMs = 0;
  private world: World;
  private readonly turns: Generator<PlayedTurn>;

  constructor(start: World, seed: number, private readonly text: SimText, private readonly post: (message: FromSim) => void) {
    this.world = start;
    this.turns = playTurns(start, `sim seed ${seed}`, 'markov', ENDLESS, SIM_OPTIONS, FAR_MOVER);
    this.post({ kind: 'frame', frame: frameOf(start, [], this.ledger, null, text) });
  }

  handle(message: ToSim): void {
    if (message.kind === 'play') this.play();
    else if (message.kind === 'pause') this.playing = false;
    else if (message.kind === 'step') this.stepOnce();
    else if (message.kind === 'speed') this.gapMs = message.gapMs;
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
    this.world = played.next;
    for (const key of LEDGER_KEYS) this.ledger[key] += played.ledger[key];
    this.post({ kind: 'frame', frame: frameOf(this.world, played.events, this.ledger, this.watched, this.text) });
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

export function frameOf(world: World, events: readonly GameEvent[], ledger: Ledger, watched: string | null, text: SimText): Frame {
  return {
    turn: world.turn,
    markers: markersOf(world, text),
    log: logEntries(world, events, text),
    hud: hudOf(world, text),
    card: watched === null ? null : cardOf(world, watched, ledger, text),
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
    const raw = describe(world, e);
    const plain = text.event(world, e);
    return { turn: world.turn, kind: e.t, quiet: QUIET.has(e.t), tone: e.t === 'stall' ? 'bad' : plain?.tone ?? 'dim', text: plain?.text ?? raw, raw, ids: known.filter((id) => json.includes(`"${id}"`)) };
  });
}

export function cardOf(world: World, id: string, ledger: Ledger, text: SimText): Card {
  if (id === world.player.vehicleId) return playerCard(world, ledger, text);
  const v = world.vehicles.find((x) => x.id === id);
  return v ? npcCard(world, v, text) : goneCard(world, id, text);
}

function goneCard(world: World, id: string, text: SimText): Card {
  const v = world.removed.find((x) => x.id === id);
  const name = v ? text.truck(world, v) : id;
  return { id, title: `${name} has left the world`, rows: [['id', id]], sections: [] };
}

function driverlessCard(world: World, v: Vehicle, text: SimText): Card {
  const s = snap(world, v);
  return {
    id: v.id,
    title: `${text.truck(world, v)} with no driver`,
    rows: [['id', v.id], ['faction', v.faction], ['at', `${s.pos[0]}, ${s.pos[1]}`], ['order', orderText(v)], ['mean hp', `${s.hp}%`]],
    sections: [{ name: 'states', lines: s.states }, { name: 'parts', lines: partLines(v) }],
  };
}

export function npcCard(world: World, v: Vehicle, text: SimText): Card {
  const brain = v.brain;
  if (!brain) return driverlessCard(world, v, text);
  const s = snap(world, v);
  const res = getResources(world, v);
  return {
    id: v.id,
    title: text.truck(world, v),
    rows: [
      ['doing', text.doing(world, v)],
      ['id', v.id],
      ['template', brain.templateId],
      ['faction', v.faction],
      ['chassis', v.chassisId],
      ['at', `${s.pos[0]}, ${s.pos[1]}`],
      ['speed', text.speed(v.speed)],
      ['order', orderText(v)],
      ['job', v.job?.kind ?? '-'],
      ['money', text.money(res.money)],
      ['fuel', text.fuel(res.fuel)],
      ['supplies', `${s.sup}`],
      ['health', `${round(res.health)}`],
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
      { name: 'goals', lines: brain.goals.map(goalLine) },
      { name: 'states', lines: s.states },
      { name: 'parts', lines: partLines(v) },
      { name: 'goods', lines: Object.entries(goodsCount(v)).map(([good, n]) => `${good} ${n}`) },
      { name: 'memories', lines: brain.memories.map((m) => `${m.turn} ${JSON.stringify(m.fact)}`) },
    ],
  };
}

export function playerCard(world: World, ledger: Ledger, text: SimText): Card {
  const line = turnLine(world, [], ledger);
  const p = world.player;
  const me = playerVehicle(world);
  return {
    id: p.vehicleId,
    title: 'Player truck, driven by the markov bot',
    rows: [
      ['doing', text.doing(world, me)],
      ['state', line.state],
      ['chassis', line.chassis],
      ['at', `${line.pos[0]}, ${line.pos[1]}`],
      ['speed', `${text.speed(me.speed)} of ${text.speed(vehicleStats(world, me).maxSpeed)}`],
      ['order', line.order ?? '-'],
      ['money', text.money(p.money)],
      ['net worth', text.money(netWorth(world))],
      ['fuel', text.fuel(p.fuel)],
      ['supplies', `${line.sup}`],
      ['engine heat', `${line.heat}`],
      ['xp', `${Math.floor(p.xp)}`],
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
      { name: 'run ledger', lines: LEDGER_KEYS.filter((k) => ledger[k] !== 0).map((k) => `${k} ${text.money(ledger[k])}`) },
      { name: 'xp by source', lines: Object.entries(p.xpBySource).filter(([, n]) => n !== 0).map(([source, n]) => `${source} ${round(n)}`) },
    ],
  };
}

function orderText(v: Vehicle): string {
  if (!v.order) return '-';
  return 'dest' in v.order ? `${v.order.kind} ${Math.round(v.order.dest.x)}, ${Math.round(v.order.dest.y)}` : v.order.kind;
}

function goalLine(g: NpcActivity): string {
  const target = g.targetId ? ` ${g.targetId}` : '';
  const dest = g.destination ? ` to ${Math.round(g.destination.x)}, ${Math.round(g.destination.y)}` : '';
  return `${g.kind} ${g.phase}${target}${dest} ${JSON.stringify(g.reason)}`;
}

function partLines(v: Vehicle): string[] {
  return mountedParts(v).map((p) => `${p.defId} ${Math.round((100 * p.hp) / maxHp(p))}%`);
}
