import { isKnockedOut } from '../../sim/defeat';
import { topGoal } from '../../sim/npc-activities';
import type { SimText } from '../../sim/progression/sim-mode';
import { TIME } from '../../data/time';
import type { GameEvent, Memory, MemoryFact, NpcActivity, Vehicle, World } from '../../sim/types';
import { t, type Msg } from '../../text/msg';
import { goalText, partName, vehicleTitle } from '../../text/names';
import { carriedPart } from '../../sim/salvage';
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

function partOf(world: World, vehicleId: string, partId: string): string {
  const part = carriedPart(world, vehicleId, partId);
  return part ? english(partName(part.defId)).toLowerCase() : 'a part';
}

function shotWords(world: World, e: Of<'shot'>): string {
  const hits = e.rounds.filter((r) => r.hit).length;
  return `${nameOf(world, e.shooter)} fires ${partOf(world, e.shooter, e.weapon)} at ${nameOf(world, e.target)}, ${hits} of ${e.rounds.length} hit`;
}

const SIM_WORDS: Words = {
  shot: (world, e) => ({ text: shotWords(world, e), tone: 'bad' }),
  empty: (world, e) => ({ text: `${nameOf(world, e.vehicle)} runs out of ammo for ${partOf(world, e.vehicle, e.weapon)}`, tone: 'dim' }),
  asked: (world, e) => ({ text: `${nameOf(world, e.by)} asks ${nameOf(world, e.of)} about ${nameOf(world, e.target)}${e.told ? ' and learns where it is' : ' and learns nothing'}`, tone: 'dim' }),
  hostile: (world, e) => ({ text: `${nameOf(world, e.vehicle)} turns hostile to ${nameOf(world, e.against)}`, tone: 'bad' }),
  joins: (world, e) => ({ text: `${nameOf(world, e.vehicle)} joins the fight against ${nameOf(world, e.against)} for ${nameOf(world, e.victim)}`, tone: 'bad' }),
  destroyed: (world, e) => ({ text: `${nameOf(world, e.by)} destroys ${nameOf(world, e.vehicle)}`, tone: 'bad' }),
  partDisabled: (world, e) => ({ text: `${nameOf(world, e.vehicle)} loses ${partOf(world, e.vehicle, e.part)}`, tone: 'bad' }),
  transfer: (world, e) => ({ text: `${nameOf(world, e.from)} pays ${nameOf(world, e.to)} ${english(moneyMsg(e.amount))}`, tone: 'dim' }),
  holdUp: (world, e) => ({ text: `${nameOf(world, e.robber)} robs ${nameOf(world, e.victim)} of ${e.paid === 'money' ? english(moneyMsg(e.value)) : 'cargo'}`, tone: 'bad' }),
  found: (world, e) => ({ text: `${nameOf(world, e.vehicle)} finds ${foundWords(e)} at ${words(e.stock)}`, tone: 'good' }),
  preyPassed: (world, e) => ({ text: `${nameOf(world, e.vehicle)} lets ${nameOf(world, e.prey)} pass, ${words(e.reason)}`, tone: 'dim' }),
  bountyFiled: (world, e) => ({ text: `${nameOf(world, e.reporter)} reports ${nameOf(world, e.target)} for ${words(e.offense)}`, tone: '' }),
  bountyClosed: (world, e) => ({ text: `The case on ${nameOf(world, e.target)} closes, ${words(e.status)}`, tone: '' }),
  huntWithdrawn: (world, e) => ({ text: `${nameOf(world, e.by)} gives up the hunt for ${nameOf(world, e.target)}`, tone: 'dim' }),
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

function targetName(world: World, id: string): string {
  return [...world.vehicles, ...world.removed].some((v) => v.id === id) ? nameOf(world, id) : words(id);
}

const PHASE ={ travel: 'on the way', act: 'at it' } as const;

function goalLine(world: World, g: NpcActivity): string {
  const target = g.targetId ? `, ${targetName(world, g.targetId)}` : '';
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

function foundWords(e: Of<'found'>): string {
  const goods = Object.entries(e.goods).map(([good, n]) => `${n} ${words(good)}`);
  const all = [...goods, ...(e.parts.length > 0 ? [`${e.parts.length} parts`] : []), ...(e.fuel > 0 ? ['fuel'] : []), ...(e.supplies > 0 ? ['supplies'] : [])];
  return all.length > 0 ? all.join(', ') : 'nothing';
}

function simWords(world: World, e: GameEvent): { text: string; tone: string } {
  const say = SIM_WORDS[e.t] as ((world: World, e: GameEvent) => { text: string; tone: string }) | undefined;
  return say ? say(world, e) : { text: fieldWords(world, e), tone: 'dim' };
}

function fieldWords(world: World, e: GameEvent): string {
  const known = new Set([...world.vehicles, ...world.removed].map((v) => v.id));
  const fields = Object.entries(e).filter(([key]) => key !== 't').flatMap(([key, value]) => fieldWord(world, known, key, value));
  return fields.length > 0 ? `${capital(words(e.t))}: ${fields.join(', ')}` : capital(words(e.t));
}

function fieldWord(world: World, known: Set<string>, key: string, value: unknown): string[] {
  if (typeof value === 'string') return [`${words(key)} ${known.has(value) ? nameOf(world, value) : words(value)}`];
  if (typeof value === 'number') return [`${words(key)} ${Math.round(value * 10) / 10}`];
  if (typeof value === 'boolean') return [`${words(key)} ${value ? 'yes' : 'no'}`];
  return [];
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

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
