import { TIME } from '../../data/time';
import { MAIN_SKILL, MAX_RANK, SKILL_IDS, TARGET_DAYS, TARGET_TOLERANCE, XP_SOURCES } from '../../data/skills';
import { accrueXp, cumulativeCost, type SkillProgress } from '../progress';
import type { SkillId, XpSource } from '../types';
import { isArchetype, type Archetype } from './bot';
import { LEDGER_KEYS } from './orders';
import type { DayRow, RunEnd, RunFailure, TraceLine } from './record';

export type FamilyXp = { total: number; perDay: number };
export type PooledCurve = { total: number; perDay: number; one: (number | null)[]; every: (number | null)[] };
export type Curve = { families: Record<SkillId, FamilyXp>; pooled: PooledCurve };

export function replay(trace: readonly TraceLine[], turns: number): Curve {
  requireTurnOrder(trace, turns);
  const progress = freshProgress();
  const earned = zeroBySkill();
  const one = emptyRankDays();
  const every = emptyRankDays();
  let pooled = 0;
  for (const line of trace) {
    const xp = accrueXp(progress, line.source, line.amount, line.difficulty, line.target, line.turn);
    earned[XP_SOURCES[line.source].skill] += xp;
    pooled += xp;
    markReached(one, pooled, 1, line.turn);
    markReached(every, pooled, SKILL_IDS.length, line.turn);
  }
  const days = turns / TIME.workDayTurns;
  const families = Object.fromEntries(SKILL_IDS.map((id) => [id, { total: earned[id], perDay: earned[id] / days }])) as Record<SkillId, FamilyXp>;
  return { families, pooled: { total: pooled, perDay: pooled / days, one, every } };
}

function emptyRankDays(): (number | null)[] {
  return new Array<number | null>(MAX_RANK).fill(null);
}

function markReached(days: (number | null)[], pooled: number, skills: number, turn: number): void {
  for (let rank = 1; rank <= MAX_RANK; rank++) {
    if (days[rank - 1] === null && pooled >= skills * cumulativeCost(rank)) days[rank - 1] = turn;
  }
}

function requireTurnOrder(trace: readonly TraceLine[], turns: number): void {
  if (!Number.isInteger(turns) || turns <= 0) throw new Error(`Replay needs a positive whole number of turns, got ${turns}`);
  let lastTurn = 0;
  for (const line of trace) {
    if (line.turn < lastTurn) throw new Error(`Trace line at turn ${line.turn} is out of turn order after turn ${lastTurn}`);
    if (line.turn > turns + 1) throw new Error(`Trace line at turn ${line.turn} is past the end of a ${turns} turn run`);
    lastTurn = line.turn;
  }
}

function zeroBySkill(): Record<SkillId, number> {
  return { driving: 0, perception: 0, machining: 0, toughness: 0, social: 0 };
}

function freshProgress(): SkillProgress {
  return { xp: 0, xpToday: zeroBySkill(), xpWindow: 0, repeats: {} };
}

export function parseTraceLine(value: unknown): TraceLine {
  const { turn, source, amount, difficulty, target } = asRecord(value);
  if (!Number.isInteger(turn) || !isXpSource(source) || typeof amount !== 'number' || !isDifficulty(difficulty) || typeof target !== 'string') {
    throw new Error(`Bad trace line ${JSON.stringify(value)}`);
  }
  return { turn: turn as number, source, amount, difficulty, target };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`Trace line ${JSON.stringify(value)} is not an object`);
  return value as Record<string, unknown>;
}

function isXpSource(value: unknown): value is XpSource {
  return typeof value === 'string' && Object.hasOwn(XP_SOURCES, value);
}

function isDifficulty(value: unknown): value is number | null {
  return value === null || typeof value === 'number';
}

export function parseRunEnd(value: unknown): RunEnd | RunFailure | null {
  const entry = asRecord(value);
  if (!('end' in entry)) return null;
  if (!Number.isInteger(entry.turn)) throw new Error(`Bad run end ${JSON.stringify(value)}`);
  const turn = entry.turn as number;
  if (entry.end === 'death') return { end: 'death', turn };
  if (entry.end === 'error' && typeof entry.message === 'string') return { end: 'error', turn, message: entry.message };
  throw new Error(`Bad run end ${JSON.stringify(value)}`);
}

export function targetMisses(curve: Curve, archetype: Archetype, turns: number): string[] {
  if (!Object.hasOwn(MAIN_SKILL, archetype)) throw new Error(`No main skill entry for archetype ${archetype}`);
  const kind = MAIN_SKILL[archetype] === null ? 'every' : 'one';
  const table: Partial<Record<number, number>> = TARGET_DAYS[kind];
  return Object.entries(table).flatMap(([rank, day]) => levelMiss(kind, Number(rank), day!, curve.pooled[kind][Number(rank) - 1], turns));
}

function levelMiss(kind: 'one' | 'every', level: number, day: number, reached: number | null, turns: number): string[] {
  const at = reached === null ? 'never' : `day ${(reached / TIME.workDayTurns).toFixed(1)}`;
  const verdict = missVerdict(day * TIME.workDayTurns, reached, turns);
  return verdict ? [`${kind} skill rank ${level}: ${at}, target day ${day}, ${verdict}`] : [];
}

function missVerdict(target: number, reached: number | null, turns: number): 'too early' | 'too late' | null {
  const late = target * (1 + TARGET_TOLERANCE);
  if (reached === null) return late <= turns ? 'too late' : null;
  if (reached < target * (1 - TARGET_TOLERANCE)) return 'too early';
  return reached > late ? 'too late' : null;
}

export type Run = { archetype: Archetype; seed: number; turns: number; death: number | null; error: RunFailure | null; trace: TraceLine[]; rows: DayRow[] };

export function parseRun(values: readonly unknown[], label: string): Run {
  const [first, ...rest] = values;
  if (first === undefined) throw new Error(`${label} is empty`);
  const header = parseHeader(first, label);
  const end = rest.length > 0 ? parseRunEnd(rest[rest.length - 1]) : null;
  const body = end ? rest.slice(0, -1) : rest;
  if (body.some((value) => parseRunEnd(value))) throw new Error(`${label} has lines after its end marker`);
  const trace = body.filter((value) => !isDayRow(value)).map(parseTraceLine);
  const rows = body.filter(isDayRow).map(parseDayRow);
  return { ...header, ...ending(end, header.turns), trace, rows };
}

function ending(end: RunEnd | RunFailure | null, turns: number): Pick<Run, 'turns' | 'death' | 'error'> {
  if (!end) return { turns, death: null, error: null };
  return { turns: end.turn, death: end.end === 'death' ? end.turn : null, error: end.end === 'error' ? end : null };
}

function isDayRow(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'day' in value;
}

const ROW_NUMBERS = ['day', 'turns', 'money', 'netWorth', 'tier', 'fightsWon', 'knockouts', 'gearLost', 'deaths', 'stalls'] as const;

export function parseDayRow(value: unknown): DayRow {
  const row = asRecord(value);
  for (const key of ROW_NUMBERS) if (typeof row[key] !== 'number') throw new Error(`Bad economy row ${JSON.stringify(value)}: ${key} is not a number`);
  if (!isLedger(row.ledger)) throw new Error(`Bad economy row ${JSON.stringify(value)}: ledger lacks a key`);
  if (!isWorth(row.worth)) throw new Error(`Bad economy row ${JSON.stringify(value)}: worth lacks a key`);
  if (typeof row.chassis !== 'string') throw new Error(`Bad economy row ${JSON.stringify(value)}: chassis is not a string`);
  return row as unknown as DayRow;
}

export const WORTH_KEYS = ['money', 'cargo', 'gear', 'storage', 'chassis'] as const;

function isWorth(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  return WORTH_KEYS.every((key) => typeof (value as Record<string, unknown>)[key] === 'number');
}

function isLedger(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  return LEDGER_KEYS.every((key) => typeof (value as Record<string, unknown>)[key] === 'number');
}

function parseHeader(value: unknown, label: string): Pick<Run, 'archetype' | 'seed' | 'turns'> {
  const { archetype, seed, turns } = asRecord(value);
  if (typeof archetype !== 'string' || !isArchetype(archetype) || !Number.isInteger(seed) || !Number.isInteger(turns)) throw new Error(`${label} has a bad header ${JSON.stringify(value)}`);
  return { archetype, seed: seed as number, turns: turns as number };
}
