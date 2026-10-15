import { GAME_NOTES, type NoteId } from '../data/locals';
import { GAME_WORLD_VARS, type CompiledQuest, type QuestBundle, type QuestValue, type QuestVarDecl } from '../data/quests';
import { checkQuestLinks, isQuestValue } from './quests';
import type { Player, QuestSession, QuestState, QuestVars } from './types';

export type SavedRevisions = Record<string, number>;
export type SavedQuests = Omit<QuestState, 'live'>;
export type RawQuests = { world: Record<string, unknown>; local: Record<string, Record<string, unknown>>; session: QuestSession | null };
export type QuestRepair = { quests: SavedQuests; notes: Player['notes']; reset: string[]; lost: string[] };

type Saved = { quests: RawQuests; notes: Player['notes'] };
type Doomed = { quests: Set<string>; vars: Set<string>; notes: Set<NoteId> };

const GAME_NOTE_IDS: readonly NoteId[] = Object.values(GAME_NOTES);

export function repairQuests(quests: RawQuests, notes: Player['notes'], revisions: SavedRevisions, bundle: QuestBundle): QuestRepair {
  checkQuestLinks(bundle);
  const kept = keptOf(quests, bundle);
  const saved = { quests: kept.quests, notes };
  const progressed = new Set(questIds(bundle).filter((id) => hasProgress(id, saved, bundle)));
  const roots = brokenQuests(kept.quests, revisions, bundle).filter((id) => progressed.has(id));
  const doomed = closeOver(saved, roots, progressed, bundle);
  const reset = questIds(bundle).filter((id) => doomed.quests.has(id) && losesState(id, saved, doomed, bundle));
  return { ...applied(saved, doomed, bundle), reset, lost: kept.lost };
}

export function newerQuests(revisions: SavedRevisions, bundle: QuestBundle): string[] {
  return questIds(bundle).filter((id) => (revisions[id] ?? 1) > bundle.quests[id].revision);
}

export function questRevisions(bundle: QuestBundle): SavedRevisions {
  return Object.fromEntries(questIds(bundle).map((id) => [id, bundle.quests[id].revision]));
}

function questIds(bundle: QuestBundle): string[] {
  return Object.keys(bundle.quests);
}

function keptOf(saved: RawQuests, bundle: QuestBundle): { quests: RawQuests; lost: string[] } {
  const lostVars = Object.entries(saved.world).filter(([name, value]) => !fits(value, bundle.world[name])).map(([name]) => name);
  const named = [...Object.keys(saved.local), ...(saved.session ? [saved.session.quest] : [])];
  const lostQuests = [...new Set(named)].filter((id) => !bundle.quests[id]);
  const session = saved.session && bundle.quests[saved.session.quest] ? saved.session : null;
  return { quests: { world: without(saved.world, lostVars), local: without(saved.local, lostQuests), session }, lost: [...lostVars, ...lostQuests] };
}

function fits(value: unknown, decl: QuestVarDecl | undefined): boolean {
  return decl !== undefined && typeof value === decl.type;
}

function without<T>(record: Record<string, T>, names: readonly string[]): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => !names.includes(name)));
}

function holdsState(id: string, saved: Saved): boolean {
  return Object.keys(saved.quests.local[id] ?? {}).length > 0 || saved.quests.session?.quest === id;
}

function hasProgress(id: string, saved: Saved, bundle: QuestBundle): boolean {
  const quest = bundle.quests[id];
  if (holdsState(id, saved)) return true;
  return writesHeldValue(quest, saved.quests.world) || saved.notes.some((note) => quest.links.notes.includes(note.id));
}

function writesHeldValue(quest: CompiledQuest, world: RawQuests['world']): boolean {
  return Object.entries(quest.links.writes).some(([name, values]) => holds(world, name, values));
}

function holds(world: RawQuests['world'], name: string, values: readonly QuestValue[]): boolean {
  const value = world[name];
  return isQuestValue(value) && values.includes(value);
}

function brokenQuests(quests: RawQuests, revisions: SavedRevisions, bundle: QuestBundle): string[] {
  return questIds(bundle).filter((id) => bundle.quests[id].revision > (revisions[id] ?? 1) || unfitting(id, quests, bundle.quests[id]));
}

function unfitting(id: string, quests: RawQuests, quest: CompiledQuest): boolean {
  const badVars = Object.entries(quests.local[id] ?? {}).some(([name, value]) => !fits(value, quest.vars[name]));
  return badVars || (quests.session?.quest === id && !quest.checkpoints.includes(quests.session.checkpoint));
}

function closeOver(saved: Saved, roots: readonly string[], progressed: ReadonlySet<string>, bundle: QuestBundle): Doomed {
  const begun = roots.flatMap((id) => bundle.quests[id].links.begins).filter((id) => progressed.has(id));
  const doomed: Doomed = { quests: new Set([...roots, ...begun]), vars: new Set(orphanVars(saved.quests.world, bundle)), notes: new Set() };
  let readers: string[];
  do {
    for (const name of doomedVars(saved.quests.world, doomed.quests, bundle)) doomed.vars.add(name);
    for (const id of doomedNotes(saved.notes, doomed.quests, bundle)) doomed.notes.add(id);
    readers = [...progressed].filter((id) => !doomed.quests.has(id) && readsDoomed(bundle.quests[id], doomed));
    for (const id of readers) doomed.quests.add(id);
  } while (readers.length > 0);
  return doomed;
}

function orphanVars(world: RawQuests['world'], bundle: QuestBundle): string[] {
  return Object.entries(world).filter(([name, value]) => !GAME_WORLD_VARS[name] && writersOf(name, value, bundle).length === 0).map(([name]) => name);
}

function writersOf(name: string, value: unknown, bundle: QuestBundle): string[] {
  return questIds(bundle).filter((id) => holds({ [name]: value }, name, bundle.quests[id].links.writes[name] ?? []));
}

function doomedVars(world: RawQuests['world'], quests: ReadonlySet<string>, bundle: QuestBundle): string[] {
  return Object.entries(world).filter(([name, value]) => {
    const game = GAME_WORLD_VARS[name];
    if (game) return game.gates !== null && quests.has(game.gates);
    const writers = writersOf(name, value, bundle);
    return writers.length > 0 && writers.every((id) => quests.has(id));
  }).map(([name]) => name);
}

function doomedNotes(notes: Player['notes'], quests: ReadonlySet<string>, bundle: QuestBundle): NoteId[] {
  return notes.map((note) => note.id).filter((id) => {
    if (GAME_NOTE_IDS.includes(id)) return false;
    const givers = questIds(bundle).filter((quest) => bundle.quests[quest].links.notes.includes(id));
    return givers.length > 0 && givers.every((quest) => quests.has(quest));
  });
}

function readsDoomed(quest: CompiledQuest, doomed: Doomed): boolean {
  return quest.links.reads.some((name) => doomed.vars.has(name)) || quest.links.readsNotes.some((id) => doomed.notes.has(id as NoteId));
}

function losesState(id: string, saved: Saved, doomed: Doomed, bundle: QuestBundle): boolean {
  const quest = bundle.quests[id];
  if (holdsState(id, saved)) return true;
  const lostValue = Object.entries(quest.links.writes).some(([name, values]) => doomed.vars.has(name) && holds(saved.quests.world, name, values));
  return lostValue || quest.links.notes.some((note) => doomed.notes.has(note as NoteId));
}

function applied(saved: Saved, doomed: Doomed, bundle: QuestBundle): { quests: SavedQuests; notes: Player['notes'] } {
  const session = saved.quests.session && !doomed.quests.has(saved.quests.session.quest) ? saved.quests.session : null;
  const world = fitted(without(saved.quests.world, [...doomed.vars]), bundle.world);
  const local = Object.fromEntries(Object.entries(without(saved.quests.local, [...doomed.quests])).map(([id, vars]) => [id, fitted(vars, bundle.quests[id].vars)]));
  return { quests: { world, local, session }, notes: saved.notes.filter((note) => !doomed.notes.has(note.id)) };
}

function fitted(vars: Record<string, unknown>, decls: Record<string, QuestVarDecl>): QuestVars {
  return Object.fromEntries(Object.entries(vars).map(([name, value]) => {
    if (!isQuestValue(value) || !fits(value, decls[name])) throw new Error(`Quest repair kept ${name}, which does not fit its declaration`);
    return [name, value];
  }));
}
