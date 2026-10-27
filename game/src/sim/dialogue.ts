
import { optionShort } from './dialogue-rules';
import { BUSY_LINE, END, handoffQuest, HANG_UP_LINE, HONK_RANGE, HUB, REFUSED, TOLL, TOPICS, TRAIT_TALK, type DialogueOption, type LineId, type Topic, type TopicId, type Voice } from '../data/dialogue';
import { BACK_LINE, isGroup, PERSONALITIES, TALK_PRICE, TOPIC_GROUPS, TOPIC_ROOT, type Gate, type GroupId, type Personality, type TopicChild } from '../data/personalities';
import { inCombat, inCombatWithOther, inFeud, isHostile } from './combat';
import { playerVehicle, vehicleById } from './damage';
import { isKnockedOut } from './defeat';
import { raiseEncounter } from './encounters';
import { coldLine, CONDITIONS, EFFECTS, gateOpen, opensHelp, PREPARES } from './dialogue-rules';
import type { Call, CallVars, GameEvent, Vehicle, World } from './types';
import { dist } from './vec';
import { npcTraits } from './npc-decisions';
import { practice } from './progress';
import { modeRules } from './settings';
import { openQuest, QUESTS } from './quests';
import { canVehicleSee } from './vision';
import { playerCommand, requireActivePlayer, update } from './world';

export type OfferedOption = { line: LineId; topic: TopicId | null; option: DialogueOption | null; short?: number; group?: GroupId; back?: true; seen?: boolean };

const PAGE_FLAT_LIMIT = 4;

export function talkOf(npc: Vehicle): Voice & { topics: TopicId[]; personality: Personality } {
  const all = npcTraits(npc).map((id) => TRAIT_TALK[id]);
  const talks = all.some((t) => t.only) ? all.filter((t) => t.only) : all;
  const voice = talks.find((t) => t.voice)?.voice;
  if (!voice) throw new Error(`${npc.id} has no trait with a voice`);
  return { ...voice, topics: [...new Set(talks.flatMap((t) => t.topics))], personality: personalityOf(npc) };
}

function greetingOf(world: World, npc: Vehicle): LineId {
  const voice = talkOf(npc);
  return coldLine(world, npc, voice.topics) ?? voice.greeting;
}

function personalityOf(npc: Vehicle): Personality {
  const id = npc.brain?.personality;
  if (!id || !Object.hasOwn(PERSONALITIES, id)) throw new Error(`${npc.id} has unknown personality ${id}`);
  return PERSONALITIES[id];
}

function gateOf(npc: Vehicle, topic: Topic): Gate {
  return talkOf(npc).personality.gates[topic.id] ?? 'open';
}

function holds(world: World, npc: Vehicle, when: readonly (keyof typeof CONDITIONS)[], vars: CallVars): boolean {
  return when.every((id) => CONDITIONS[id](world, npc, vars));
}

function isSettled(world: World, npc: Vehicle, topic: Topic): boolean {
  return topic.once && world.player.talked[npc.id]?.[topic.id] !== undefined;
}

function isRefused(call: Call): boolean {
  return call.topic === null && call.node === REFUSED;
}

function openCall(world: World): Call {
  const call = world.player.call;
  if (!call) throw new Error('No call is open');
  return call;
}

function askable(world: World, npc: Vehicle): Topic[] {
  const feud = inFeud(world, npc, playerVehicle(world));
  return talkOf(npc).topics.map((id) => TOPICS[id]).filter((t) => t.ask && (!feud || t.ask.duringFeud) && gateOf(npc, t) !== 'closed' && gateOpen(world, npc, t.id) && holds(world, npc, t.ask.when, {}));
}

function topicsUnder(children: readonly TopicChild[]): TopicId[] {
  return children.flatMap((child) => (isGroup(child) ? topicsUnder(TOPIC_GROUPS[child].children) : [child]));
}

function pageEntries(children: readonly TopicChild[], open: ReadonlySet<TopicId>): TopicChild[] {
  const topics = topicsUnder(children).filter((id) => open.has(id));
  if (topics.length <= PAGE_FLAT_LIMIT) return topics;
  return children.flatMap((child): TopicChild[] => {
    if (!isGroup(child)) return open.has(child) ? [child] : [];
    const inside = topicsUnder([child]).filter((id) => open.has(id));
    return inside.length > 1 ? [child] : inside;
  });
}

function parentGroup(group: GroupId): GroupId | null {
  return (Object.keys(TOPIC_GROUPS) as GroupId[]).find((id) => TOPIC_GROUPS[id].children.includes(group)) ?? null;
}

function openPage(call: Call, open: ReadonlySet<TopicId>): GroupId | null {
  let page = call.group;
  while (page && topicsUnder(TOPIC_GROUPS[page].children).every((id) => !open.has(id))) page = parentGroup(page);
  return page;
}

function isSeen(world: World, npc: Vehicle, call: Call, child: TopicChild, open: ReadonlySet<TopicId>): boolean {
  const topics = topicsUnder([child]).filter((id) => open.has(id));
  return topics.length > 0 && topics.every((id) => call.asked.includes(id) || isSettled(world, npc, TOPICS[id]));
}

function hubOptions(world: World, npc: Vehicle, call: Call): OfferedOption[] {
  const open = new Set(askable(world, npc).map((t) => t.id));
  const page = openPage(call, open);
  const children = page ? TOPIC_GROUPS[page].children : TOPIC_ROOT;
  const entries = pageEntries(children, open).map((child): OfferedOption => {
    const seen = isSeen(world, npc, call, child, open);
    return isGroup(child) ? { line: TOPIC_GROUPS[child].say, topic: null, option: null, group: child, seen } : { line: TOPICS[child].ask!.say, topic: child, option: null, seen };
  });
  return [...entries, page ? { line: BACK_LINE, topic: null, option: null, back: true } : { line: HANG_UP_LINE, topic: null, option: null }];
}

export function currentOptions(world: World): OfferedOption[] {
  const call = openCall(world);
  const npc = vehicleById(world, call.with);
  const hangUp: OfferedOption = { line: HANG_UP_LINE, topic: null, option: null };
  if (isRefused(call)) return [hangUp];
  if (!call.topic) return hubOptions(world, npc, call);
  const node = TOPICS[call.topic].nodes[call.node];
  const options = node.options.filter((o) => holds(world, npc, o.when, call.vars)).map((o) => ({ line: o.say, topic: call.topic, option: o, short: optionShort(world, o) }));
  return [...options, hangUp];
}

export function currentLine(world: World): LineId {
  const call = openCall(world);
  if (isRefused(call)) return call.line.line;
  if (!call.topic) return greetingOf(world, vehicleById(world, call.with));
  return TOPICS[call.topic].nodes[call.node].line;
}

function say(world: World, speaker: string, line: LineId, vars: CallVars): void {
  world.events.push({ t: 'say', speaker, line, vars });
  if (world.player.call?.with === speaker) world.player.call.line = { line, vars };
}

function enter(world: World, call: Call, topic: TopicId | null, node: string): void {
  call.topic = topic;
  call.node = node;
  if (!topic) call.vars = {};
  say(world, call.with, currentLine(world), call.vars);
}

function enterTopic(world: World, npc: Vehicle, call: Call, topic: Topic, node: string = topic.start): void {
  const prepared = topic.prepare ? PREPARES[topic.prepare](world, npc) : {};
  call.vars = node === TOLL ? { ...prepared, price: { kind: 'money', amount: TALK_PRICE } } : prepared;
  practice(world, 'call', 1, null, `${npc.id}:${topic.id}`);
  enter(world, call, topic.id, node);
}

function endCall(world: World, call: Call): void {
  world.player.call = null;
  world.events.push({ t: 'call', with: call.with, outcome: 'ended' });
}

function begin(world: World, npc: Vehicle, line: LineId): Call {
  if (world.player.call) throw new Error('A call is already open');
  const call: Call = { with: npc.id, topic: null, node: HUB, vars: {}, line: { line, vars: {} }, group: null, asked: [] };
  world.player.call = call;
  world.events.push({ t: 'call', with: npc.id, outcome: 'opened' });
  return call;
}

export function callVehicle(world: World, npcId: string): World {
  return update(world, (w) => {
    requireActivePlayer(w);
    requireRadio(w);
    if (w.player.call) throw new Error('A call is already open');
    const npc = vehicleById(w, npcId);
    if (!npc.brain) throw new Error(`${npcId} has no driver to call`);
    if (isKnockedOut(npc)) throw new Error(`${npcId} has a knocked-out driver`);
    if (!canVehicleSee(w, playerVehicle(w), npc.pos)) throw new Error(`${npcId} is out of sight`);
    answer(w, npc, refusalOf(w, npc));
  });
}

function requireRadio(world: World): void {
  if (!modeRules(world).radio) throw new Error('No radio talk in this game mode');
}

function answer(world: World, npc: Vehicle, refusal: LineId | null): void {
  if (!refusal) return enter(world, begin(world, npc, greetingOf(world, npc)), null, HUB);
  const call = begin(world, npc, refusal);
  call.node = REFUSED;
}

function refusalOf(world: World, npc: Vehicle): LineId | null {
  if (busyElsewhere(world, npc, playerVehicle(world))) return BUSY_LINE;
  if (inFeud(world, npc, playerVehicle(world)) && askable(world, npc).length === 0) return talkOf(npc).refusal;
  return null;
}

function busyElsewhere(world: World, npc: Vehicle, me: Vehicle): boolean {
  return inCombatWithOther(world, npc, me.id) && !isHostile(world, npc, me);
}

function reply(world: World, call: Call, line: LineId): void {
  if (!isRefused(call)) say(world, world.player.vehicleId, line, call.vars);
}

function navigate(call: Call, offered: OfferedOption): boolean {
  if (offered.group) call.group = offered.group;
  else if (offered.back) call.group = call.group ? parentGroup(call.group) : null;
  return offered.group !== undefined || offered.back === true;
}

function pick(world: World, index: number): void {
  const offered = currentOptions(world)[index];
  if (!offered) throw new Error(`No option ${index} on offer`);
  const call = openCall(world);
  const npc = vehicleById(world, call.with);
  if (navigate(call, offered)) return;
  reply(world, call, offered.line);
  if (offered.option) return follow(world, npc, call, offered.option);
  if (offered.topic) return ask(world, npc, call, TOPICS[offered.topic]);
  hangUpCall(world, npc, call);
}

export function chooseOption(world: World, index: number): World {
  return update(world, (w) => pick(w, index));
}

export function canAskTopic(world: World, topicId: TopicId): boolean {
  const call = openCall(world);
  return !call.topic && !isRefused(call) && askable(world, vehicleById(world, call.with)).some((t) => t.id === topicId);
}

export function askTopic(world: World, topicId: TopicId): World {
  return update(world, (w) => {
    const call = openCall(w);
    if (call.topic || isRefused(call)) throw new Error(`Call with ${call.with} is not at its topics`);
    call.group = null;
    for (let step = 0; step < 4; step += 1) {
      const offered = currentOptions(w);
      const direct = offered.findIndex((o) => o.topic === topicId && !o.option);
      if (direct >= 0) return pick(w, direct);
      const into = offered.findIndex((o) => o.group && topicsUnder([o.group]).includes(topicId));
      if (into < 0) break;
      pick(w, into);
    }
    throw new Error(`${call.with} offers no way to ask ${topicId}`);
  });
}

function ask(world: World, npc: Vehicle, call: Call, topic: Topic): void {
  if (!call.asked.includes(topic.id)) call.asked.push(topic.id);
  if (isSettled(world, npc, topic)) return say(world, npc.id, talkOf(npc).repeatLine, {});
  const gate = gateOf(npc, topic);
  if (gate === 'help' && !opensHelp(world, npc)) return say(world, npc.id, 'helpMeFirst', {});
  enterTopic(world, npc, call, topic, gate === 'price' ? TOLL : topic.start);
}

function follow(world: World, npc: Vehicle, call: Call, option: DialogueOption): void {
  for (const id of option.effects) EFFECTS[id](world, npc, call);
  const quest = handoffQuest(option.go);
  if (quest) {
    endCall(world, call);
    return openQuest(world, QUESTS, quest, 'start');
  }
  if (option.go === END) return endCall(world, call);
  if (option.go === HUB) return enter(world, call, null, HUB);
  enter(world, call, call.topic, option.go);
}

export function endCallIfOut(world: World): void {
  const call = world.player.call;
  if (!call) return;
  const npc = world.vehicles.find((v) => v.id === call.with);
  if (!npc || lostReason(world, npc, call)) return endCall(world, call);
  if (world.player.state !== 'active' || isKnockedOut(npc)) hangUpCall(world, npc, call);
}

function lostReason(world: World, npc: Vehicle, call: Call): boolean {
  const raise = call.topic ? TOPICS[call.topic].raise : null;
  return raise !== null && !holds(world, npc, raise.when, call.vars);
}

export function onCall(world: World, a: Vehicle, b: Vehicle): boolean {
  const call = world.player.call;
  if (!call) return false;
  const pair = [a.id, b.id];
  return pair.includes(call.with) && pair.includes(world.player.vehicleId);
}

export function callTrucks(world: World): string[] {
  const call = world.player.call;
  return call ? [world.player.vehicleId, call.with] : [];
}

type Talk = { [K in GameEvent['t']]?: (e: Extract<GameEvent, { t: K }>, playerId: string) => string[] };
const pair = (e: { by: string; client: string }): string[] => [e.by, e.client];
const RADIO_TALK: Talk = {
  say: (e) => [e.speaker],
  call: (e, playerId) => [e.with, playerId],
  plea: (e) => (e.accepted === null ? [e.from] : [e.from, e.to]),
  escortHired: pair,
  escortRefused: pair,
  towHitched: pair,
  towOffer: (e) => [e.by],
  asked: (e) => [e.by, e.of],
};

export function radioSpeakers(events: readonly GameEvent[], playerId: string): string[] {
  return [...new Set(events.flatMap((e) => (RADIO_TALK[e.t] as ((e: GameEvent, id: string) => string[]) | undefined)?.(e, playerId) ?? []))];
}

function hangUpCall(world: World, npc: Vehicle, call: Call): void {
  if (call.topic) for (const id of TOPICS[call.topic].hangUp) EFFECTS[id](world, npc, call);
  endCall(world, call);
}

export function hangUp(world: World): World {
  return update(world, (w) => {
    const call = openCall(w);
    reply(w, call, HANG_UP_LINE);
    hangUpCall(w, vehicleById(w, call.with), call);
  });
}

export function raiseCalls(world: World): void {
  if (!hearsCalls(world)) return;
  const me = playerVehicle(world);
  for (const npc of world.vehicles) {
    const topic = raisedTopic(world, npc, me);
    if (!topic) continue;
    enterTopic(world, npc, begin(world, npc, topic.nodes[topic.start].line), topic);
    raiseEncounter(world, npc, topic.id);
    return;
  }
}

function hearsCalls(world: World): boolean {
  return modeRules(world).radio && !world.player.call && world.player.state === 'active' && !world.player.frozen;
}

function raisedTopic(world: World, npc: Vehicle, me: Vehicle): Topic | null {
  if (!npc.brain || isKnockedOut(npc) || busyElsewhere(world, npc, me) || !canVehicleSee(world, npc, me.pos)) return null;
  const feud = inFeud(world, npc, me);
  const combat = inCombat(world, me);
  const wanted = talkOf(npc).topics
    .map((id) => TOPICS[id])
    .filter((t) => t.raise && allowedNow(t.raise, feud, combat) && !isSettled(world, npc, t) && gateOpen(world, npc, t.id) && holds(world, npc, t.raise.when, {}))
    .sort((a, b) => b.raise!.priority - a.raise!.priority);
  return wanted[0] ?? null;
}

function allowedNow(raise: NonNullable<Topic['raise']>, feud: boolean, combat: boolean): boolean {
  return (!feud || raise.duringFeud) && (!combat || raise.duringCombat);
}

export function honk(world: World): World {
  return playerCommand(world, (w) => {
    requireRadio(w);
    const me = playerVehicle(w);
    w.events.push({ t: 'honk', vehicle: me.id });
    for (const npc of answering(w, me)) {
      w.events.push({ t: 'honk', vehicle: npc.id });
      practiceHonk(w, me, npc);
    }
  });
}

function practiceHonk(world: World, me: Vehicle, npc: Vehicle): void {
  if (canVehicleSee(world, me, npc.pos)) practice(world, 'honk', 1, null, npc.id);
}

function answering(world: World, me: Vehicle): Vehicle[] {
  return world.vehicles
    .filter((v) => v.brain && !isKnockedOut(v) && dist(v.pos, me.pos) <= HONK_RANGE && talkOf(v).honksBack && !inCombatWithOther(world, v, me.id) && !isHostile(world, v, me))
    .sort((a, b) => dist(a.pos, me.pos) - dist(b.pos, me.pos));
}
