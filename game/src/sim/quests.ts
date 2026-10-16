
import { Story } from 'inkjs';
import {
  AMBUSH_RAIDER,
  CHECKPOINT_TAG,
  CHECK_TAG,
  COST_TAG,
  FIRST_FALL_SEEN,
  GAME_OPENED_QUESTS,
  INTRO_STEP,
  INTRO_STEPS,
  type IntroStep,
  MONEY_STAT,
  QUEST_LANGUAGES,
  QUEST_VIEWS,
  type CompiledQuest,
  type QuestBundle,
  type QuestFact,
  type QuestLanguage,
  type QuestLinks,
  type QuestScene,
  type QuestStat,
  type QuestText,
  type QuestValue,
  type QuestValueType,
  type QuestVarDecl,
  type QuestViewKind,
  WAGON_SEEN,
} from '../data/quests';
import BUNDLE from '../data/quests.json';
import { isNoteId, type NoteId } from '../data/locals';
import { REGION } from '../data/region';
import { WAGON_SEVEN } from '../data/salvage';
import { SKILL_IDS } from '../data/skills';
import { UNITS } from '../data/units';
import { skillLevel } from './progress';
import { boardFull, holdsNote, learnNote, takeTownWork, townOffers, townWork } from './dialogue-rules';
import { hashRandom } from './rng';
import { storyStock } from './salvage';
import type { QuestCheck, QuestLine, QuestLive, QuestSession, QuestState, QuestVars, SkillId, World } from './types';
import { update } from './world';

export type QuestView = {
  quest: string;
  view: QuestViewKind;
  lines: QuestLine[];
  choices: string[];
  costs: (number | null)[];
  checks: (QuestCheck | null)[];
  locked: boolean[];
  stats: { name: string; label: string; value: string }[];
  facts: string[];
  ended: boolean;
  scene: QuestScene;
};
export type QuestQuery = (world: World, args: readonly unknown[]) => QuestValue;
export type QuestEffect = (world: World, args: readonly unknown[]) => void;

type Runner = { story: Story; world: World | null; restoring: string | null };

const INK_SEED_RANGE = 2 ** 31;
const runners = new WeakMap<QuestText, Runner>();
let questLanguage: QuestLanguage = 'en';

export function setQuestLanguage(lang: QuestLanguage): void {
  questLanguage = lang;
}

export function currentQuestLanguage(): QuestLanguage {
  return questLanguage;
}

function textOf(quest: CompiledQuest): QuestText {
  return quest.text[questLanguage];
}

const begun = new WeakMap<World, string>();
const pickedChecks = new WeakMap<World, QuestCheck>();
const SITES = new Set([...REGION.towns, ...REGION.locations].map((s) => s.id));

export const QUEST_QUERIES: Record<string, QuestQuery> = {
  money: (world) => Math.floor(world.player.money / UNITS.centsPerM),
  has_note: (world, args) => holdsNote(world, noteArg('has_note', args)),
  found: (world, args) => world.player.discovered.includes(siteArg('found', args)),
  searched: (world, args) => world.player.scavenged.includes(storyStock(world, textArg('searched', args, 0)).id),
  has_work: (world) => townWork(world) !== null,
  has_offers: (world) => townOffers(world).length > 0,
  board_full: (world) => boardFull(world),
  skill: (world, args) => skillLevel(world, skillArg('skill', args)),
  passed: (world) => {
    const check = pickedChecks.get(world);
    if (!check) throw new Error('passed() ran with no # check choice picked');
    return skillLevel(world, check.skill) >= check.level;
  },
};

export const QUEST_EFFECTS: Record<string, QuestEffect> = {
  give_money: (world, args) => {
    const amount = wholeArg('give_money', args, 0);
    if (amount < 0) throw new Error(`give_money takes no negative amount, got ${amount}`);
    world.player.money += amount * UNITS.centsPerM;
  },
  pay: (world, args) => {
    const amount = wholeArg('pay', args, 0);
    if (amount < 0) throw new Error(`pay takes no negative amount, got ${amount}`);
    if (world.player.money < amount * UNITS.centsPerM) throw new Error(`pay(${amount}) needs more money than the player holds. Check money() first`);
    world.player.money -= amount * UNITS.centsPerM;
  },
  note: (world, args) => learnNote(world, noteArg('note', args)),
  take_work: (world) => takeTownWork(world),
  begin: (world, args) => {
    if (begun.has(world)) throw new Error('begin ran twice in one pick');
    begun.set(world, textArg('begin', args, 0));
  },
};

function wholeArg(fn: string, args: readonly unknown[], index: number): number {
  const value = args[index];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`${fn} needs a whole number as argument ${index + 1}, got ${String(value)}`);
  return value;
}

function textArg(fn: string, args: readonly unknown[], index: number): string {
  const value = args[index];
  if (typeof value !== 'string') throw new Error(`${fn} needs text as argument ${index + 1}, got ${String(value)}`);
  return value;
}

function noteArg(fn: string, args: readonly unknown[]): NoteId {
  const id = textArg(fn, args, 0);
  if (!isNoteId(id)) throw new Error(`${fn} names no note ${id}`);
  return id;
}

function skillArg(fn: string, args: readonly unknown[]): SkillId {
  const id = textArg(fn, args, 0);
  const skill = SKILL_IDS.find((s) => s === id);
  if (!skill) throw new Error(`${fn} names no skill ${id}`);
  return skill;
}

function siteArg(fn: string, args: readonly unknown[]): string {
  const id = textArg(fn, args, 0);
  if (!SITES.has(id)) throw new Error(`${fn} names no town or location ${id}`);
  return id;
}

export function parseBundle(value: unknown): QuestBundle {
  if (!isRecord(value) || !isRecord(value.world) || !Array.isArray(value.externals) || !isRecord(value.quests)) throw new Error('Quest bundle has no world, externals or quests');
  const quests = Object.fromEntries(Object.entries(value.quests).map(([id, quest]) => [id, parseQuest(id, quest)]));
  const bundle = { world: parseVars('world', value.world), externals: value.externals.map(String), quests };
  checkQuestLinks(bundle);
  return bundle;
}

export function checkQuestLinks(bundle: QuestBundle): void {
  for (const [id, quest] of Object.entries(bundle.quests)) checkLinks(id, quest.links, bundle);
}

function parseQuest(id: string, value: unknown): CompiledQuest {
  if (!isRecord(value) || !isRecord(value.vars) || !Array.isArray(value.checkpoints) || !Array.isArray(value.art) || !isRecord(value.text)) throw new Error(`Quest ${id} has no vars, checkpoints, art or text`);
  return { vars: parseVars(id, value.vars), checkpoints: value.checkpoints.map(String), view: parseView(id, value.view), art: value.art.map(String), revision: parseRevision(id, value.revision), links: parseLinks(id, value.links), text: parseTexts(id, value.text) };
}

function parseRevision(id: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error(`Quest ${id} has no revision`);
  return value;
}

function parseLinks(id: string, value: unknown): QuestLinks {
  if (!isRecord(value) || !isRecord(value.writes)) throw new Error(`Quest ${id} has no links`);
  const texts = (key: string): string[] => {
    const list = value[key];
    if (!Array.isArray(list) || !list.every((item) => typeof item === 'string')) throw new Error(`Quest ${id} has bad ${key} links`);
    return list;
  };
  const writes = Object.fromEntries(Object.entries(value.writes).map(([name, values]) => {
    if (!Array.isArray(values) || !values.every(isQuestValue)) throw new Error(`Quest ${id} writes bad values to ${name}`);
    return [name, values];
  }));
  return { reads: texts('reads'), readsNotes: texts('readsNotes'), writes, notes: texts('notes'), begins: texts('begins') };
}

function checkLinks(id: string, links: QuestLinks, bundle: QuestBundle): void {
  const unknownVar = [...links.reads, ...Object.keys(links.writes)].find((name) => !bundle.world[name]);
  if (unknownVar) throw new Error(`Quest ${id} links to world variable ${unknownVar}, which world.ink does not declare`);
  const badValue = Object.entries(links.writes).find(([name, values]) => values.some((v) => typeof v !== bundle.world[name].type));
  if (badValue) throw new Error(`Quest ${id} writes a value of the wrong type to ${badValue[0]}`);
  const unknownNote = [...links.notes, ...links.readsNotes].find((note) => !isNoteId(note));
  if (unknownNote) throw new Error(`Quest ${id} links to note ${unknownNote}, which is no note`);
  const unknownQuest = links.begins.find((quest) => !bundle.quests[quest]);
  if (unknownQuest) throw new Error(`Quest ${id} begins ${unknownQuest}, which is no quest`);
}

export function isQuestValue(value: unknown): value is QuestValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function parseView(id: string, value: unknown): QuestViewKind {
  const view = QUEST_VIEWS.find((v) => v === value);
  if (!view) throw new Error(`Quest ${id} has no view`);
  return view;
}

function parseTexts(id: string, texts: Record<string, unknown>): Record<QuestLanguage, QuestText> {
  return Object.fromEntries(QUEST_LANGUAGES.map((lang) => [lang, parseText(`${id} in ${lang}`, texts[lang])])) as Record<QuestLanguage, QuestText>;
}

function parseText(id: string, value: unknown): QuestText {
  if (!isRecord(value) || typeof value.story !== 'string' || !Array.isArray(value.stats) || !Array.isArray(value.facts) || !isRecord(value.scenes)) throw new Error(`Quest ${id} has no story, stats, facts or scenes`);
  const scenes = Object.fromEntries(Object.entries(value.scenes).map(([checkpoint, scene]) => [checkpoint, parseScene(id, scene)]));
  return { story: value.story, stats: value.stats.map((s) => parseStat(id, s)), facts: value.facts.map((f) => parseFact(id, f)), scenes };
}

function parseScene(id: string, value: unknown): QuestScene {
  const textOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';
  if (!isRecord(value) || !textOrNull(value.img) || !textOrNull(value.place)) throw new Error(`Quest ${id} has a bad checkpoint scene`);
  return { img: value.img, place: value.place };
}

function parseStat(id: string, value: unknown): QuestStat {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.label !== 'string') throw new Error(`Quest ${id} has a bad stat`);
  const words = Array.isArray(value.words) ? value.words.map(String) : null;
  return { name: value.name, label: value.label, words };
}

function parseFact(id: string, value: unknown): QuestFact {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.text !== 'string') throw new Error(`Quest ${id} has a bad fact`);
  return { name: value.name, text: value.text };
}

function parseVars(owner: string, value: Record<string, unknown>): Record<string, QuestVarDecl> {
  return Object.fromEntries(Object.entries(value).map(([name, decl]) => {
    if (!isRecord(decl) || !isValueType(decl.type) || typeof decl.init !== decl.type) throw new Error(`Variable ${name} of ${owner} has a bad declaration`);
    return [name, { type: decl.type, init: decl.init as QuestValue }];
  }));
}

function isValueType(value: unknown): value is QuestValueType {
  return value === 'string' || value === 'number' || value === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const QUESTS: QuestBundle = parseBundle(BUNDLE);

export function startQuest(world: World, bundle: QuestBundle, questId: string, checkpoint: string): World {
  return update(world, (w) => openQuest(w, bundle, questId, checkpoint));
}

export function openQuest(w: World, bundle: QuestBundle, questId: string, checkpoint: string): void {
  const open = w.player.quests.session;
  if (open) throw new Error(`Quest ${open.quest} is open`);
  if (!questOf(bundle, questId).checkpoints.includes(checkpoint)) throw new Error(`Quest ${questId} has no checkpoint ${checkpoint}`);
  w.player.quests.session = { quest: questId, checkpoint, seed: questSeed(w, questId) };
  enterCheckpoint(w, bundle);
}

export function openFirstFall(w: World, foes: readonly string[]): void {
  if (foes.length === 0) return;
  if (w.player.quests.session) return;
  if (questVar(w, QUESTS, GAME_OPENED_QUESTS.firstFall, FIRST_FALL_SEEN) === true) return;
  setWorldVar(w, FIRST_FALL_SEEN, true);
  openQuest(w, QUESTS, GAME_OPENED_QUESTS.firstFall, 'start');
}

export function openWreckScene(w: World, stockId: string): void {
  if (stockId !== WAGON_SEVEN) return;
  if (w.player.quests.session) return;
  if (questVar(w, QUESTS, GAME_OPENED_QUESTS.wagonSeven, WAGON_SEEN) === true) return;
  setWorldVar(w, WAGON_SEEN, true);
  openQuest(w, QUESTS, GAME_OPENED_QUESTS.wagonSeven, 'start');
}

export function introStep(w: World): IntroStep {
  const step = worldVar(w, INTRO_STEP);
  const known = INTRO_STEPS.find((s) => s === step);
  if (!known) throw new Error(`World variable ${INTRO_STEP} holds ${String(step)}, which is no intro step`);
  return known;
}

export function setIntroStep(w: World, step: IntroStep): void {
  setWorldVar(w, INTRO_STEP, step);
}

export function chooseQuestOption(world: World, bundle: QuestBundle, index: number): World {
  return update(world, (w) => {
    const session = openSession(w.player.quests);
    const live = liveIn(w.player.quests, session);
    if (!Number.isInteger(index) || index < 0 || index >= live.choices.length) throw new Error(`No choice ${index} on offer`);
    payCost(w, live.costs[index], live.choices[index]);
    const check = live.checks[index];
    if (check) pickedChecks.set(w, check);
    try {
      runQuest(w, bundle, session.quest, (story) => {
        story.state.LoadJson(live.ink);
        story.ChooseChoiceIndex(index);
      });
    } finally {
      pickedChecks.delete(w);
    }
  });
}

function liveIn(state: QuestState, session: QuestSession): QuestLive {
  const live = state.live;
  if (!live) throw new Error(`Quest ${session.quest} has no live state. Restore it first`);
  if (live.lang !== questLanguage) throw new Error(`Quest ${session.quest} is live in ${live.lang}, not ${questLanguage}. Relanguage it first`);
  return live;
}

export function relanguageQuest(world: World, bundle: QuestBundle): World {
  if (world.player.quests.live?.lang === questLanguage) return world;
  return update(world, (w) => {
    w.player.quests.live = null;
    restoreQuest(w, bundle);
  });
}

export function restoreQuest(world: World, bundle: QuestBundle): void {
  const session = world.player.quests.session;
  if (!session) return;
  const saved = JSON.stringify([world.player.quests.world, world.player.quests.local]);
  const runner = runnerOf(bundle, questOf(bundle, session.quest));
  runner.restoring = session.checkpoint;
  try {
    enterCheckpoint(world, bundle);
  } finally {
    runner.restoring = null;
  }
  const loaded = JSON.stringify([world.player.quests.world, world.player.quests.local]);
  if (loaded !== saved) throw new Error(`Loading checkpoint ${session.checkpoint} changed its variables from ${saved} to ${loaded}. A checkpoint may not change variables before its first choice.`);
}

export function leaveQuest(world: World): World {
  return update(world, (w) => {
    if (!w.player.quests.live) throw new Error('No quest is on view');
    if (w.player.quests.session) throw new Error(`Quest ${w.player.quests.live.quest} has not ended, and a quest can be left only once it ends`);
    w.player.quests.session = null;
    w.player.quests.live = null;
  });
}

function payCost(w: World, cost: number | null, choice: string): void {
  if (cost === null) return;
  if (w.player.money < cost * UNITS.centsPerM) throw new Error(`"${choice}" costs ${cost} M, more than the player holds`);
  w.player.money -= cost * UNITS.centsPerM;
}

export function questView(world: World, bundle: QuestBundle): QuestView {
  const { live, session } = world.player.quests;
  if (!live) throw new Error('No quest is on view');
  const quest = questOf(bundle, live.quest);
  const money = QUEST_QUERIES.money(world, []) as number;
  return {
    quest: live.quest,
    view: quest.view,
    lines: live.lines,
    choices: live.choices,
    costs: live.costs,
    checks: live.checks,
    locked: live.costs.map((cost) => cost !== null && cost > money),
    stats: quest.text[live.lang].stats.map((stat) => ({ name: stat.name, label: stat.label, value: statText(world, bundle, live.quest, stat, money) })),
    facts: quest.text[live.lang].facts.filter((fact) => questVar(world, bundle, live.quest, fact.name) === true).map((fact) => fact.text),
    ended: session === null,
    scene: session === null ? NO_SCENE : sceneAt(quest.text[live.lang], session.checkpoint),
  };
}

const NO_SCENE: QuestScene = { img: null, place: null };

function sceneAt(text: QuestText, checkpoint: string): QuestScene {
  const scene = text.scenes[checkpoint];
  if (!scene) throw new Error(`Checkpoint ${checkpoint} has no scene`);
  return scene;
}

function statText(world: World, bundle: QuestBundle, questId: string, stat: QuestStat, money: number): string {
  if (stat.name === MONEY_STAT) return `${money} M`;
  const value = questVar(world, bundle, questId, stat.name);
  if (stat.words === null) return String(value);
  const word = stat.words[Math.min(Number(value), stat.words.length - 1)];
  if (word === undefined) throw new Error(`Stat ${stat.name} of ${questId} holds ${String(value)}, which names none of ${stat.words.join(', ')}`);
  return word;
}

function questVar(world: World, bundle: QuestBundle, questId: string, name: string): QuestValue {
  const { world: shared, local } = world.player.quests;
  const own = questOf(bundle, questId).vars[name];
  if (own) return local[questId]?.[name] ?? own.init;
  const decl = bundle.world[name];
  if (!decl) throw new Error(`Quest ${questId} reads no variable ${name}`);
  return shared[name] ?? decl.init;
}

export function isIntroAmbusher(world: World, vehicleId: string): boolean {
  return introStep(world) === 'ambush' && worldVar(world, AMBUSH_RAIDER) === vehicleId;
}

export function worldVar(world: World, name: string): QuestValue {
  const decl = QUESTS.world[name];
  if (!decl) throw new Error(`No world variable ${name}`);
  return world.player.quests.world[name] ?? decl.init;
}

export function setWorldVar(world: World, name: string, value: QuestValue): void {
  const decl = QUESTS.world[name];
  if (!decl) throw new Error(`No world variable ${name}`);
  if (typeof value !== decl.type) throw new Error(`World variable ${name} holds a ${decl.type}, not ${String(value)}`);
  if (world.player.quests.session) throw new Error(`World variable ${name} was set while a quest is open, and the next pick would undo it`);
  if (value === decl.init) delete world.player.quests.world[name];
  else world.player.quests.world[name] = value;
}

export function questProblems(state: QuestState, bundle: QuestBundle): Error[] {
  return [
    ...varProblems(state.world, bundle.world, (name) => new Error(`World variable ${name}`)),
    ...Object.entries(state.local).flatMap(([id, vars]) => localProblems(id, vars, bundle)),
    ...sessionProblems(state.session, bundle),
  ];
}

export type CarriedQuestVars = { world: Record<string, unknown>; local: Record<string, Record<string, unknown>> };

function localProblems(id: string, vars: QuestVars, bundle: QuestBundle): Error[] {
  const quest = bundle.quests[id];
  if (!quest) return [new Error(`Quest ${id} does not exist`)];
  return varProblems(vars, quest.vars, (name) => new Error(`Variable ${name} of quest ${id}`));
}

function varProblems(vars: QuestVars, decls: Record<string, QuestVarDecl>, label: (name: string) => Error): Error[] {
  return Object.entries(vars).flatMap(([name, value]) => {
    const decl = decls[name];
    if (!decl) return [new Error(`${label(name).message} is not declared`)];
    return typeof value === decl.type ? [] : [new Error(`${label(name).message} holds a ${typeof value}, not a ${decl.type}`)];
  });
}

function sessionProblems(session: QuestSession | null, bundle: QuestBundle): Error[] {
  if (!session) return [];
  const quest = bundle.quests[session.quest];
  if (!quest) return [new Error(`Quest ${session.quest} does not exist`)];
  return quest.checkpoints.includes(session.checkpoint) ? [] : [new Error(`Quest ${session.quest} has no checkpoint ${session.checkpoint}`)];
}

function enterCheckpoint(w: World, bundle: QuestBundle): void {
  const session = openSession(w.player.quests);
  runQuest(w, bundle, session.quest, (story) => {
    story.ResetState();
    injectVars(story, w.player.quests.world);
    injectVars(story, w.player.quests.local[session.quest] ?? {});
    story.state.storySeed = session.seed;
    story.state.previousRandom = 0;
    story.ChoosePathString(session.checkpoint);
  });
}

function runQuest(w: World, bundle: QuestBundle, questId: string, step: (story: Story) => void): void {
  const quest = questOf(bundle, questId);
  const runner = runnerOf(bundle, quest);
  runner.world = w;
  try {
    step(runner.story);
    const lines = playLines(runner.story, w.player.quests);
    settle(w, bundle, questId, runner.story, lines);
  } finally {
    runner.world = null;
  }
  beginNext(w, bundle, questId);
}

function beginNext(w: World, bundle: QuestBundle, questId: string): void {
  const next = begun.get(w);
  if (next === undefined) return;
  begun.delete(w);
  if (w.player.quests.session) throw new Error(`Quest ${questId} called begin("${next}") but did not end right after it`);
  openQuest(w, bundle, next, 'start');
}

function playLines(story: Story, state: QuestState): QuestLine[] {
  const lines: QuestLine[] = [];
  while (story.canContinue) {
    const text = (story.Continue() ?? '').trim();
    const tags = story.currentTags ?? [];
    noteCheckpoint(state, tags);
    if (text) lines.push({ text, tags: tags.filter((tag) => !tag.startsWith(CHECKPOINT_TAG)) });
  }
  return lines;
}

function noteCheckpoint(state: QuestState, tags: readonly string[]): void {
  const tag = tags.find((t) => t.startsWith(CHECKPOINT_TAG));
  if (tag && state.session) state.session.checkpoint = tag.slice(CHECKPOINT_TAG.length).trim();
}

function settle(w: World, bundle: QuestBundle, questId: string, story: Story, lines: QuestLine[]): void {
  const state = w.player.quests;
  state.world = storedVars(story, bundle.world, null);
  const { [questId]: _old, ...others } = state.local;
  const local = storedVars(story, questOf(bundle, questId).vars, questId);
  state.local = Object.keys(local).length > 0 ? { ...others, [questId]: local } : others;
  const choices = story.currentChoices.map((choice) => choice.text);
  const costs = story.currentChoices.map((choice) => choiceCost(questId, choice.text, choice.tags ?? []));
  const checks = story.currentChoices.map((choice) => choiceCheck(questId, choice.text, choice.tags ?? []));
  state.live = { quest: questId, lang: questLanguage, ink: story.state.toJson(), lines, choices, costs, checks };
  if (choices.length === 0) state.session = null;
}

function choiceCost(questId: string, text: string, tags: readonly string[]): number | null {
  const tag = tags.find((t) => t.startsWith(COST_TAG));
  const other = tags.find((t) => !t.startsWith(COST_TAG) && !t.startsWith(CHECK_TAG));
  if (other !== undefined) throw new Error(`Choice "${text}" of ${questId} carries # ${other}. A choice takes only # cost and # check.`);
  if (tag === undefined) return null;
  const cost = Number(tag.slice(COST_TAG.length).trim());
  if (!Number.isInteger(cost) || cost <= 0) throw new Error(`Choice "${text}" of ${questId} needs a whole positive cost, got # ${tag}`);
  return cost;
}

function choiceCheck(questId: string, text: string, tags: readonly string[]): QuestCheck | null {
  const tag = tags.find((t) => t.startsWith(CHECK_TAG));
  if (tag === undefined) return null;
  const [id, levelText, ...rest] = tag.slice(CHECK_TAG.length).trim().split(/\s+/);
  const skill = SKILL_IDS.find((s) => s === id);
  const level = Number(levelText);
  if (!skill || !Number.isInteger(level) || level <= 0 || rest.length > 0) throw new Error(`Choice "${text}" of ${questId} needs # check: <skill> <level>, got # ${tag}`);
  return { skill, level };
}

function storedVars(story: Story, decls: Record<string, QuestVarDecl>, quest: string | null): QuestVars {
  const stored: QuestVars = {};
  for (const [name, decl] of Object.entries(decls)) {
    const value: unknown = story.variablesState.$(name);
    if (typeof value !== decl.type) throw new Error(`Variable ${name} of ${quest === null ? 'the world' : `quest ${quest}`} became a ${typeof value}, not a ${decl.type}`);
    if (value !== decl.init) stored[name] = value as QuestVars[string];
  }
  return stored;
}

function injectVars(story: Story, vars: QuestVars): void {
  for (const [name, value] of Object.entries(vars)) story.variablesState.$(name, value);
}

function runnerOf(bundle: QuestBundle, quest: CompiledQuest): Runner {
  const text = textOf(quest);
  const known = runners.get(text);
  if (known) return known;
  const runner: Runner = { story: new Story(text.story), world: null, restoring: null };
  for (const name of bundle.externals) bindExternal(runner, name);
  runners.set(text, runner);
  return runner;
}

function bindExternal(runner: Runner, name: string): void {
  const query = QUEST_QUERIES[name];
  const effect = QUEST_EFFECTS[name];
  if (query) return runner.story.BindExternalFunction(name, (...args: unknown[]) => query(runnerWorld(runner), args), true);
  if (effect) return runner.story.BindExternalFunction(name, (...args: unknown[]) => effect(effectWorld(runner, name), args), false);
  throw new Error(`External function ${name} has no query or effect in src/sim/quests.ts`);
}

function effectWorld(runner: Runner, name: string): World {
  if (runner.restoring) throw new Error(`Effect ${name} ran while loading checkpoint ${runner.restoring}, so every load would run it again. Move it after a choice.`);
  return runnerWorld(runner);
}

function runnerWorld(runner: Runner): World {
  if (!runner.world) throw new Error('A quest hook ran outside a quest command');
  return runner.world;
}

function questOf(bundle: QuestBundle, questId: string): CompiledQuest {
  const quest = bundle.quests[questId];
  if (!quest) throw new Error(`No quest ${questId}`);
  return quest;
}

function openSession(state: QuestState): QuestSession {
  if (!state.session) throw new Error('No quest is open');
  return state.session;
}

function questSeed(w: World, questId: string): number {
  const codes = [...questId].map((c) => c.charCodeAt(0));
  return Math.floor(hashRandom(w.seed, w.turn, ...codes) * INK_SEED_RANGE);
}
