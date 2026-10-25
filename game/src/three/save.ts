import { t, type Msg } from '../text/msg';
import { isNoteId } from '../data/locals';
import type { BakedMap } from '../sim/terrain';
import { isBakedObstacle, isBreakable, mapObstacles } from '../sim/mapgen';
import { townAt } from '../sim/sites';
import { reachedOutpostAt } from '../sim/chaos-highway';
import { highwayMap } from '../sim/highway';
import { fitBake, repairMap, settleOffHollow, settleTrucks, type SavedBroken, type SavedMapWorld } from '../sim/map-repair';
import { repairContent } from '../sim/save-repair';
export { newMapFor } from '../sim/highway';
import type { BrokenProp, Obstacle, QuestState, World, WorldSetup } from '../sim/types';
import { QUESTS, restoreQuest } from '../sim/quests';
import { newerQuests, questRevisions, repairQuests, type QuestRepair, type SavedRevisions } from '../sim/quest-repair';
import { refreshVision } from '../sim/vision';
import { hollowObstaclesFor, isHollowObstacle } from '../sim/hollow-layout';
import { isMode, modeMap, repairSetup } from '../sim/settings';
import { clearTips } from '../ui/tips';
import type { NewGameActions } from '../ui/new-game';
import { settleAims } from '../sim/combat';
import { stockOldSpots } from '../sim/salvage';
import { checkCompanies } from '../sim/companies';
import { checkRigs } from '../sim/rig';
import { clockOf } from '../sim/sun';
import { allSlots, listSaves, manualSlots, requestBoot, slotLabel, type BootRequest, type SlotId } from './save-slots';
import type { SaveSlots } from './save-db';
import { reportError } from './crash';
import { CONFIG, GAME_VERSION } from '../config';
import { download } from '../ui/dom';
import type { RunLog } from './run-log';
import { checkSavedWorld, dropUnknownKeys, type SavedWorld } from './save-fit';
import { RELEASE_STEPS, SAVE_MAJOR, TINY_FROM, TINY_STEPS, type NamedStep, type ReleaseStep, type SavedJson } from './save-migrations';

declare const __SAVE_SCOPE__: string;

type Step = ReleaseStep['step'];

type ChainStep = Pick<ReleaseStep, 'from' | 'to' | 'step'>;

export type SavedSteps = { from: number; names: readonly string[] };

export const SAVE_FORMAT = { major: SAVE_MAJOR, minor: TINY_FROM + TINY_STEPS.length } as const;

function checkedChain(releases: readonly ChainStep[], tinyFrom: number): void {
  releases.forEach((release, i) => {
    if (release.to <= release.from) throw new Error(`Release step ${release.from} does not move forward`);
    const next = i + 1 < releases.length ? releases[i + 1].from : tinyFrom;
    if (release.to !== next) throw new Error(`Release step ${release.from} to ${release.to} does not meet ${next}`);
  });
}

export function stepsOf(releases: readonly ChainStep[], tinyFrom: number, tiny: readonly Step[], minor: number): readonly Step[] | null {
  checkedChain(releases, tinyFrom);
  if (minor >= tinyFrom && minor <= tinyFrom + tiny.length) return tiny.slice(minor - tinyFrom);
  const anchor = releases.findIndex((release) => release.from === minor);
  if (anchor < 0) return null;
  return [...releases.slice(anchor).map((release) => release.step), ...tiny];
}

export function stepsFrom(minor: number): readonly Step[] | null {
  return stepsOf(RELEASE_STEPS, TINY_FROM, TINY_STEPS.map((named) => named.step), minor);
}

function unknownStepError(steps: SavedSteps, why: string): SaveError {
  return new SaveError('unknownStep', null, `${why}, in a save listing ${JSON.stringify(steps)}`);
}

function lackedTiny(tiny: readonly NamedStep[], steps: SavedSteps): readonly Step[] {
  const known = new Set(tiny.map((named) => named.name));
  const lost = steps.names.find((name) => !known.has(name));
  if (lost !== undefined) throw unknownStepError(steps, `This build has no step ${lost}`);
  const held = new Set(steps.names);
  return tiny.filter((named) => !held.has(named.name)).map((named) => named.step);
}

function startsWithNames(steps: SavedSteps, names: readonly string[]): boolean {
  return names.every((name, i) => steps.names[i] === name);
}

export function namedSteps(releases: readonly ReleaseStep[], tinyFrom: number, tiny: readonly NamedStep[], steps: SavedSteps): readonly Step[] {
  checkedChain(releases, tinyFrom);
  if (steps.from === tinyFrom) return lackedTiny(tiny, steps);
  const release = releases.find((r) => r.from === steps.from);
  if (release && steps.names.length === 0) return stepsOf(releases, tinyFrom, tiny.map((named) => named.step), steps.from)!;
  return namedSteps(releases, tinyFrom, tiny, afterRelease(release, steps));
}

function afterRelease(release: ReleaseStep | undefined, steps: SavedSteps): SavedSteps {
  if (!release?.names) throw unknownStepError(steps, `No release step with names starts at ${steps.from}`);
  if (!startsWithNames(steps, release.names)) throw unknownStepError(steps, `The names do not begin with those of release step ${release.from} to ${release.to}`);
  return { from: release.to, names: steps.names.slice(release.names.length) };
}

export function anchorMinors(): number[] {
  return [...RELEASE_STEPS.map((release) => release.from), TINY_FROM];
}

export function saveKey(scope: string): string {
  return scope === '' ? 'roam.save' : `roam.save.${scope}`;
}

export const SAVE_KEY = saveKey(__SAVE_SCOPE__);

export type SaveErrorCode =
  | 'unreadable' | 'otherMap' | 'bakedProps' | 'invalidWorld' | 'invalidSave' | 'badSetup'
  | 'incompatible' | 'newer' | 'notMigrated' | 'noFormat' | 'badExplored' | 'badQuests' | 'newerQuests' | 'outOfReach' | 'mapChanged' | 'unknownStep';

export class SaveError extends Error {
  constructor(readonly code: SaveErrorCode, readonly format: { major: number; minor: number } | null = null, detail = '') {
    super(`Save error ${code}${detail ? `: ${detail}` : ''}`);
  }
}

export function carriesOnLoad(error: SaveError): boolean {
  return error.code === 'outOfReach' || error.code === 'mapChanged' || error.code === 'unknownStep';
}

export type SaveEnvelope = { format: typeof SAVE_FORMAT; steps: SavedSteps; quests: SavedRevisions; savedAt: number; runId: string; world: SavedWorld };

export function clearSlot(slots: SaveSlots, slot: SlotId): void {
  slots.remove(slot);
}

export function clearGame(slots: SaveSlots, storage: Storage): void {
  clearSlot(slots, 'auto');
  clearSlot(slots, 'day');
  clearTips(storage);
}

export function hasSave(slots: SaveSlots, ids: readonly SlotId[]): boolean {
  return ids.some((slot) => slots.has(slot));
}

export function storedSave(slots: SaveSlots, slot: SlotId): unknown {
  return slots.get(slot) ?? undefined;
}

export function savedRunId(envelope: unknown): string | null {
  const save = envelope as { runId?: unknown; world?: { seed?: unknown } } | null;
  if (typeof save?.runId === 'string') return save.runId;
  if (typeof save?.world?.seed === 'number') return `legacy-${save.world.seed}`;
  return null;
}

export function mapFor(saved: Pick<World, 'mapHash' | 'seed' | 'setup' | 'chaosHighway'>, icarus: BakedMap): BakedMap {
  const highway = saved.mapHash.startsWith('highway:');
  if (modeMap(saved.setup.mode) !== 'highway') {
    if (highway) throw new SaveError('otherMap', null, `A ${saved.setup.mode} save names highway map ${saved.mapHash}`);
    return icarus;
  }
  if (!saved.chaosHighway) throw new SaveError('mapChanged', null, 'This Chaos Highway run is from older rules: it was laid on Icarus roads or has no hauler, and the highway has replaced them');
  if (!highway) throw new SaveError('otherMap', null, `A Chaos Highway save names map ${saved.mapHash}, which is no highway`);
  const map = highwayMap(saved.seed, saved.chaosHighway.window);
  if (map.hash !== saved.mapHash) throw new SaveError('mapChanged', null, `map ${saved.mapHash}, not the current highway ${map.hash}`);
  return map;
}

export function loadWorld(slots: SaveSlots, slot: SlotId, icarus: BakedMap): World | null {
  const envelope = slots.get(slot);
  if (envelope === null) return null;
  try {
    return loadedWorld(envelope, icarus);
  } catch (error) {
    if (error instanceof SaveError) throw error;
    throw new SaveError('invalidWorld', null, `Loading failed: ${(error as Error).message}`);
  }
}

function loadedWorld(envelope: unknown, icarus: BakedMap): World {
  const world = savedWorld(envelope);
  const revisions = savedRevisionsOf(envelope);
  const repaired = savedQuests(world.player.quests, world.player.notes, revisions);
  const map = mapFor(world, icarus);
  const staged = stagedWorld(world, repaired);
  const rebaked = world.mapHash !== map.hash;
  const loaded = rebaked ? repairMap(staged, map) : onSameMap(staged, map);
  if (!rebaked) fitBake(loaded, map);
  repairContent(loaded);
  if (rebaked) settleTrucks(loaded);
  else settleOffHollow(loaded);
  restoredQuests(loaded, world, revisions, repaired);
  stockOldSpots(loaded, map);
  checkCompanies(loaded);
  checkSavedRigs(loaded);
  refreshVision(loaded);
  settleAims(loaded);
  const result = { ...loaded, events: [] };
  const misfit = savedMisfit(saveOf(result).world);
  if (misfit) throw misfit;
  return result;
}

export function savedMisfit(saved: SavedWorld): SaveError | null {
  try {
    checkSavedWorld(saved);
    return null;
  } catch (error) {
    return new SaveError('invalidWorld', null, (error as Error).message);
  }
}

function stagedWorld(world: SavedWorld, quests: QuestRepair): SavedMapWorld {
  const explored = unpackExplored(world.player.explored, world.size * world.size);
  return {
    ...world,
    player: { ...world.player, explored, visible: [], contacts: [], clouds: [], notes: quests.notes, quests: { ...quests.quests, live: null } },
    vehicles: world.vehicles.map((v) => ({ ...v, trail: [] })),
    events: [],
    removed: [],
  };
}

function restoredQuests(loaded: World, saved: SavedWorld, revisions: SavedRevisions, repair: QuestRepair): void {
  const session = repair.quests.session;
  try {
    restoreQuest(loaded, QUESTS);
  } catch (error) {
    if (!session) throw error;
    const redone = savedQuests(saved.player.quests, saved.player.notes, revisions, [session.quest]);
    loaded.player.quests = { ...redone.quests, live: null };
    loaded.player.notes = redone.notes.filter((n) => isNoteId(n.id));
  }
}

function onSameMap(staged: SavedMapWorld, map: BakedMap): World {
  if (staged.obstacles.some((o) => isBakedObstacle(o) || isHollowObstacle(o))) throw new SaveError('bakedProps');
  const baked = mapObstacles(map);
  const broken = brokenProps(baked, staged.broken);
  const gone = new Set(broken.map((b) => b.obstacle.id));
  return {
    ...staged,
    obstacles: [...baked.filter((o) => !gone.has(o.id)), ...hollowObstaclesFor(staged), ...staged.obstacles],
    broken,
    terrain: map.terrain,
  };
}

function checkSavedRigs(world: World): void {
  try {
    checkRigs(world);
  } catch (error) {
    throw new SaveError('invalidWorld', null, (error as Error).message);
  }
}

function savedQuests(value: unknown, notes: unknown, revisions: SavedRevisions, unrestorable: readonly string[] = []): QuestRepair {
  if (!isQuestState(value)) throw new SaveError('badQuests');
  if (!Array.isArray(notes) || !notes.every((note) => isJsonObject(note) && typeof note.id === 'string')) throw new SaveError('invalidWorld', null, 'player notes are no list of notes');
  const newer = newerQuests(revisions, QUESTS);
  if (newer.length > 0) throw new SaveError('newerQuests', null, newer.join(', '));
  return repairQuests(value, notes, revisions, QUESTS, unrestorable);
}

export function savedRevisionsOf(envelope: unknown): SavedRevisions {
  const quests = isJsonObject(envelope) ? envelope.quests : undefined;
  if (!isJsonObject(quests)) return {};
  return Object.fromEntries(Object.entries(quests).filter((entry): entry is [string, number] => Number.isInteger(entry[1])));
}

function isQuestState(value: unknown): value is QuestState {
  if (!isJsonObject(value) || !isJsonObject(value.world) || !isJsonObject(value.local)) return false;
  return Object.values(value.local).every(isJsonObject) && (value.session === null || isQuestSession(value.session));
}

function isQuestSession(value: unknown): boolean {
  return isJsonObject(value) && typeof value.quest === 'string' && typeof value.checkpoint === 'string' && Number.isInteger(value.seed);
}


function brokenProps(baked: readonly Obstacle[], broken: readonly SavedBroken[]): BrokenProp[] {
  const byId = new Map(baked.map((o) => [o.id, o]));
  return broken.flatMap(({ id, turn }) => {
    const obstacle = byId.get(id);
    return obstacle && isBreakable(obstacle) ? [{ obstacle, turn }] : [];
  });
}

function savedWorld(save: unknown): SavedWorld {
  const world = migratedWorld(save);
  dropUnknownKeys(world);
  if (!isWorld(world)) throw new SaveError('invalidWorld');
  return { ...world, setup: savedSetup(world.setup) };
}

function savedSetup(setup: unknown): WorldSetup {
  if (!isJsonObject(setup) || !isMode(setup.mode)) throw new SaveError('badSetup', null, `Unknown game mode in ${JSON.stringify(setup) ?? 'no setup'}`);
  return repairSetup(setup);
}

function migratedWorld(stored: unknown): unknown {
  const save = envelopeOf(stored);
  const { major, minor } = formatOf(save);
  if (major !== SAVE_MAJOR) throw new SaveError('incompatible', { major, minor });
  const steps = stepsToRun(save, { major, minor });
  if (!isJsonObject(save.world)) throw new SaveError('invalidWorld');
  try {
    return steps.reduce((world, step) => step(world), save.world);
  } catch (err) {
    throw new SaveError('notMigrated', { major, minor }, String(err));
  }
}

function stepsToRun(save: SavedJson, format: { major: number; minor: number }): readonly Step[] {
  if (save.steps !== undefined) return namedSteps(RELEASE_STEPS, TINY_FROM, TINY_STEPS, savedStepsOf(save.steps, format));
  if (format.minor > SAVE_FORMAT.minor) throw new SaveError('newer', format);
  const steps = stepsFrom(format.minor);
  if (!steps) throw new SaveError('outOfReach', format);
  return steps;
}

function savedStepsOf(value: unknown, format: { major: number; minor: number }): SavedSteps {
  if (!isJsonObject(value) || !isCount(value.from) || !Array.isArray(value.names) || !value.names.every((name) => typeof name === 'string')) throw new SaveError('noFormat');
  if (format.minor !== value.from + value.names.length) throw new SaveError('noFormat', format, `The steps list from ${value.from} with ${value.names.length} names does not match minor ${format.minor}`);
  return { from: value.from, names: value.names };
}

function envelopeOf(stored: unknown): SavedJson {
  if (typeof stored === 'string') throw new SaveError('unreadable');
  if (!isJsonObject(stored)) throw new SaveError('invalidSave');
  return stored;
}

function formatOf(save: SavedJson): { major: number; minor: number } {
  if (save.version === '1.0.0') return { major: 1, minor: 0 };
  const format = save.format;
  if (!isJsonObject(format) || !isCount(format.major) || !isCount(format.minor)) throw new SaveError('noFormat');
  return { major: format.major, minor: format.minor };
}

function isJsonObject(value: unknown): value is SavedJson {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

const WORLD_LISTS = ['vehicles', 'obstacles', 'broken', 'salvage', 'weather', 'dustClouds', 'states', 'craters'] as const;

function isWorld(value: unknown): value is SavedWorld {
  if (!value || typeof value !== 'object') return false;
  const world = value as Partial<SavedWorld>;
  if ('terrain' in world) return false;
  return Number.isInteger(world.turn) && world.turn! > 0 && Number.isInteger(world.seed)
    && Number.isInteger(world.rngState) && Number.isInteger(world.nextId) && world.nextId! >= 0
    && Number.isInteger(world.size) && world.size! > 0
    && !!world.spawnTimer && typeof world.spawnTimer === 'object' && !Array.isArray(world.spawnTimer)
    && WORLD_LISTS.every((key) => Array.isArray(world[key]))
    && !!world.player && typeof world.player === 'object'
    && typeof world.player.vehicleId === 'string';
}

export function isDayStart(turn: number): boolean {
  return clockOf(turn).day !== clockOf(turn - 1).day;
}

export function saveWorld(slots: SaveSlots, world: World, runId: string, interval: number, savedAt: number): void {
  if (!Number.isInteger(interval) || interval <= 0) throw new Error('Invalid save interval');
  if (world.player.state === 'dead') return;
  if ((world.turn - 1) % interval === 0) writeSave(slots, 'auto', world, runId, savedAt);
  if (isDayStart(world.turn)) writeSave(slots, 'day', world, runId, savedAt);
}

export function saveInTown(slots: SaveSlots, world: World, runId: string, savedAt: number): void {
  if (world.player.state === 'active' && (townAt(world) || reachedOutpostAt(world))) writeSave(slots, 'auto', world, runId, savedAt);
}

export function saveOnArrival(slots: SaveSlots, world: World, runId: string, savedAt: number): void {
  if (world.player.state === 'active' && world.events.some((e) => e.t === 'outpostReached')) writeSave(slots, 'auto', world, runId, savedAt);
}

export function writeSave(slots: SaveSlots, slot: SlotId, world: World, runId: string, savedAt: number): boolean {
  if (world.player.state === 'dead') throw new Error('Cannot save a world whose player is dead');
  const envelope: SaveEnvelope = { ...saveOf(world), savedAt, runId };
  const misfit = savedMisfit(envelope.world);
  if (misfit) {
    slots.onError(misfit);
    return false;
  }
  slots.put(slot, envelope);
  return true;
}

export function saveOf(world: World): { format: typeof SAVE_FORMAT; steps: SavedSteps; quests: SavedRevisions; world: SavedWorld } {
  const { terrain: _terrain, events: _events, removed: _removed, ...saved } = world;
  const { visible: _visible, contacts: _contacts, clouds: _clouds, quests: { live: _live, ...quests }, ...player } = saved.player;
  const vehicles = saved.vehicles.map(({ trail: _trail, ...vehicle }) => vehicle);
  const obstacles = saved.obstacles.filter((o) => !isBakedObstacle(o) && !isHollowObstacle(o));
  const broken = saved.broken.map(({ obstacle, turn }) => ({ id: obstacle.id, turn }));
  return { format: SAVE_FORMAT, steps: { from: TINY_FROM, names: TINY_STEPS.map((named) => named.name) }, quests: questRevisions(QUESTS), world: { ...saved, player: { ...player, quests, explored: packExplored(player.explored) }, vehicles, obstacles, broken } };
}

export function packExplored(explored: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(explored.length / 8));
  explored.forEach((value, i) => {
    if (value !== 0 && value !== 1) throw new Error(`Explored tile ${i} is ${value}, not 0 or 1`);
    bytes[i >> 3] |= value << (i & 7);
  });
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function unpackExplored(packed: unknown, tiles: number): Uint8Array {
  if (typeof packed !== 'string') throw new SaveError('badExplored');
  let binary: string;
  try {
    binary = atob(packed);
  } catch {
    throw new SaveError('badExplored');
  }
  if (binary.length !== Math.ceil(tiles / 8)) throw new SaveError('badExplored');
  const explored = new Uint8Array(tiles);
  for (let i = 0; i < tiles; i++) explored[i] = (binary.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return explored;
}

export function saveStore(slots: SaveSlots, log: RunLog, session: Storage, world: () => World, runId: string, slotCount: number) {
  return {
    list: () => listSaves(slots, slotCount),
    manualSlots: () => manualSlots(slotCount),
    hasSave: () => hasSave(slots, allSlots(slotCount)),
    save: (slot: SlotId) => writeSave(slots, slot, world(), runId, Date.now()),
    reboot: (request: BootRequest) => {
      requestBoot(session, SAVE_KEY, request);
      Promise.all([slots.flush(), log.flush()]).then(() => window.location.reload(), reportError);
    },
    newGame: {
      requestBoot: (request: BootRequest) => requestBoot(session, SAVE_KEY, request),
      reload: () => void Promise.all([slots.flush(), log.flush()]).then(() => window.location.reload(), reportError),
      confirm: (text: string) => window.confirm(text),
    } satisfies NewGameActions,
  };
}

export type SaveStore = ReturnType<typeof saveStore>;

export class SaveHold {
  private errors = false;
  private tainted = false;

  get held(): boolean {
    return this.errors;
  }

  noteError(): void {
    this.errors = true;
    this.tainted = true;
  }

  beginTurn(): void {
    this.tainted = false;
  }

  finishTurn(): void {
    if (!this.tainted) this.errors = false;
  }
}

export const SAVE_HELD_NOTE = t('save.held');

export const SAVE_FAILED_NOTE = t('save.failed');
export const TURN_FAILED_NOTE = t('save.turnFailed');

export type Run = { slots: SaveSlots; runId: string; log: RunLog; mapHash: string };

export function changeMapIfMoved(run: Run, world: World, hold: SaveHold, session: Storage, reload: () => void): boolean {
  if (world.mapHash === run.mapHash) return false;
  if (hold.held) throw new Error(`The map moved to ${world.mapHash} while saves are held, so a reboot would lose the turn`);
  if (!world.events.some((e) => e.t === 'roadOpened')) throw new Error(`The map moved to ${world.mapHash} with no road opened`);
  run.log.note(world);
  if (!writeSave(run.slots, 'auto', world, run.runId, Date.now())) throw new Error(`The map moved to ${world.mapHash} but the world failed the save check, so a reboot would lose the turn`);
  run.mapHash = world.mapHash;
  requestBoot(session, SAVE_KEY, { slot: 'auto', reason: 'road' });
  Promise.all([run.slots.flush(), run.log.flush()]).then(reload, reportError);
  return true;
}

export class GameSaves {
  private readonly hold = new SaveHold();
  private moving = false;

  constructor(private readonly run: Run, private readonly note: (text: Msg) => void, private readonly record: (text: Msg) => void) {
    run.slots.onError = (err) => this.failed(err);
  }

  menuActions(world: () => World) {
    const saves = saveStore(this.run.slots, this.run.log, window.sessionStorage, world, this.run.runId, CONFIG.saveSlots);
    return {
      ...saves,
      save: (slot: SlotId) => this.saveManual(slot, saves.save),
      exportSave: () => this.exportSave(world()),
      exportLog: () => this.exportLog(world()).catch((err) => this.failed(err)),
    };
  }

  private saveManual(slot: SlotId, save: (slot: SlotId) => boolean): void {
    if (this.hold.held) return this.note(SAVE_HELD_NOTE);
    if (save(slot)) this.record(t('save.savedTo', { slot: slotLabel(slot) }));
  }

  logWorld(world: World): void {
    this.run.log.note(world);
  }

  private exportSave(world: World): void {
    const envelope: SaveEnvelope = { ...saveOf(world), savedAt: Date.now(), runId: this.run.runId };
    download(`roam-save-turn-${world.turn}.json`, JSON.stringify(envelope), 'application/json');
  }

  private async exportLog(world: World): Promise<void> {
    const header = { kind: 'header', runId: this.run.runId, version: GAME_VERSION, seed: world.seed, mapHash: world.mapHash, exportedAt: Date.now() };
    download(`roam-run-${this.run.runId}.jsonl`, await this.run.log.lines(header), 'application/x-ndjson');
  }

  noteError(): void {
    this.hold.noteError();
  }

  beginTurn(): void {
    this.hold.beginTurn();
  }

  afterTurn(world: World): void {
    this.hold.finishTurn();
    if (this.hold.held) return;
    saveWorld(this.run.slots, world, this.run.runId, CONFIG.saveTurns, Date.now());
    saveOnArrival(this.run.slots, world, this.run.runId, Date.now());
  }

  changeMapIfMoved(world: World): boolean {
    this.moving ||= changeMapIfMoved(this.run, world, this.hold, window.sessionStorage, () => window.location.reload());
    return this.moving;
  }

  afterCommand(world: World): void {
    if (!this.hold.held) saveInTown(this.run.slots, world, this.run.runId, Date.now());
  }

  private failed(err: unknown): void {
    this.note(SAVE_FAILED_NOTE);
    reportError(err);
  }
}
