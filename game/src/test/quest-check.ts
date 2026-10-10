
import { NOTE_IDS } from '../data/locals';
import { WAGON_SEEN, type QuestBundle, type QuestValue } from '../data/quests';
import { REGION } from '../data/region';
import { STORY_WRECKS } from '../data/salvage';
import { MAX_RANK, SKILL_IDS } from '../data/skills';
import { playerVehicle } from '../sim/damage';
import { isNoteId, learnNote, localOfQuest, takeTownWork, townWork } from '../sim/dialogue-rules';
import { shopAt, siteOf } from '../sim/market';
import { chooseQuestOption, QUEST_EFFECTS, QUEST_QUERIES, questView, restoreQuest, startQuest, type QuestView } from '../sim/quests';
import { sitePads } from '../sim/sites';
import type { World } from '../sim/types';
import { cloneWorld } from '../sim/world';
import { markupProblems } from '../ui/quest-text';
import { compileSources, WORLD_FILE, type QuestSources } from './quest-compile';

export type QuestReport = { quest: string; states: number; problems: string[] };

type Walk = { key: string; world: World; picks: string[] };
type Seen = { picks: string[]; next: string[]; ended: boolean };
type InkState = { flows: Record<string, { callstack: { threads: { callstack: unknown }[] }; currentChoices: { text: string; targetPath: string }[] }>; currentFlowName: string; variablesState: unknown; visitCounts: Record<string, number>; previousRandom: number };

export type QuestScenes = (questId: string) => World[];
type SceneWalk = { states: number; stopped: boolean; problems: string[] };

export const QUEST_STATE_LIMIT = 5000;

export type QuestCheck = { shared: QuestReport; questIds: string[]; walk: (questId: string, scenes: QuestScenes, limit: number) => QuestReport };

export function questCheck(sources: QuestSources): QuestCheck {
  const { bundle, errors, warnings, sections } = compileSources(sources, true);
  const hooks = hookProblems(bundle);
  const shared: QuestReport = { quest: 'all', states: 0, problems: [...errors, ...warnings, ...hooks] };
  const assigned = worldAssignments(sources, bundle);
  const walk = (id: string, scenes: QuestScenes, limit: number): QuestReport => {
    const read = assigned.filter(([name]) => readsWorldVar(sources, id, name));
    return exploreQuest(withWorldVars(scenes(id), read), bundle, id, sections[id] ?? [], limit);
  };
  return { shared, questIds: hooks.length > 0 ? [] : Object.keys(bundle.quests), walk };
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

function withWorldVars(scenes: World[], assigned: readonly [string, QuestValue][]): World[] {
  const first = scenes[0];
  return [...scenes, ...assigned.map(([name, value]) => {
    const w = cloneWorld(first);
    w.player.quests.world = { ...w.player.quests.world, [name]: value };
    return w;
  })];
}

export function gameScenes(base: World): QuestScenes {
  const shared = { ...base, terrain: Object.freeze({ ...base.terrain }), obstacles: [] };
  return (questId) => {
    const local = localOfQuest(questId);
    const fresh = cloneWorld(shared);
    if (local) parkAt(fresh, local.town);
    return [fresh, veteran(fresh)];
  };
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
  while (shopAt(w) && townWork(w)) takeTownWork(w);
  w.events = [];
  return w;
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

function exploreQuest(scenes: World[], bundle: QuestBundle, id: string, sections: readonly string[], limit: number): QuestReport {
  const visited = new Set<string>();
  const walks = scenes.map((scene) => walkScene(scene, bundle, id, visited, limit));
  const states = walks.reduce((sum, walk) => sum + walk.states, 0);
  const problems = [...new Set(walks.flatMap((walk) => walk.problems))];
  if (walks.some((walk) => walk.stopped)) return { quest: id, states, problems: [...problems, `${id}: stopped after ${limit} states, so loops and reach are unchecked`] };
  return { quest: id, states, problems: [...problems, ...sections.filter((s) => !visited.has(s)).map((s) => `${id}: section ${s} is never reached`)] };
}

function walkScene(start: World, bundle: QuestBundle, id: string, visited: Set<string>, limit: number): SceneWalk {
  const problems: string[] = [];
  const seen = new Map<string, Seen>();
  const queue = bundle.quests[id].checkpoints.flatMap((checkpoint) => attempt(problems, `${id}: checkpoint ${checkpoint}`, () => walkOf(startQuest(start, bundle, id, checkpoint), [])));
  while (queue.length > 0 && seen.size < limit) {
    const walk = queue.shift() as Walk;
    if (!seen.has(walk.key)) queue.push(...step(walk, bundle, id, seen, visited, problems));
  }
  const stopped = queue.length > 0;
  return { states: seen.size, stopped, problems: stopped ? problems : [...problems, ...trapProblems(id, seen)] };
}

function step(walk: Walk, bundle: QuestBundle, id: string, seen: Map<string, Seen>, visited: Set<string>, problems: string[]): Walk[] {
  const where = `${id}: after ${walk.picks.join(' > ') || 'the start'}`;
  const view = viewOf(walk.world, bundle, where, problems);
  const node: Seen = { picks: walk.picks, next: [], ended: view === null || view.ended || view.quest !== id };
  seen.set(walk.key, node);
  if (view === null || view.quest !== id) return [];
  for (const path of Object.keys(inkOf(walk.world).visitCounts)) visited.add(path);
  problems.push(...markupOf(view).map((problem) => `${where}: ${problem}`));
  if (!view.ended) attempt(problems, `${where}: a load here fails`, () => reloaded(walk, bundle));
  return view.choices.flatMap((text, index) => (view.locked[index] ? [] : attempt(problems, `${id}: after ${[...walk.picks, text].join(' > ')}`, () => {
    const next = walkOf(chooseQuestOption(walk.world, bundle, index), [...walk.picks, text]);
    node.next.push(next.key);
    return next;
  })));
}

function viewOf(world: World, bundle: QuestBundle, where: string, problems: string[]): QuestView | null {
  try {
    return questView(world, bundle);
  } catch (err) {
    problems.push(`${where}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function markupOf(view: QuestView): string[] {
  return [
    ...view.lines.flatMap((line) => markupProblems(line.text, line.tags)),
    ...view.choices.flatMap((choice) => markupProblems(choice, [])),
    ...view.facts.flatMap((fact) => markupProblems(fact, [])),
  ];
}

function attempt(problems: string[], where: string, run: () => Walk): Walk[] {
  try {
    return [run()];
  } catch (err) {
    problems.push(`${where}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function trapProblems(id: string, seen: Map<string, Seen>): string[] {
  const ends = new Set([...seen].filter(([, node]) => node.ended).map(([key]) => key));
  let grew = true;
  while (grew) {
    grew = false;
    for (const [key, node] of seen) {
      if (ends.has(key) || !node.next.some((next) => ends.has(next))) continue;
      ends.add(key);
      grew = true;
    }
  }
  return [...seen].filter(([key]) => !ends.has(key)).map(([, node]) => `${id}: after ${node.picks.join(' > ')}: no choice leads to an end from here`);
}

function reloaded(walk: Walk, bundle: QuestBundle): Walk {
  const loaded = cloneWorld(walk.world);
  loaded.player.quests.live = null;
  restoreQuest(loaded, bundle);
  return walk;
}

function walkOf(world: World, picks: string[]): Walk {
  return { key: stateKey(world), world, picks };
}

function inkOf(world: World): InkState {
  const live = world.player.quests.live;
  if (!live) throw new Error('The quest left no live state');
  return JSON.parse(live.ink) as InkState;
}

function stateKey(world: World): string {
  const ink = inkOf(world);
  const flow = ink.flows[ink.currentFlowName];
  const choices = flow.currentChoices.map((c) => [c.text, c.targetPath]);
  return JSON.stringify([flow.callstack.threads.map((t) => t.callstack), choices, ink.variablesState, ink.previousRandom, world.player.quests.session, world.player.money, world.player.notes.map((n) => n.id), world.player.contracts.map((c) => c.id)]);
}
