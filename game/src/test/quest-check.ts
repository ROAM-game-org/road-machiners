
import { isNoteId, NOTE_IDS } from '../data/locals';
import { GAME_WORLD_VARS, QUEST_LANGUAGES, WAGON_SEEN, type QuestBundle, type QuestLanguage, type QuestValue } from '../data/quests';
import { REGION } from '../data/region';
import { SITE_EVENTS } from '../data/market';
import { TIME } from '../data/time';
import { STORY_WRECKS } from '../data/salvage';
import { MAX_RANK, SKILL_IDS } from '../data/skills';
import { playerVehicle } from '../sim/damage';
import { learnNote, localOfQuest, takeTownWork, townWork } from '../sim/dialogue-rules';
import { makeVehicle } from '../sim/factory';
import { shopAt, siteOf } from '../sim/market';
import { chooseQuestOption, inQuestLanguage, QUEST_EFFECTS, QUEST_QUERIES, questPage, questView, restoreQuest, seenChoices, startQuest, type QuestView } from '../sim/quests';
import { isStoryWreck } from '../sim/salvage';
import { sitePads } from '../sim/sites';
import type { SearchContract } from '../sim/market';
import type { Vehicle, World } from '../sim/types';
import { cloneWorld } from '../sim/world';
import { markupProblems } from '../ui/quest-text';
import { compileSources, WORLD_FILE, type QuestSections, type QuestSources } from './quest-compile';

export type QuestReport = { quest: string; states: number; problems: string[] };

type Walk = { key: string; worlds: Record<QuestLanguage, World>; picks: string[] };
type Seen = { picks: string[]; next: string[]; free: string[]; ended: boolean };
type InkState = { flows: Record<string, { callstack: { threads: { callstack: unknown }[] }; currentChoices: { text: string; targetPath: string }[] }>; currentFlowName: string; variablesState: unknown; visitCounts: Record<string, number>; previousRandom: number };

const SEARCH_QUEST = 'roadhouse_petra';
const STAND_IN = 'check-searched';
const FAR = { x: 1, y: 1 };

export type QuestPage = Omit<QuestView, 'seen'>;
export type QuestScenes = (questId: string) => World[];
export type SceneWalk = { states: number; stopped: boolean; problems: string[]; visited: Record<QuestLanguage, Set<string>> };
type Scene = { problems: string[]; seen: Map<string, Seen>; known: Set<string>; visited: Record<QuestLanguage, Set<string>>; loads: Set<string>; looked: Set<string> };

export const QUEST_STATE_LIMIT = 5000;
export const QUEST_CHOICE_CAP = 5;

export type QuestCheck = {
  shared: QuestReport;
  questIds: string[];
  walk: (questId: string, scenes: QuestScenes, limit: number) => QuestReport;
  sceneCount: (questId: string, scenes: QuestScenes) => number;
  walkScene: (questId: string, scenes: QuestScenes, limit: number, index: number) => SceneWalk;
  finish: (questId: string, walks: SceneWalk[], limit: number) => QuestReport;
};

export function questCheck(sources: QuestSources): QuestCheck {
  const { bundle, errors, warnings, sections } = compileSources(sources, true);
  const hooks = hookProblems(bundle);
  const shared: QuestReport = { quest: 'all', states: 0, problems: [...errors, ...warnings, ...hooks] };
  const assigned = [...worldAssignments(sources, bundle), ...gameFlags(bundle)];
  const sceneWorlds = (id: string, scenes: QuestScenes): World[] => {
    const read = assigned.filter(([name]) => readsWorldVar(sources, id, name));
    return withWorldVars(scenes(id), read);
  };
  const finish = (id: string, walks: SceneWalk[], limit: number): QuestReport => finishQuest(walks, id, sections[id] ?? { en: [], ru: [] }, limit);
  const sceneWalk = (id: string, scenes: QuestScenes, limit: number, index: number): SceneWalk => walkScene(sceneWorlds(id, scenes)[index], bundle, id, limit);
  const sceneCount = (id: string, scenes: QuestScenes): number => sceneWorlds(id, scenes).length;
  const walk = (id: string, scenes: QuestScenes, limit: number): QuestReport => finish(id, sceneWorlds(id, scenes).map((scene) => walkScene(scene, bundle, id, limit)), limit);
  return { shared, questIds: hooks.length > 0 ? [] : Object.keys(bundle.quests), walk, sceneCount, walkScene: sceneWalk, finish };
}

export function checkQuests(sources: QuestSources, scenes: QuestScenes, limit: number): QuestReport[] {
  const check = questCheck(sources);
  return [check.shared, ...check.questIds.map((id) => check.walk(id, scenes, limit))];
}

function readsWorldVar(sources: QuestSources, questId: string, name: string): boolean {
  const word = new RegExp(`\\b${name}\\b`);
  const quest = sources[`${questId}.ink`];
  if (quest === undefined) throw new Error(`No source for quest ${questId}`);
  const sharedUse = sources[WORLD_FILE].split('\n').some((line) => !/^\s*VAR\s/.test(line) && word.test(line));
  return sharedUse || word.test(quest);
}

const ASSIGNMENT = /^\s*~\s*([a-z_][a-z0-9_]*)\s*=\s*("[^"]*"|true|false|-?\d+(?:\.\d+)?)\s*$/gim;

function worldAssignments(sources: QuestSources, bundle: QuestBundle): [string, QuestValue][] {
  const found = Object.values(sources).flatMap((source) => [...source.matchAll(ASSIGNMENT)].map((m) => [m[1], JSON.parse(m[2]) as QuestValue] as [string, QuestValue]));
  const fresh = found.filter(([name, value]) => bundle.world[name] !== undefined && bundle.world[name].init !== value);
  return [...new Map(fresh.map((pair) => [JSON.stringify(pair), pair])).values()];
}

function gameFlags(bundle: QuestBundle): [string, QuestValue][] {
  return Object.entries(GAME_WORLD_VARS).filter(([name, flag]) => flag.gates === null && bundle.world[name]?.type === 'boolean').map(([name]) => [name, true]);
}

function withWorldVars(scenes: World[], assigned: readonly [string, QuestValue][]): World[] {
  const first = scenes[0];
  return [...scenes, ...assigned.map(([name, value]) => {
    const w = cloneWorld(first);
    w.player.quests.world = { ...w.player.quests.world, [name]: value };
    return w;
  })];
}

export function gameScenes(base: World): QuestScenes {
  const shared = { ...base, terrain: Object.freeze({ ...base.terrain }), obstacles: [], vehicles: base.vehicles.filter((v) => v.id === base.player.vehicleId), salvage: base.salvage.filter(isStoryWreck), player: { ...base.player, explored: new Uint8Array(0), visible: [] } };
  return (questId) => {
    const fresh = cloneWorld(shared);
    parkAtLocal(fresh, questId);
    const walked = veteran(fresh);
    if (questId !== SEARCH_QUEST) return [fresh, walked];
    return [fresh, withMarshalLead(walked), withSearch(walked)];
  };
}

export function parkAtLocal(world: World, questId: string): void {
  const local = localOfQuest(questId);
  if (local) parkAt(world, local.town);
}

function parkAt(world: World, town: string): void {
  const site = siteOf(town);
  const truck = playerVehicle(world);
  truck.pos = { ...sitePads(site)[0] };
  truck.speed = 0;
}

function veteran(fresh: World): World {
  const w = cloneWorld(fresh);
  for (const id of NOTE_IDS) if (isNoteId(id)) learnNote(w, id);
  w.player.discovered = [...REGION.towns, ...REGION.locations].map((s) => s.id);
  w.player.scavenged = [...w.player.scavenged, ...STORY_WRECKS.map((s) => s.id)];
  w.player.quests.world = { ...w.player.quests.world, [WAGON_SEEN]: true };
  for (const skill of SKILL_IDS) w.player.ranks[skill] = MAX_RANK;
  if (w.sunward) w.sunward = { ...w.sunward, collapsed: w.turn };
  while (shopAt(w) && townWork(w)) takeTownWork(w);
  starveParkedShop(w);
  w.events = [];
  return w;
}

function withSearch(base: World): World {
  const w = cloneWorld(base);
  const search: SearchContract = { id: 'check-search', shop: 'bowl', kind: 'search', target: STAND_IN, driver: 'Mack Holt', template: 'trader', lead: { at: { ...FAR }, turn: 0 }, reward: 0, deadline: w.turn + TIME.workDayTurns, window: TIME.workDayTurns, tier: 1, delivered: false };
  w.player.contracts = [...w.player.contracts, search];
  return w;
}

function withMarshalLead(base: World): World {
  const w = withSearch(base);
  w.turn += 1;
  const car = makeVehicle(w, { faction: 'marshals', chassisId: 'scout', parts: [{ defId: 'stockEngine', wear: 0 }], spares: [], cargo: {}, pos: { ...FAR }, heading: 0, brain: marshalBrain() });
  car.brain?.memories.push({ turn: w.turn, fact: { kind: 'sighting', vehicle: STAND_IN, at: { ...FAR }, heading: 0 } });
  w.vehicles.push(car);
  return w;
}

function marshalBrain(): NonNullable<Vehicle['brain']> {
  return { templateId: 'marshal', driver: 'Jed Cobb', traits: ['marshal'], personality: 'talkative', goals: [], noticed: {}, tracks: {}, hurt: 0, attackers: {}, goal: null, home: { ...FAR }, stepIndex: 0, memories: [] };
}

function starveParkedShop(w: World): void {
  const shopId = shopAt(w);
  if (!shopId) return;
  const state = w.shops[shopId];
  for (const good of Object.keys(state.goods)) state.goods[good] = 0;
  const breakdown = SITE_EVENTS.find((e) => e.site === shopId && e.kind === 'breakdown');
  if (breakdown) state.event = { kind: 'breakdown', recipe: breakdown.recipe, until: w.turn + TIME.workDayTurns };
}

function hookProblems(bundle: QuestBundle): string[] {
  const queries = Object.keys(QUEST_QUERIES);
  const effects = Object.keys(QUEST_EFFECTS);
  const hooks = new Set([...queries, ...effects]);
  return [
    ...bundle.externals.filter((name) => !hooks.has(name)).map((name) => `External function ${name} has no query or effect in src/sim/quests.ts`),
    ...[...hooks].filter((name) => !bundle.externals.includes(name)).map((name) => `Hook ${name} in src/sim/quests.ts has no EXTERNAL in world.ink`),
    ...queries.filter((name) => effects.includes(name)).map((name) => `Hook ${name} is both a query and an effect`),
  ];
}

function finishQuest(walks: SceneWalk[], id: string, sections: QuestSections, limit: number): QuestReport {
  const visited = eachLanguage((lang) => new Set(walks.flatMap((walk) => [...walk.visited[lang]])));
  const states = walks.reduce((sum, walk) => sum + walk.states, 0);
  const problems = [...new Set(walks.flatMap((walk) => walk.problems))];
  if (walks.some((walk) => walk.stopped)) return { quest: id, states, problems: [...problems, `${id}: stopped after ${limit} states, so loops and reach are unchecked`] };
  const unreached = QUEST_LANGUAGES.flatMap((lang) => sections[lang].filter((s) => !visited[lang].has(s)).map((s) => `${id}${inWords(lang)}: section ${s} is never reached`));
  return { quest: id, states, problems: [...problems, ...unreached] };
}

function eachLanguage<T>(make: (lang: QuestLanguage) => T): Record<QuestLanguage, T> {
  return Object.fromEntries(QUEST_LANGUAGES.map((lang) => [lang, inQuestLanguage(lang, () => make(lang))])) as Record<QuestLanguage, T>;
}

function inWords(lang: QuestLanguage): string {
  return lang === 'en' ? '' : ` in ${lang}`;
}

function walkScene(start: World, bundle: QuestBundle, id: string, limit: number): SceneWalk {
  const visited = eachLanguage(() => new Set<string>());
  const scene: Scene = { problems: [], seen: new Map(), known: new Set(), visited, loads: new Set(), looked: new Set() };
  const { problems, seen } = scene;
  const queue = bundle.quests[id].checkpoints.flatMap((checkpoint) => attempt(problems, `${id}: checkpoint ${checkpoint}`, () => atCheckpoint(walkOf(eachLanguage(() => startQuest(start, bundle, id, checkpoint)), []), checkpoint)));
  for (const walk of queue) scene.known.add(walk.key);
  while (queue.length > 0 && seen.size < limit) {
    const walk = queue.shift() as Walk;
    if (!seen.has(walk.key)) queue.push(...step(walk, bundle, id, scene));
  }
  const stopped = queue.length > 0;
  return { states: seen.size, stopped, problems: stopped ? problems : [...problems, ...trapProblems(id, seen)], visited };
}

function step(walk: Walk, bundle: QuestBundle, id: string, scene: Scene): Walk[] {
  const { problems, seen, visited } = scene;
  const where = `${id}: after ${walk.picks.join(' > ') || 'the start'}`;
  const views = eachLanguage((lang) => viewOf(walk.worlds[lang], bundle, `${where}${inWords(lang)}`, problems));
  const view = views.en;
  const node: Seen = { picks: walk.picks, next: [], free: [], ended: view === null || view.ended || view.quest !== id };
  seen.set(walk.key, node);
  const split = twinSplit(walk.worlds, views);
  if (split) problems.push(`${where}: ${split}`);
  if (split || view === null || view.quest !== id) return [];
  if (view.choices.length > QUEST_CHOICE_CAP) problems.push(`${where}: shows ${view.choices.length} choices at once, over the cap of ${QUEST_CHOICE_CAP}: ${view.choices.join(' | ')}`);
  for (const lang of QUEST_LANGUAGES) for (const path of Object.keys(inkOf(walk.worlds[lang]).visitCounts)) visited[lang].add(path);
  for (const lang of QUEST_LANGUAGES) problems.push(...markupOf(views[lang] ?? view).map((problem) => `${where}${inWords(lang)}: ${problem}`));
  const load = loadKey(walk.worlds.en);
  if (!view.ended && !scene.loads.has(load)) {
    scene.loads.add(load);
    attempt(problems, `${where}: a load here fails`, () => reloaded(walk, bundle));
    for (const lang of QUEST_LANGUAGES) if (firstLook(scene, lang, walk.worlds[lang], view)) attempt(problems, `${where}${inWords(lang)}: the look-ahead fails`, () => inQuestLanguage(lang, () => seenChoices(walk.worlds[lang], bundle)));
  }
  return view.choices.flatMap((text, index) => (view.locked[index] ? [] : attempt(problems, `${id}: after ${[...walk.picks, text].join(' > ')}`, () => {
    const picked = pick(walk, bundle, index, [...walk.picks, text], scene.known);
    node.next.push(picked.key);
    if (view.costs[index] === null) node.free.push(picked.key);
    return picked.walk;
  })).flatMap((next) => (next ? [next] : [])));
}

function firstLook(scene: Scene, lang: QuestLanguage, world: World, view: QuestPage): boolean {
  const key = `${lang}|${world.player.quests.session?.checkpoint}|${view.choices.join('|')}`;
  if (scene.looked.has(key)) return false;
  scene.looked.add(key);
  return true;
}

function viewOf(world: World, bundle: QuestBundle, where: string, problems: string[]): QuestPage | null {
  try {
    return questPage(world, bundle);
  } catch (err) {
    problems.push(`${where}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function twinSplit(worlds: Record<QuestLanguage, World>, views: Record<QuestLanguage, QuestPage | null>): string | null {
  const en = outcomeOf(worlds.en, views.en);
  const split = QUEST_LANGUAGES.find((lang) => outcomeOf(worlds[lang], views[lang]) !== en);
  return split === undefined ? null : `the ${split} twin parts from the English one. English: ${en}. ${split}: ${outcomeOf(worlds[split], views[split])}`;
}

function outcomeOf(world: World, view: QuestPage | null): string {
  const { quests, money, notes, contracts } = world.player;
  const shown = view && { quest: view.quest, choices: view.choices.length, costs: view.costs, checks: view.checks, locked: view.locked, facts: view.facts.length, ended: view.ended };
  return JSON.stringify({ shown, world: quests.world, local: quests.local, session: quests.session, money, notes: notes.map((n) => n.id), contracts: contracts.map((c) => c.id) });
}

function markupOf(view: QuestPage): string[] {
  return [
    ...view.lines.flatMap((line) => markupProblems(line.text, line.tags)),
    ...view.choices.flatMap((choice) => markupProblems(choice, [])),
    ...view.facts.flatMap((fact) => markupProblems(fact, [])),
  ];
}

function pick(walk: Walk, bundle: QuestBundle, index: number, picks: string[], known: Set<string>): { key: string; walk: Walk | null } {
  const first: QuestLanguage = 'en';
  const lead = inQuestLanguage(first, () => chooseQuestOption(walk.worlds[first], bundle, index));
  const key = stateKey(lead);
  if (known.has(key)) return { key, walk: null };
  known.add(key);
  const worlds = eachLanguage((lang) => (lang === first ? lead : chooseQuestOption(walk.worlds[lang], bundle, index)));
  return { key, walk: { key, worlds, picks } };
}

function attempt<T>(problems: string[], where: string, run: () => T): T[] {
  try {
    return [run()];
  } catch (err) {
    problems.push(`${where}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function trapProblems(id: string, seen: Map<string, Seen>): string[] {
  const ending = endingNodes(seen, (node) => node.next);
  const trapped = [...seen].filter(([key]) => !ending.has(key)).map(([, node]) => `${id}: after ${node.picks.join(' > ')}: no choice leads to an end from here`);
  const free = endingNodes(seen, (node) => node.free);
  const broke = [...seen].filter(([key]) => ending.has(key) && !free.has(key)).map(([, node]) => `${id}: after ${node.picks.join(' > ')}: only paid choices lead to an end, so a player with no money is stuck`);
  return [...trapped, ...broke];
}

function endingNodes(seen: Map<string, Seen>, edges: (node: Seen) => string[]): Set<string> {
  const ends = new Set([...seen].filter(([, node]) => node.ended).map(([key]) => key));
  let grew = true;
  while (grew) {
    grew = false;
    for (const [key, node] of seen) {
      if (ends.has(key) || !edges(node).some((next) => ends.has(next))) continue;
      ends.add(key);
      grew = true;
    }
  }
  return ends;
}

function reloaded(walk: Walk, bundle: QuestBundle): Walk {
  eachLanguage((lang) => {
    const loaded = cloneWorld(walk.worlds[lang]);
    loaded.player.quests.live = null;
    restoreQuest(loaded, bundle);
    const { session } = loaded.player.quests;
    const view = session ? questView(loaded, bundle) : null;
    if (view && view.view === 'page' && view.choices.length > 0 && view.lines.length === 0) {
      throw new Error(`a load at checkpoint ${session?.checkpoint} shows no text before its choices. Put the checkpoint on the scene's opening line, and keep the choices in an untagged stitch`);
    }
  });
  return walk;
}

function loadKey(world: World): string {
  const { quests, money, notes, contracts } = world.player;
  return JSON.stringify([quests.session, quests.world, quests.local, money, notes.map((n) => n.id), contracts.map((c) => c.id)]);
}

function atCheckpoint(walk: Walk, checkpoint: string): Walk {
  return { ...walk, key: `${walk.key}@${checkpoint}` };
}

function walkOf(worlds: Record<QuestLanguage, World>, picks: string[]): Walk {
  return { key: stateKey(worlds.en), worlds, picks };
}

const parsedInk = new WeakMap<object, InkState>();

function inkOf(world: World): InkState {
  const live = world.player.quests.live;
  if (!live) throw new Error('The quest left no live state');
  const known = parsedInk.get(live);
  if (known) return known;
  const parsed = JSON.parse(live.ink) as InkState;
  parsedInk.set(live, parsed);
  return parsed;
}

function stateKey(world: World): string {
  const ink = inkOf(world);
  const flow = ink.flows[ink.currentFlowName];
  const choices = flow.currentChoices.map((c) => [c.text, c.targetPath]);
  return JSON.stringify([flow.callstack.threads.map((t) => t.callstack), choices, ink.variablesState, ink.previousRandom, world.player.quests.session, world.player.money, world.player.notes.map((n) => n.id), world.player.contracts.map((c) => c.id)]);
}
