import { isKnockedOut } from '../../sim/defeat';
import { gridSquareOf } from '../../sim/map-grid';
import { topGoal } from '../../sim/npc-activities';
import type { SimText, Spoken } from '../../sim/progression/sim-mode';
import type { StockCause } from '../../sim/market';
import type { RecipeRun } from '../../sim/production';
import type { EconTag } from '../../sim/progression/sim-economy';
import { carriedPart } from '../../sim/salvage';
import type { SiteEventKind } from '../../data/market';
import { everyTruck, namedTruck, worldPlaces } from '../../sim/sites';
import { TIME } from '../../data/time';
import type { TraitId } from '../../data/npcs';
import type { UtilityEffectType } from '../../data/parts';
import type { Faction, GameEvent, RoadNewsKind, Memory, MemoryFact, NpcActivity, SkillId, StateEnding, StateKindId, Vehicle, World } from '../../sim/types';
import type { Vec } from '../../sim/vec';
import { t, type Msg } from '../../text/msg';
import { chassisName, factionName, goalText, goodName, partName, siteName, skillName, templateName, traitName, vehicleTitle } from '../../text/names';
import { resolve } from '../../text/resolve';
import { contractSummary, eventText, formatVehicleState, gridSquareText, jobLabel, vehicleName, type LogLine } from '../format';
import { distanceText, engineCelsius, fuelLiters, kph, moneyMsg } from '../units';

const english = (msg: Msg): string => resolve(msg, 'en');
const PLAYER_NAME = english(t('vehicle.yours'));

function seeingAll(world: World): World {
  return { ...world, player: { ...world.player, fullLog: true } };
}

function lineText(line: LogLine): string {
  return english(line.text);
}

function doingOf(world: World, v: Vehicle): Msg {
  if (v.job) return jobLabel(world, v, v.job);
  if (isKnockedOut(v)) return t('npc.knockedOut');
  const goal = v.brain ? topGoal(v) : null;
  return goal ? goalText(goal.reason) : formatVehicleState(world, v);
}

const words = (id: string): string => id.replace(/([A-Z])/g, ' $1').toLowerCase();
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const place = (pos: Vec): string => english(gridSquareText(gridSquareOf(pos)));

function nameOf(world: World, id: string): string {
  return id === world.player.vehicleId ? PLAYER_NAME : english(vehicleName(world, id));
}

const PROP_ID = /^([a-z][a-zA-Z]*)-\d+$/;
const ID_LIKE = /\d/;

function thingName(world: World, id: string): string {
  const prop = PROP_ID.exec(id);
  return prop && !namedTruck(world, id) ? `a ${words(prop[1]!)}` : nameOf(world, id);
}

function stockText(world: World, id: string): string {
  const stock = world.salvage.find((s) => s.id === id);
  return stock ? `salvage in ${place(stock.pos)}` : 'salvage that is gone now';
}

function targetName(world: World, id: string): string {
  if (namedTruck(world, id)) return nameOf(world, id);
  if (world.salvage.some((s) => s.id === id)) return stockText(world, id);
  return worldPlaces(world).some((s) => s.id === id) ? english(siteName(id)) : thingName(world, id);
}

type Of<K extends GameEvent['t']> = Extract<GameEvent, { t: K }>;
type Words = { [K in GameEvent['t']]?: (world: World, e: Of<K>) => Spoken };

const JOB_OUTCOME = { started: 'starts', done: 'finishes', cancelled: 'stops', skipped: 'skips' } as const;

function jobWords(world: World, e: Of<'job'>): string {
  const v = namedTruck(world, e.vehicle);
  const label = v ? english(jobLabel(world, v, e.job)) : words(e.job.kind);
  return `${nameOf(world, e.vehicle)} ${JOB_OUTCOME[e.outcome]}: ${label}`;
}

function partOf(world: World, vehicleId: string, partId: string): string {
  const part = carriedPart(world, vehicleId, partId);
  return part ? english(partName(part.defId)).toLowerCase() : 'a part';
}

function contractText(world: World, id: string): string {
  const held = world.player.contracts.find((c) => c.id === id);
  return held ? english(contractSummary(held)) : 'a contract that is closed now';
}

function shotWords(world: World, e: Of<'shot'>): string {
  const hits = e.rounds.filter((r) => r.hit).length;
  return `${nameOf(world, e.shooter)} fires ${partOf(world, e.shooter, e.weapon)} at ${nameOf(world, e.target)}, ${hits} of ${e.rounds.length} hit`;
}

function foundWords(e: Of<'found'>): string {
  const goods = Object.entries(e.goods).map(([good, n]) => `${n} ${english(goodName(good)).toLowerCase()}`);
  const all = [...goods, ...(e.parts.length > 0 ? [`${e.parts.length} parts`] : []), ...(e.fuel > 0 ? ['fuel'] : []), ...(e.supplies > 0 ? ['supplies'] : [])];
  return all.length > 0 ? all.join(', ') : 'nothing';
}

const STATE: Record<StateKindId, string> = {
  feud: 'feud', backedOff: 'backing off', tow: 'tow', turnedDown: 'turned down', towPromise: 'tow promise', answering: 'radio answer', patch: 'patch job',
  truce: 'truce', grievance: 'grievance', plea: 'plea', helpRefused: 'refused help', trade: 'trade', handover: 'handover', revenge: 'revenge', escort: 'escort',
  strayFire: 'stray fire grudge', aid: 'aid', combat: 'fight', lootWarning: 'loot warning', crew: 'crew', hire: 'hire', cavalcade: 'cavalcade', offering: 'offering',
  drag: 'drag', lookOver: 'look over', sizedUp: 'sizing up', bountyStop: 'bounty stop',
};
const ENDING: Record<StateEnding, string> = { expired: 'ran out', fulfilled: 'done', broken: 'broken off' };
const QUIET_STATES = new Set<StateKindId>(['sizedUp', 'lookOver']);

type Activity = NpcActivity['kind'];
const ACTIVITY: Record<Activity, string> = {
  scavenge: 'scavenges', prowl: 'prowls', sell: 'goes to sell', trade: 'goes to trade', resupply: 'resupplies', raid: 'raids', fight: 'fights', flee: 'flees',
  wait: 'waits', investigate: 'investigates', tow: 'tows', loot: 'loots', repair: 'repairs', patch: 'patches', meet: 'goes to meet', retreat: 'retreats',
  rearm: 'rearms', patrol: 'patrols', travel: 'travels', explore: 'explores', follow: 'follows', claim: 'claims', muster: 'musters', sizeUp: 'sizes up', pursue: 'pursues',
};
const activityVerb = (kind: Activity | null): string => (kind === null ? 'idles' : ACTIVITY[kind]);

const UTILITY: Record<UtilityEffectType | 'claymore', string> = {
  oil: 'drops oil', caltrops: 'drops caltrops', flare: 'fires a flare', mortar: 'fires the mortar', crane: 'works the crane', emitter: 'runs the emitter',
  scraper: 'runs the scraper', sprout: 'sets a sprout', claymore: 'sets a claymore',
};

const PLEA_ANSWER = { true: 'and gets it', false: 'and is refused', null: '' } as const;

const SIM_FIRST: Words = {
  shot: (world, e) => ({ text: shotWords(world, e), tone: 'bad' }),
  plea: (world, e) => ({ text: `${nameOf(world, e.from)} begs ${nameOf(world, e.to)} for ${e.plea} ${PLEA_ANSWER[`${e.accepted}`]}`.trim(), tone: '' }),
  preyPassed: (world, e) => ({ text: `${nameOf(world, e.vehicle)} lets ${nameOf(world, e.prey)} pass: ${english(t(`pass.${e.reason}`))}`, tone: 'dim' }),
  activity: (world, e) => ({ text: `${nameOf(world, e.vehicle)} ${activityVerb(e.activity)}: ${english(goalText(e.reason))}`, tone: 'dim' }),
  stall: (world, e) => ({ text: `Bug: ${nameOf(world, e.vehicle)} got stuck and gave up. It ${activityVerb(e.goal)}: ${english(goalText(e.reason))}`, tone: 'bad' }),
};

const SIM_WORDS: Words = {
  empty: (world, e) => ({ text: `${nameOf(world, e.vehicle)} runs out of ammo for ${partOf(world, e.vehicle, e.weapon)}`, tone: 'dim' }),
  asked: (world, e) => ({ text: `${nameOf(world, e.by)} asks ${nameOf(world, e.of)} about ${nameOf(world, e.target)}${e.told ? ' and learns where it is' : ' and learns nothing'}`, tone: 'dim' }),
  hostile: (world, e) => ({ text: `${nameOf(world, e.vehicle)} turns hostile to ${nameOf(world, e.against)}`, tone: 'bad' }),
  joins: (world, e) => ({ text: `${nameOf(world, e.vehicle)} joins the fight against ${nameOf(world, e.against)} for ${nameOf(world, e.victim)}`, tone: 'bad' }),
  destroyed: (world, e) => ({ text: `${nameOf(world, e.by)} destroys ${nameOf(world, e.vehicle)}`, tone: 'bad' }),
  partDisabled: (world, e) => ({ text: `${nameOf(world, e.vehicle)} loses ${partOf(world, e.vehicle, e.part)}`, tone: 'bad' }),
  breakdown: (world, e) => ({ text: `${nameOf(world, e.vehicle)}: ${partOf(world, e.vehicle, e.part)} breaks down`, tone: 'bad' }),
  utility: (world, e) => ({ text: `${nameOf(world, e.vehicle)} ${UTILITY[e.effect]}`, tone: 'dim' }),
  transfer: (world, e) => ({ text: `${nameOf(world, e.from)} pays ${nameOf(world, e.to)} ${english(moneyMsg(e.amount))}`, tone: 'dim' }),
  holdUp: (world, e) => ({ text: `${nameOf(world, e.robber)} robs ${nameOf(world, e.victim)} of ${e.paid === 'money' ? english(moneyMsg(e.value)) : 'cargo'}`, tone: 'bad' }),
  found: (world, e) => ({ text: `${nameOf(world, e.vehicle)} finds ${foundWords(e)} from ${stockText(world, e.stock)}`, tone: 'good' }),
  bountyFiled: (world, e) => ({ text: `${nameOf(world, e.reporter)} reports ${nameOf(world, e.target)} for ${words(e.offense)}`, tone: '' }),
  bountyClosed: (world, e) => ({ text: `The case on ${nameOf(world, e.target)} closes, ${words(e.status)}`, tone: '' }),
  huntWithdrawn: (world, e) => ({ text: `${nameOf(world, e.by)} gives up the hunt for ${nameOf(world, e.target)}`, tone: 'dim' }),
  claimRival: (world, e) => ({ text: `${nameOf(world, e.vehicle)} goes after your claim: ${contractText(world, e.contract)}`, tone: 'bad' }),
  claimLead: (world, e) => ({ text: `${e.driver} gives a lead on your claim: ${contractText(world, e.contract)}`, tone: 'good' }),
  guardPaid: (world, e) => ({ text: `${nameOf(world, e.by)} pays ${nameOf(world, e.guard)} ${english(moneyMsg(e.fee))} for guarding`, tone: 'dim' }),
  encounter: (world, e) => ({ text: `${nameOf(world, e.vehicle)} comes to your truck with a ${words(e.encounter)}`, tone: '' }),
  call: (world, e) => ({ text: `Radio call with ${nameOf(world, e.with)} ${e.outcome === 'opened' ? 'opens' : 'ends'}`, tone: 'dim' }),
  job: (world, e) => ({ text: jobWords(world, e), tone: 'dim' }),
  shopMoney: (world, e) => ({ text: `${nameOf(world, e.vehicle)} ${e.amount < 0 ? 'pays' : 'gets'} ${english(moneyMsg(Math.abs(e.amount)))} for ${words(e.kind)}`, tone: 'dim' }),
  stateEnded: (world, e) => ({ text: `${nameOf(world, e.state.holder)} and ${nameOf(world, e.state.other)}: ${STATE[e.state.kind]} ${ENDING[e.ending]}`, tone: 'dim', quiet: QUIET_STATES.has(e.state.kind) }),
  lookedOver: (world, e) => ({ text: `${nameOf(world, e.by)} looks over ${nameOf(world, e.target)}`, tone: '' }),
  collision: (world, e) => ({ text: `${nameOf(world, e.a)} hits ${thingName(world, e.b)}`, tone: 'bad' }),
  arrived: (world, e) => ({ text: `${nameOf(world, e.vehicle)} arrives`, tone: 'dim' }),
  spawn: (world, e) => ({ text: `${nameOf(world, e.vehicle)} enters the map`, tone: 'dim' }),
  despawn: (world, e) => ({ text: `${nameOf(world, e.vehicle)} leaves the map`, tone: 'dim' }),
  enteredSite: (world, e) => ({ text: `${nameOf(world, e.vehicle)} drives into ${english(siteName(e.site))}`, tone: 'dim' }),
  leftSite: (world, e) => ({ text: `${nameOf(world, e.vehicle)} drives out of ${english(siteName(e.site))}`, tone: 'dim' }),
  practice: (_world, e) => ({ text: `${e.xp.toFixed(1)} XP from ${words(e.source)}`, tone: 'dim' }),
  weather: (_world, e) => ({ text: `A ${words(e.event.kind)} ${e.outcome === 'started' ? 'begins' : 'ends'}`, tone: 'dim' }),
};

const RECIPE_NAME: Record<string, string> = {
  well: 'Well', sorgut: 'Sorgut fields', weavers: 'Weavers', clinic: 'Clinic', machinists: 'Machinists', workshop: 'Workshop',
  rations: 'Ration kitchen', pans: 'Salt pans', forge: 'Forge', cells: 'Battery cells', pump: 'Fuel pump', yard: 'Scrapyard works',
};
const CAUSE_NAME: Record<StockCause, string> = {
  trade: 'Trucks trading', recipe: 'Production', demand: 'Local use', upkeep: 'Tool wear', repair: 'Repairs',
  service: 'Fuel and supplies sold', contract: 'Contracts', relief: 'Slow import',
};
const RUN_NAME: Record<RecipeRun, string> = { running: 'Running', worn: 'Running slow', stopped: 'Stopped, no inputs', fallback: 'Small batch, no inputs' };
const TAG_NAME: Record<EconTag, string> = { short: 'Short', rationing: 'Rationing', slowImport: 'Slow import', onOrder: 'On order' };
const NEWS_NAME: Record<RoadNewsKind, string> = { robbed: 'Robbed', destroyed: 'Destroyed', knockedOut: 'Knocked out' };
const EVENT_NAME: Record<SiteEventKind, string> = { surge: english(t('recipe.surge')), breakdown: english(t('recipe.breakdown')) };

function named<K extends string>(table: Record<K, string>, kind: string, id: K): string {
  const word = table[id];
  if (word === undefined) throw new Error(`The sim has no ${kind} word for ${id}`);
  return word;
}

const PHASE = { travel: 'on the way', act: 'at it' } as const;

function goalLine(world: World, g: NpcActivity): string {
  const target = g.targetId ? `, ${targetName(world, g.targetId)}` : '';
  return `${english(goalText(g.reason))}${target}, ${PHASE[g.phase]}`;
}

type Fact<K extends MemoryFact['kind']> = Extract<MemoryFact, { kind: K }>;
const MEMORY: { [K in MemoryFact['kind']]: (world: World, f: Fact<K>) => string } = {
  prices: (_world, f) => `Knows the prices at ${english(siteName(f.shop))}`,
  stripped: (world, f) => `Stripped ${stockText(world, f.stock)}`,
  wronged: (world, f) => `${nameOf(world, f.by)} ${f.deed} them`,
  helped: (world, f) => `${nameOf(world, f.by)} ${f.deed} them`,
  sighting: (world, f) => `Saw ${nameOf(world, f.vehicle)} in ${place(f.at)}`,
  witnessed: (world, f) => `Saw ${nameOf(world, f.by)} ${f.offense} ${nameOf(world, f.victim)} in ${place(f.at)}`,
};

const TURNS_PER_HOUR = TIME.turnsPerDay / 24;

function memoryLine(world: World, m: Memory): string {
  const hours = Math.round((world.turn - m.turn) / TURNS_PER_HOUR);
  const say = MEMORY[m.fact.kind] as (world: World, f: MemoryFact) => string;
  return `${hours === 0 ? 'Just now' : `${hours} h ago`}: ${say(world, m.fact)}`;
}

function spokenBy(table: Words, world: World, e: GameEvent): Spoken | null {
  const say = table[e.t] as ((world: World, e: GameEvent) => Spoken) | undefined;
  return say ? say(world, e) : null;
}

function gameWords(world: World, e: GameEvent): Spoken | null {
  const line = eventText(seeingAll(world), e);
  return line ? { text: lineText(line), tone: line.cls } : null;
}

function fieldWords(world: World, e: GameEvent): string {
  const known = new Set([...everyTruck(world), ...world.removed].map((v) => v.id));
  const fields = Object.entries(e).filter(([key]) => key !== 't').flatMap(([key, value]) => fieldWord(world, known, key, value));
  return fields.length > 0 ? `${capital(words(e.t))}: ${fields.join(', ')}` : capital(words(e.t));
}

function fieldWord(world: World, known: Set<string>, key: string, value: unknown): string[] {
  if (typeof value === 'string') return stringWord(world, known, key, value);
  if (typeof value === 'number') return [`${words(key)} ${Math.round(value * 10) / 10}`];
  if (typeof value === 'boolean') return [`${words(key)} ${value ? 'yes' : 'no'}`];
  return [];
}

function stringWord(world: World, known: Set<string>, key: string, value: string): string[] {
  if (known.has(value)) return [`${words(key)} ${nameOf(world, value)}`];
  return ID_LIKE.test(value) ? [] : [`${words(key)} ${words(value)}`];
}

function eventWords(world: World, e: GameEvent): Spoken {
  return spokenBy(SIM_FIRST, world, e) ?? gameWords(world, e) ?? spokenBy(SIM_WORDS, world, e) ?? { text: fieldWords(world, e), tone: 'dim' };
}

export const SIM_TEXT: SimText = {
  event: eventWords,
  truck: (world, v) => english(vehicleTitle(world, v)),
  doing: (world, v) => english(doingOf(world, v)),
  name: nameOf,
  target: targetName,
  goal: goalLine,
  memory: memoryLine,
  state: (kind) => STATE[kind],
  words,
  money: (amount) => english(moneyMsg(amount)),
  fuel: (units) => `${fuelLiters(units)} L`,
  speed: (tilesPerTurn) => `${kph(tilesPerTurn)} km/h`,
  distance: (tiles) => english(distanceText(tiles)),
  heat: (engineHeat) => `${engineCelsius(engineHeat)} °C`,
  place,
  part: (defId) => english(partName(defId)),
  good: (id) => english(goodName(id)),
  faction: (id) => english(factionName(id as Faction)),
  template: (id) => english(templateName(id)),
  chassis: (id) => english(chassisName(id)),
  trait: (id) => capital(english(traitName(id as TraitId))),
  skill: (id) => english(skillName(id as SkillId)),
  personality: (id) => capital(words(id)),
  contract: (c) => english(contractSummary(c)),
  site: (id) => english(siteName(id)),
  recipe: (id) => named(RECIPE_NAME, 'recipe', id),
  cause: (cause) => named(CAUSE_NAME, 'cause', cause),
  run: (run) => named(RUN_NAME, 'run state', run),
  siteEvent: (kind) => named(EVENT_NAME, 'site event', kind),
  tag: (tag) => named(TAG_NAME, 'tag', tag),
  newsKind: (kind) => named(NEWS_NAME, 'news kind', kind),
};
