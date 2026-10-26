import { isKnockedOut } from '../../sim/defeat';
import { topGoal } from '../../sim/npc-activities';
import type { SimText } from '../../sim/progression/sim-mode';
import { TIME } from '../../data/time';
import type { GameEvent, Memory, MemoryFact, NpcActivity, Vehicle, World } from '../../sim/types';
import { t, type Msg } from '../../text/msg';
import { goalText, vehicleTitle } from '../../text/names';
import { resolve } from '../../text/resolve';
import { eventText, formatVehicleState, jobLabel, vehicleName, type LogLine } from '../format';
import { fuelLiters, kph, moneyMsg } from '../units';

const english = (msg: Msg): string => resolve(msg, 'en');

function seeingAll(world: World): World {
  return { ...world, player: { ...world.player, fullLog: true } };
}

function lineText(line: LogLine): string {
  return [line.text, ...(line.spans ?? []).map((s) => s.text)].map(english).join(' ');
}

function doingOf(world: World, v: Vehicle): Msg {
  if (v.job) return jobLabel(world, v, v.job);
  if (isKnockedOut(v)) return t('npc.knockedOut');
  const goal = v.brain ? topGoal(v) : null;
  return goal ? goalText(goal.reason) : formatVehicleState(world, v);
}

const words = (id: string): string => id.replace(/([A-Z])/g, ' $1').toLowerCase();
const nameOf = (world: World, id: string): string => english(vehicleName(world, id));

type Of<K extends GameEvent['t']> = Extract<GameEvent, { t: K }>;
type Words = { [K in GameEvent['t']]?: (world: World, e: Of<K>) => { text: string; tone: string } };

const JOB_OUTCOME = { started: 'starts', done: 'finishes', cancelled: 'stops', skipped: 'skips' } as const;

function jobWords(world: World, e: Of<'job'>): string {
  const v = [...world.vehicles, ...world.removed].find((x) => x.id === e.vehicle);
  const label = v ? english(jobLabel(world, v, e.job)) : words(e.job.kind);
  return `${nameOf(world, e.vehicle)} ${JOB_OUTCOME[e.outcome]}: ${label}`;
}

const SIM_WORDS: Words = {
  job: (world, e) => ({ text: jobWords(world, e), tone: 'dim' }),
  shopMoney: (world, e) => ({ text: `${nameOf(world, e.vehicle)} ${e.amount < 0 ? 'pays' : 'gets'} ${english(moneyMsg(Math.abs(e.amount)))} for ${words(e.kind)}`, tone: 'dim' }),
  stateEnded: (world, e) => ({ text: `${nameOf(world, e.state.holder)} and ${nameOf(world, e.state.other)}: ${words(e.state.kind)} ${e.ending}`, tone: 'dim' }),
  lookedOver: (world, e) => ({ text: `${nameOf(world, e.by)} looks over ${nameOf(world, e.target)}`, tone: '' }),
  collision: (world, e) => ({ text: `${nameOf(world, e.a)} hits ${nameOf(world, e.b)}`, tone: 'bad' }),
  arrived: (world, e) => ({ text: `${nameOf(world, e.vehicle)} arrives`, tone: 'dim' }),
  spawn: (world, e) => ({ text: `${nameOf(world, e.vehicle)} enters the map`, tone: 'dim' }),
  despawn: (world, e) => ({ text: `${nameOf(world, e.vehicle)} leaves the map`, tone: 'dim' }),
  practice: (_world, e) => ({ text: `${e.xp.toFixed(1)} XP from ${words(e.source)}`, tone: 'dim' }),
  weather: (_world, e) => ({ text: `A ${words(e.event.kind)} ${e.outcome === 'started' ? 'begins' : 'ends'}`, tone: 'dim' }),
};

const PHASE = { travel: 'on the way', act: 'at it' } as const;

function goalLine(world: World, g: NpcActivity): string {
  const target = g.targetId ? `, ${nameOf(world, g.targetId)}` : '';
  return `${english(goalText(g.reason))}${target}, ${PHASE[g.phase]}`;
}

type Fact<K extends MemoryFact['kind']> = Extract<MemoryFact, { kind: K }>;
const MEMORY: { [K in MemoryFact['kind']]: (world: World, f: Fact<K>) => string } = {
  prices: (_world, f) => `Knows the prices at ${words(f.shop)}`,
  stripped: (_world, f) => `Stripped ${words(f.stock)}`,
  wronged: (world, f) => `${nameOf(world, f.by)} ${f.deed} them`,
  helped: (world, f) => `${nameOf(world, f.by)} ${f.deed} them`,
  sighting: (world, f) => `Saw ${nameOf(world, f.vehicle)} at ${Math.round(f.at.x)}, ${Math.round(f.at.y)}`,
  witnessed: (world, f) => `Saw ${nameOf(world, f.by)} ${f.offense} ${nameOf(world, f.victim)}`,
};

const TURNS_PER_HOUR = TIME.turnsPerDay / 24;

function memoryLine(world: World, m: Memory): string {
  const hours = Math.round((world.turn - m.turn) / TURNS_PER_HOUR);
  const say = MEMORY[m.fact.kind] as (world: World, f: MemoryFact) => string;
  return `${hours === 0 ? 'Just now' : `${hours} h ago`}: ${say(world, m.fact)}`;
}

function simWords(world: World, e: GameEvent): { text: string; tone: string } | null {
  const say = SIM_WORDS[e.t] as ((world: World, e: GameEvent) => { text: string; tone: string }) | undefined;
  return say ? say(world, e) : null;
}

export const SIM_TEXT: SimText = {
  event(world, e) {
    const line = eventText(seeingAll(world), e);
    return line ? { text: lineText(line), tone: line.cls } : simWords(world, e);
  },
  truck: (world, v) => english(vehicleTitle(world, v)),
  doing: (world, v) => english(doingOf(world, v)),
  name: nameOf,
  goal: goalLine,
  memory: memoryLine,
  words,
  money: (cents) => english(moneyMsg(cents)),
  fuel: (units) => `${fuelLiters(units)} L`,
  speed: (tilesPerTurn) => `${kph(tilesPerTurn)} km/h`,
};
