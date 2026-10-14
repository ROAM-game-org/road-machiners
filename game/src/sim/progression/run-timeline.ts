import { StreamReader, type Fields, type StreamLine } from '../run-stream';
import { clockOf } from '../sun';
import { dist } from '../vec';

export const STALL_TURNS = 20;
export const STALL_RADIUS = 2;
export const FIGHT_GAP_TURNS = 3;

export type Grouping = 'day' | 'stretch';
type Entry = { turn: number; text: string };
type OrderRun = { first: number; last: number; count: number; text: string };
type Damage = Record<string, number>;
type Fight = { a: string; b: string; from: number; last: number; rounds: Damage; hits: Damage; damage: Damage; rams: number; ramDamage: Damage; disabled: number };
type Track = { id: string; from: number; anchor: [number, number]; order: string; last: number };
type Holdings = { parts: Map<string, string>; goods: Damage; money: number };

const NOTED_EVENTS = new Set(['death', 'knockout', 'wake', 'runLost', 'roadOpened', 'outpostReached', 'destroyed', 'npcKnockout']);
const ORDER_KEYS = ['order', 'guns', 'utils'] as const;
const sum = (values: Damage | undefined) => Object.values(values ?? {}).reduce((a, b) => a + b, 0);

function lastIndexBySession(records: readonly StreamLine[]): Map<string, number> {
  const last = new Map<string, number>();
  records.forEach((record, at) => last.set(String(record.sid), at));
  return last;
}

function survives(kept: StreamLine, session: StreamLine, at: number, last: ReadonlyMap<string, number>): boolean {
  if (kept.turn <= session.turn) return true;
  return kept.sid !== session.sid && (last.get(String(kept.sid)) ?? -1) > at;
}

export function linearize(records: readonly StreamLine[]): StreamLine[] {
  const usable = records.slice(firstSession(records));
  const last = lastIndexBySession(usable);
  let out: StreamLine[] = [];
  usable.forEach((record, at) => {
    if (record.kind === 'session') out = out.filter((kept) => survives(kept, record, at, last));
    if (record.kind !== 'header') out.push(record);
  });
  return out;
}

function firstSession(records: readonly StreamLine[]): number {
  const at = records.findIndex((record) => record.kind === 'session');
  return at < 0 ? records.length : at;
}

export function skippedBeforeSession(records: readonly StreamLine[]): number {
  return records.slice(0, firstSession(records)).filter((record) => record.kind !== 'header').length;
}

function add(into: Damage, key: string, amount: number): void {
  into[key] = (into[key] ?? 0) + amount;
}

function sumPatch(patch: unknown): Damage {
  return (patch ?? {}) as Damage;
}

class Timeline {
  readonly entries: Entry[] = [];
  private readonly reader = new StreamReader();
  private readonly names = new Map<string, string>();
  private readonly fights = new Map<string, Fight>();
  private readonly tracks = new Map<string, Track>();
  private readonly orderRuns = new Map<string, OrderRun>();
  private readonly hitsTaken: { turn: number; id: string }[] = [];
  private held: Holdings | null = null;
  private turn = -1;
  readonly openings: { turn: number; stretch: number }[] = [];
  private sessions = 0;
  private before = new Set<string>();
  private keyframe = false;

  feed(line: StreamLine): void {
    if (line.turn !== this.turn) this.endTurn();
    this.turn = line.turn;
    if (line.kind !== 'enter' && line.kind !== 'player') this.keyframe = false;
    const handler = HANDLERS[line.kind];
    if (handler) handler(this, line);
    this.reader.apply(line);
  }

  finish(): void {
    this.endTurn();
    for (const fight of this.fights.values()) this.closeFight(fight);
    for (const [id, run] of [...this.orderRuns]) this.closeOrders(id, run);
    for (const track of this.tracks.values()) this.closeTrack(track, this.turn);
  }

  session(line: StreamLine): void {
    this.sessions += 1;
    this.keyframe = true;
    this.before = new Set(this.reader.trucks.keys());
    this.remember(line);
  }

  private remember(line: StreamLine): void {
    this.entries.push({ turn: line.turn, text: `session from ${line.from} (${line.mode}, seed ${line.seed}, version ${line.version})` });
  }

  enter(line: StreamLine): void {
    const id = line.id as string;
    const seenBefore = this.names.has(id);
    this.names.set(id, `${line.faction}/${line.template ?? line.driver ?? 'own'}/${line.chassis} ${id}`);
    if (line.faction === 'player' || (this.keyframe && this.before.has(id))) return;
    const where = line.pos as [number, number];
    this.note(`${this.arrivalWord(seenBefore)}: ${this.label(id)} at ${where[0]},${where[1]}`);
  }

  private arrivalWord(seenBefore: boolean): string {
    if (this.keyframe && this.sessions === 1) return 'in view at start';
    return seenBefore ? 'came back into view' : 'came into view';
  }

  leave(line: StreamLine): void {
    const id = line.id as string;
    if (this.reader.truck(id).faction === 'player') return;
    if (line.why !== 'unseen' && line.why !== 'window') this.note(`${this.label(id)} ${line.why}`);
  }

  change(line: StreamLine): void {
    const id = line.id as string;
    if (this.reader.truck(id).faction !== 'player') return;
    const parts = ORDER_KEYS.filter((key) => key in line).map((key) => `${key} ${key === 'order' ? String(line[key]) : JSON.stringify(line[key])}`);
    if (parts.length > 0) this.extendOrders(id, parts.join(', '));
  }

  private extendOrders(id: string, text: string): void {
    const run = this.orderRuns.get(id);
    if (run && this.turn - run.last <= 1) {
      Object.assign(run, { last: this.turn, count: run.count + 1, text });
      return;
    }
    if (run) this.closeOrders(id, run);
    this.orderRuns.set(id, { first: this.turn, last: this.turn, count: 1, text });
  }

  private closeOrders(id: string, run: OrderRun): void {
    this.orderRuns.delete(id);
    const many = run.count > 1 ? `${run.count} order changes (T${run.first}-T${run.last}), last: ` : '';
    this.entries.push({ turn: run.first, text: `${this.label(id)} ${many}${run.text}` });
  }

  event(line: StreamLine): void {
    if (line.t === 'shot') this.shot(line);
    if (line.t === 'collision') this.collision(line);
    if (line.t === 'roadOpened') this.openings.push({ turn: line.turn, stretch: line.stretch as number });
    if (NOTED_EVENTS.has(line.t as string)) this.note(this.eventText(line));
  }

  private eventText(line: StreamLine): string {
    const skipped = new Set(['kind', 'turn', 't']);
    const facts = Object.entries(line).filter(([key, value]) => !skipped.has(key) && (typeof value === 'string' || typeof value === 'number'));
    return [line.t, ...facts.map(([key, value]) => `${key} ${typeof value === 'string' ? this.label(value) : value}`)].join(', ');
  }

  private note(text: string): void {
    this.entries.push({ turn: this.turn, text });
  }

  private label(id: string): string {
    return this.names.get(id) ?? id;
  }

  private fightOf(a: string, b: string): Fight {
    const key = [a, b].sort().join('|');
    const open = this.fights.get(key);
    if (open && this.turn - open.last <= FIGHT_GAP_TURNS) return open;
    if (open) this.closeFight(open);
    const fresh: Fight = { a, b, from: this.turn, last: this.turn, rounds: {}, hits: {}, damage: {}, rams: 0, ramDamage: {}, disabled: 0 };
    this.fights.set(key, fresh);
    return fresh;
  }

  private shot(line: StreamLine): void {
    const shooter = line.shooter as string;
    const target = line.target as string;
    const fight = this.fightOf(shooter, target);
    fight.last = this.turn;
    add(fight.rounds, shooter, line.rounds as number);
    add(fight.hits, shooter, line.hits as number);
    add(fight.damage, shooter, sum(sumPatch(line.dmg)));
    fight.disabled += (line.disabled as string[]).length;
    if (this.reader.trucks.get(target)?.faction === 'player') this.hitsTaken.push({ turn: this.turn, id: target });
  }

  private collision(line: StreamLine): void {
    const a = line.a as string;
    const b = line.b as string;
    const fight = this.fightOf(a, b);
    fight.last = this.turn;
    fight.rams += 1;
    add(fight.ramDamage, a, sum(sumPatch(line.dmgA)));
    add(fight.ramDamage, b, sum(sumPatch(line.dmgB)));
  }

  private fightText(f: Fight): string {
    const fired = [f.a, f.b].filter((id) => f.rounds[id]).map((id) => `${this.label(id)} fired ${f.rounds[id]} rounds, ${f.hits[id] ?? 0} hits, ${f.damage[id] ?? 0} damage`);
    const rams = f.rams > 0 ? [`${f.rams} rams, damage taken ${this.label(f.a)} ${f.ramDamage[f.a] ?? 0}, ${this.label(f.b)} ${f.ramDamage[f.b] ?? 0}`] : [];
    const disabled = f.disabled > 0 ? [`${f.disabled} parts disabled`] : [];
    return `fight T${f.from}-T${f.last}, ${this.label(f.a)} against ${this.label(f.b)}: ${[...fired, ...rams, ...disabled].join('; ')}`;
  }

  private closeFight(f: Fight): void {
    this.entries.push({ turn: f.from, text: this.fightText(f) });
  }

  private endTurn(): void {
    if (this.turn < 0) return;
    for (const [key, fight] of this.fights) {
      if (this.turn - fight.last <= FIGHT_GAP_TURNS) continue;
      this.closeFight(fight);
      this.fights.delete(key);
    }
    for (const [id, run] of [...this.orderRuns]) if (run.last < this.turn) this.closeOrders(id, run);
    this.trackOwned();
    this.trackHoldings();
  }

  private ownedTrucks(): [string, Fields][] {
    return [...this.reader.trucks].filter(([, fields]) => fields.faction === 'player');
  }

  private trackOwned(): void {
    for (const [id, fields] of this.ownedTrucks()) this.trackTruck(id, fields);
  }

  private trackTruck(id: string, fields: Fields): void {
    const pos = fields.pos as [number, number];
    const track = this.tracks.get(id);
    if (track && dist({ x: pos[0], y: pos[1] }, { x: track.anchor[0], y: track.anchor[1] }) <= STALL_RADIUS) {
      track.last = this.turn;
      track.order = String(fields.order);
      return;
    }
    if (track) this.closeTrack(track, this.turn - 1);
    this.tracks.set(id, { id, from: this.turn, anchor: pos, order: String(fields.order), last: this.turn });
  }

  private closeTrack(track: Track, end: number): void {
    const turns = end - track.from + 1;
    if (turns < STALL_TURNS) return;
    const hits = this.hitsTaken.filter((h) => h.id === track.id && h.turn >= track.from && h.turn <= end).length;
    this.entries.push({ turn: track.from, text: `${this.label(track.id)} made no progress: within ${STALL_RADIUS} tiles of ${track.anchor[0]},${track.anchor[1]} for ${turns} turns (T${track.from}-T${end}), last order ${track.order}, ${hits} hits taken` });
  }

  private holdingsNow(): Holdings {
    const parts = new Map<string, string>();
    const goods: Damage = {};
    for (const [, fields] of this.ownedTrucks()) {
      for (const [id, label] of Object.entries(fields.parts as Record<string, string>)) parts.set(id, label.split(':')[0]);
      for (const [good, count] of Object.entries(fields.goods as Damage)) add(goods, good, count);
    }
    for (const [id, label] of Object.entries((this.reader.player.storage ?? {}) as Record<string, string>)) parts.set(id, label.split(':')[0]);
    return { parts, goods, money: this.reader.player.money as number };
  }

  private trackHoldings(): void {
    const now = this.holdingsNow();
    const before = this.held;
    this.held = now;
    if (before === null) return;
    const text = holdingsText(before, now);
    if (text !== '') this.note(`holdings changed: ${text}`);
  }
}

function listDiff(from: Map<string, string>, to: Map<string, string>): string[] {
  return [...to].filter(([id]) => !from.has(id)).map(([, def]) => def);
}

function goodsDiff(before: Damage, now: Damage): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(now)]);
  return [...keys].map((key) => [key, (now[key] ?? 0) - (before[key] ?? 0)] as const).filter(([, delta]) => delta !== 0).map(([key, delta]) => `${delta > 0 ? '+' : ''}${delta} ${key}`);
}

function holdingsText(before: Holdings, now: Holdings): string {
  const gained = listDiff(before.parts, now.parts);
  const lost = listDiff(now.parts, before.parts);
  const goods = goodsDiff(before.goods, now.goods);
  if (gained.length + lost.length + goods.length === 0) return '';
  const spent = now.money - before.money;
  const pieces = [spent === 0 ? '' : `money ${spent} (now ${now.money})`, gained.length > 0 ? `gained ${gained.join(', ')}` : '', lost.length > 0 ? `lost ${lost.join(', ')}` : '', goods.length > 0 ? `goods ${goods.join(', ')}` : ''];
  return pieces.filter((piece) => piece !== '').join('; ');
}

type Handler = (timeline: Timeline, line: StreamLine) => void;

const HANDLERS: Record<string, Handler> = {
  session: (t, line) => t.session(line),
  enter: (t, line) => t.enter(line),
  leave: (t, line) => t.leave(line),
  change: (t, line) => t.change(line),
  event: (t, line) => t.event(line),
};

function stretchAt(openings: readonly { turn: number; stretch: number }[], turn: number): number {
  return openings.filter((o) => o.turn <= turn).reduce((_, o) => o.stretch, 0);
}

function sectionKey(entry: Entry, by: Grouping, openings: readonly { turn: number; stretch: number }[]): number {
  return by === 'day' ? clockOf(entry.turn).day : stretchAt(openings, entry.turn);
}

function sectionTitle(key: number, by: Grouping): string {
  if (by === 'day') return `Day ${key}`;
  return key === 0 ? 'Before the first road opening' : `Stretch ${key}`;
}

function timelinesBySession(records: readonly StreamLine[]): Timeline[] {
  const bySession = new Map<string, Timeline>();
  for (const line of linearize(records)) {
    const sid = String(line.sid);
    const tl = bySession.get(sid) ?? new Timeline();
    bySession.set(sid, tl);
    tl.feed(line);
  }
  const all = [...bySession.values()];
  all.forEach((tl) => tl.finish());
  return all;
}

export function timeline(records: readonly StreamLine[], by: Grouping): string[] {
  const all = timelinesBySession(records);
  const openings = all.flatMap((tl) => tl.openings).sort((a, b) => a.turn - b.turn);
  const sections = new Map<number, string[]>();
  for (const entry of all.flatMap((tl) => tl.entries).sort((a, b) => a.turn - b.turn)) {
    const key = sectionKey(entry, by, openings);
    sections.set(key, [...(sections.get(key) ?? []), `T${entry.turn} ${entry.text}`]);
  }
  return [...sections].flatMap(([key, lines]) => [`== ${sectionTitle(key, by)} ==`, ...lines]);
}
