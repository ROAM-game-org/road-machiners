
import { prototypeFightFromSearch } from './prototype-fight';
import { filesOf, formatSupport, recoverBank, reportFailures, SoundBank, startBank, type BankOptions, type LoadedBank } from '../audio/bank';
import { Mixer } from '../audio/mixer';
import { bankTrackLoader, MusicShelf } from '../audio/music-shelf';
import { SoundPlayer } from '../audio/player';
import { CONFIG, ERROR_REPORT_URL, FEEDBACK_URL, GAME_VERSION, PLAY_EASE, SFX_BYTES } from '../config';
import { driveSnapshotOf } from '../phys/turn';
import { easedStopSteps } from './play-clock';
import { Travel } from './travel';
import { afterBoot, startTurnWorker } from './turn-worker-start';
import { BANK, BOOT_SOUNDS, MIX, MUSIC_SOUNDS, SOUNDS } from '../data/sounds';
import { bankKitLoader, CombatMusic } from './combat-music';
import { startKit } from '../data/start';
import { PHYSICS } from '../data/physics';
import { initPhysics } from '../phys/drive';
import { perfSnapshot, resetPerf } from '../perf';
import { fetchMap } from './map-file';
import type { World, WorldSetup } from '../sim/types';
import { newGame } from '../sim/new-game';
import { DebugConsole, Noclip } from '../ui/console';
import { BOOT_TEXT } from '../ui/boot-progress';
import { BootScreen } from '../ui/boot-screen';
import { fontsReady } from '../ui/fonts';
import { preloadPictures } from '../ui/picture-store';
import { questArtPath, townArtKeys } from '../data/quest-art';
import { el, uiRoot } from '../ui/dom';
import { mountReportDesk } from '../ui/feedback-form';
import { COARSE_QUERY, watchInputMode } from '../ui/input-mode';
import { loadUiSize, windowExtent } from '../ui/ui-size';
import { loadMinimapSetting } from '../ui/minimap-setting';
import { loadLogViewSetting } from '../ui/log-setting';
import type { SavedLog } from '../ui/log';
import { loadCameraSetting, loadRenderScaleSetting } from '../ui/camera-setting';
import { loadLanguage, relocalize } from '../text/language';
import type { DevLocale } from '../text/msg';
import type { QuestLanguage } from '../data/quests';
import { setQuestLanguage } from '../sim/quests';
import { t } from '../text/msg';
import type { NewGameActions } from '../ui/new-game';
import { chooseSaveFate, chooseStart } from '../ui/save-screen';
import { mountPerfPanel } from '../ui/perf-panel';
import { mountLookMenu } from './render/inkMenu';
import { SoundSettings } from '../ui/sound';
import { RadioPanel, RadioStation } from '../ui/radio';
import { bootStep, installCrashScreen, keepRunningOnErrors, noteError, onBootStopped, onEveryError, onReport, reportError } from './crash';
import { BootUnfinished, clearMark, markStep, markWaiting, takeUnfinished, watchBootEnd } from './boot-marker';
import { AssetUnreachable } from '../fetch-asset';
import { ErrorReporter, gameContext } from './error-report';
import { Game } from './game';
import { AUTOSAVE_SLOTS, carriesOnLoad, clearGame, hasSave, loadWorld, newMapFor, SAVE_KEY, SaveError, savedRunId, saveImporter, savedLogOf, storedSave, writeSave } from './save';
import { desktopHost, memoryBackend, openSaves, SaveSlots } from './save-db';
import { RunLog } from './run-log';
import { allSlots, jumpToQuest, listSaves, questJumpOf, requestBoot, takeBootRequest, type BootRequest, type NewRequest, type QuestJump, type SlotId } from './save-slots';
import { GpuContext } from './gpu-context';
import { GAME_GL, openWebGL } from './webgl';
import { carriedSave, rescueSave } from './save-rescue';
import { loadModels, paintSurfaceMasks, type ModelFailure } from './render/models';
import { startGroundBaker } from './ground-off-thread';
import { runStepped } from './render/stepped';
import { drawnGroundSteps, groundTexture } from './render/terrain';
import { defaultSetup, modeKit } from '../sim/settings';
import { errorText } from '../stall';
import { paintSkin } from '../ui/dash/skin';

function element(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} element missing from the page`);
  return el;
}

type Booted = { world: World; runId: string; loadedFrom: SlotId | null; fresh: boolean };

async function bootWorld(): Promise<Booted> {
  if (specialBoot()) return bootSpecial();
  const request = takeBootRequest(window.sessionStorage, saveKey);
  if (typeof request === 'object' && request !== null) return bootRequested(request);
  const slot = request ?? (await startSlot());
  if (typeof slot === 'object' && slot !== null) return bootRequested(slot);
  if (slot === null) return boot.track('world', () => newGameSaved(defaultSetup('roaming'), false), BOOT_TEXT.newGame);
  return boot.track('world', () => bootSlot(slot), BOOT_TEXT.loadSave);
}

async function startSlot(): Promise<SlotId | NewRequest | null> {
  const saves = listSaves(slots, CONFIG.saveSlots);
  if (urlPlay()) return saves[0]?.slot ?? null;
  waitOnPlayer();
  const chosen = await boot.aside(() => chooseStart(saves, newGameActions, soundSettings, importer, unfinishedBoot !== null));
  stepBoot('loading the save');
  return chosen;
}

async function bootRequested(request: Exclude<BootRequest, SlotId>): Promise<Booted> {
  bootRequestKind = 'new' in request ? 'new' : 'slot';
  stepBoot('loading the save');
  if ('new' in request) return boot.track('world', () => freshRun(request.new, request.intro), BOOT_TEXT.newGame);
  return boot.track('world', () => bootSlot(request.slot), BOOT_TEXT.nextWindow);
}

async function bootSlot(slot: SlotId): Promise<Booted> {
  try {
    const world = loadWorld(slots, slot, map);
    if (!world) return newGameSaved(defaultSetup('roaming'), true);
    const runId = savedRunId(storedSave(slots, slot));
    if (runId === null) throw new SaveError('invalidSave', null, `The save in ${slot} loaded but names no run`);
    return { world, runId, loadedFrom: slot, fresh: false };
  } catch (err) {
    return unloadedSlot(err, slot);
  }
}

async function unloadedSlot(err: unknown, slot: SlotId): Promise<Booted> {
  if (!(err instanceof SaveError)) throw err;
  const carry = carried(slot);
  if (carry instanceof SaveError) return rescuedOrNew(carriesOnLoad(err) ? carry : err, slot, false);
  if (carriesOnLoad(err)) return { world: carry.world, runId: carry.runId, loadedFrom: null, fresh: false };
  return rescuedOrNew(err, slot, true);
}

function carried(slot: SlotId): NonNullable<ReturnType<typeof carriedSave>> | SaveError {
  return asSaveError(() => carriedSave(slots, slot, map, startKit(CONFIG.startKit), freshSeed, freshRunId));
}

function asSaveError(carry: () => ReturnType<typeof carriedSave>): NonNullable<ReturnType<typeof carriedSave>> | SaveError {
  try {
    return carry() ?? new SaveError('unreadable');
  } catch (error) {
    return error instanceof SaveError ? error : new SaveError('invalidSave', null, (error as Error).message);
  }
}

function freshRun(setup: WorldSetup, intro: boolean): Booted {
  clearGame(slots, window.localStorage);
  return newGameSaved(setup, intro);
}

function jumpedRun(jump: QuestJump): Booted {
  const booted = newGameSaved(defaultSetup('roaming'), false);
  return { ...booted, world: jumpToQuest(booted.world, jump) };
}

function newGameSaved(setup: WorldSetup, intro: boolean): Booted {
  const world = newGameWorld(setup, intro);
  const runId = freshRunId();
  writeSave(slots, 'auto', world, runId, Date.now());
  return { world, runId, loadedFrom: null, fresh: true };
}

async function rescuedOrNew(error: SaveError, slot: SlotId, carries: boolean): Promise<Booted> {
  waitOnPlayer();
  await boot.aside(() => chooseSaveFate(error, carries, storedSave(slots, slot), newGameActions, soundSettings));
  stepBoot('loading the save');
  const rescued = asSaveError(() => rescueSave(slots, slot, map, startKit(CONFIG.startKit), freshSeed, freshRunId, Date.now()));
  if (rescued instanceof SaveError) return rescuedOrNew(rescued, slot, false);
  return { world: rescued.world, runId: rescued.runId, loadedFrom: null, fresh: false };
}

function openRunSaves(): Promise<SaveSlots> {
  const slotIds = allSlots(CONFIG.saveSlots);
  return benchMode || combatPrototype ? SaveSlots.open(memoryBackend(), null, saveKey, slotIds) : openSaves(saveKey, window.localStorage, slotIds, desktopHost());
}

type BenchState = { done: boolean; report: unknown; error: string | null };

function positiveParam(params: URLSearchParams, name: string): number | null {
  const raw = params.get(name);
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`?${name}=${raw} is no positive number`);
  return value;
}

function benchFailure(error: unknown, faults: readonly unknown[]): string | null {
  const reported = faults.map((fault) => `The game reported an error during the bench: ${errorText(fault)}`);
  const failed = error === null ? [] : [errorText(error)];
  const lines = [...reported, ...failed];
  return lines.length === 0 ? null : lines.join('\n');
}

async function runBenchMode(game: Game): Promise<void> {
  const state: BenchState = { done: false, report: null, error: null };
  const faults: unknown[] = [];
  onReport((fault) => faults.push(fault));
  Object.assign(window, { __ROAM_BENCH__: state });
  let failure: unknown = null;
  try {
    const params = new URLSearchParams(window.location.search);
    const { runBench } = await import('../bench/bench');
    state.report = await runBench(game, { savingsAbove: positiveParam(params, 'savingsAbove'), passFrames: positiveParam(params, 'benchFrames'), marks: params.has('profile'), shots: params.has('shots'), scenes: params.get('scenes')?.split(',') ?? null });
  } catch (error) {
    failure = error;
  } finally {
    state.error = benchFailure(failure, faults);
    state.done = true;
  }
}

async function persistSaves(): Promise<void> {
  if (desktopHost()) return;
  if (!navigator.storage) return console.warn('The page is not secure, so it cannot ask the browser to keep saves under disk pressure');
  if (!(await navigator.storage.persist())) console.warn('The browser did not grant persistent storage, so it may evict saves under disk pressure');
}

function newGameWorld(setup: WorldSetup, intro: boolean): World {
  const seed = benchMode ? BENCH_SEED : (CONFIG.seed ?? urlSeed() ?? freshSeed());
  return newGame(seed, modeKit(setup.mode, CONFIG.startKit), intro, newMapFor(setup, seed, map), setup);
}

const combatPrototype = import.meta.env.DEV && new URLSearchParams(window.location.search).has('combatPrototype');
const benchMode = new URLSearchParams(window.location.search).has('bench');
const BENCH_SEED = 1337;

function urlPlay(): boolean {
  return benchMode || (import.meta.env.DEV && new URLSearchParams(window.location.search).has('play'));
}

function urlSeed(): number | null {
  const seed = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('seed') : null;
  if (seed === null) return null;
  if (!/^-?\d+$/.test(seed)) throw new Error(`?seed=${seed} is no whole number`);
  return Number(seed);
}

installCrashScreen();
const questJump = import.meta.env.DEV ? questJumpOf(window.location.search) : null;
const saveKey = questJump ? `${SAVE_KEY}-quest-view` : SAVE_KEY;
const unfinishedBoot = takeUnfinished(window.sessionStorage, saveKey);
watchBootEnd(window, document, window.sessionStorage, saveKey, Date.now);
let bootRequestKind = 'menu';
let bootStopped = false;
function stepBoot(name: string): void {
  bootStep(name);
  if (!bootStopped) markStep(window.sessionStorage, saveKey, name, bootRequestKind, GAME_VERSION, Date.now());
}
function waitOnPlayer(): void {
  markWaiting(window.sessionStorage, saveKey);
}
function endMark(): void {
  bootStopped = true;
  clearMark(window.sessionStorage, saveKey);
}
onBootStopped(endMark);
const language = loadLanguage(window.localStorage, window.location.search, import.meta.env.DEV, document.documentElement);
paintSkin();
const sizeOfUi = loadUiSize(window.localStorage, window.location.search, import.meta.env.DEV, [uiRoot(), element('overlay')], document.documentElement, windowExtent(), window.matchMedia(COARSE_QUERY).matches);
loadMinimapSetting(window.localStorage);
loadLogViewSetting(window.localStorage);
loadCameraSetting(window.localStorage);
loadRenderScaleSetting(window.localStorage);
window.addEventListener('resize', () => sizeOfUi.refit(windowExtent()));
watchInputMode([uiRoot(), element('report')], sizeOfUi);
document.body.append(el('div', { class: 'rotate-prompt', role: 'alert' }, t('ui.rotatePhone')));
mountReportDesk(element('report'), gameContext, FEEDBACK_URL);
const questLanguageOf = (locale: DevLocale): QuestLanguage => (locale === 'pseudo' ? 'en' : locale);
setQuestLanguage(questLanguageOf(language.current()));
let relocalizeGame: (() => void) | null = null;
language.subscribe(() => {
  setQuestLanguage(questLanguageOf(language.current()));
  relocalize(uiRoot());
  relocalize(element('overlay'));
  relocalize(element('report'));
  relocalizeGame?.();
});
let flushSaves = (): Promise<void> => Promise.resolve();
function whenVisible(run: () => void): void {
  if (document.visibilityState === 'visible') run();
  else {
    const onChange = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onChange);
      run();
    };
    document.addEventListener('visibilitychange', onChange);
  }
}
function reportStandIns(failures: ModelFailure[]): void {
  for (const { name, error } of failures) {
    if (error instanceof AssetUnreachable) noteError(error);
    else noteError(new Error(`Model ${name} failed to load and stays a stand-in box: ${error instanceof Error ? error.message : String(error)}`));
  }
}
async function recoverSounds(loaded: LoadedBank): Promise<void> {
  const recovered = await recoverBank(mixer.ctx, loaded, BOOT_SOUNDS, soundOptions);
  for (const failure of loaded.failures) console.warn(`Sound ${failure.file} failed to decode as ${failure.kind} and ${recovered.has(failure.file) ? 'decoded later' : 'stays a stand-in'}`, failure.errors);
  for (const report of reportFailures(loaded.failures, loaded.bank.size, recovered, soundOptions.support)) reportError(report);
}
function soundsArrived(loaded: LoadedBank): void {
  if (loaded.format !== BANK.formats[0].ext) console.warn(`Sounds play from the ${loaded.format} twins, since ${BANK.formats[0].ext} did not decode`);
  for (const failure of loaded.unreachable) console.warn(`Sound ${failure.file} could not be fetched`, failure.errors);
  if (loaded.failures.length) whenVisible(() => void recoverSounds(loaded).catch(reportError));
  performance.mark('roam:sounds');
}
const boot = BootScreen.adopt(() => void flushSaves().then(() => window.location.reload(), reportError), endMark);
const uiFonts = fontsReady(language.current() === 'ru' ? 'ru' : 'en');
const reporter = ERROR_REPORT_URL && !benchMode ? new ErrorReporter(ERROR_REPORT_URL, gameContext) : null;
if (reporter) onReport((err) => void reporter.report(err));
if (unfinishedBoot) noteError(new BootUnfinished(unfinishedBoot, Date.now()));
const surface = openWebGL(document.createElement('canvas'), GAME_GL);
const gpu = new GpuContext(surface.canvas, surface.context, reportError);
const mixer = new Mixer(MIX);
if (!benchMode) mixer.unlockOn(window);
const soundSettings = new SoundSettings(mixer, window.localStorage);
stepBoot('loading physics and models');
const soundOptions: BankOptions = { expectedBytes: SFX_BYTES, support: formatSupport() };
const musicFaults: unknown[] = [];
let reportMusicFault: (err: unknown) => void = (err) => musicFaults.push(err);
const sounds = new SoundBank(filesOf(BOOT_SOUNDS));
sounds.lend(filesOf(MUSIC_SOUNDS));
const musicShelf = new MusicShelf(sounds, bankTrackLoader(mixer.ctx, soundOptions, (err) => reportMusicFault(err)), (err) => reportMusicFault(err));
let bankSettled!: () => void;
const afterBank = new Promise<void>((resolve) => (bankSettled = resolve));
const kitLoader = bankKitLoader(mixer.ctx, { expectedBytes: SFX_BYTES, support: soundOptions.support }, (err) => reportMusicFault(err));
const music = new CombatMusic(mixer.ctx, mixer.input('music'), (name) => afterBank.then(() => kitLoader(name)), Math.random, (err) => reportMusicFault(err));
const loading = Promise.all([
  boot.track('physics', initPhysics()),
  boot.track('models', loadModels(undefined, boot.count('models')).then(reportStandIns).then(paintSurfaceMasks)),
]);
stepBoot('loading the map');
const bakeGround = startGroundBaker();
const [map, slots] = await Promise.all([boot.track('map', fetchMap()), openRunSaves()]);
const baking = bakeGround(map.terrain, `${GAME_VERSION}|${map.hash}`);
const importer = saveImporter(slots, map, CONFIG.saveSlots);
const travel = new Travel(CONFIG.travelHoldMs, easedStopSteps(PLAY_EASE, PHYSICS.stepsPerSecond));
gameContext.watchSaves(slots);
flushSaves = () => slots.flush();
if (!benchMode && !combatPrototype) persistSaves().catch(reportError);
const newGameActions: NewGameActions = {
  hasAutosave: () => hasSave(slots, AUTOSAVE_SLOTS),
  requestBoot: (request) => requestBoot(window.sessionStorage, saveKey, request),
  reload: () => void slots.flush().then(() => window.location.reload(), reportError),
};
stepBoot('loading the save');
const { world, runId, loadedFrom, fresh } = await bootWorld();
const log = new RunLog(slots, runId, GAME_VERSION, (err) => slots.onError(err));
log.begin(world, loadedFrom);
stepBoot('building the ground');
const drawn = await boot.track('ground', async () => {
  await baking.baked;
  groundTexture(world);
  return runStepped(drawnGroundSteps(world), async (piece) => {
    stepBoot(piece);
    await boot.painted();
  });
});
stepBoot('waiting for physics and models');
await loading;
stepBoot('starting the game');
const radio = new RadioPanel(new RadioStation(Math.random), () => game.loops.nextTrack());
radio.hear(world);
const overlay = element('overlay');
const game = await boot.track('scene', async () => {
  stepBoot('building the renderer');
  return new Game(world, { slots, runId, log, mapHash: world.mapHash, importSave: importer, savedLog: (): SavedLog => game.hud.savedLog() }, element('game'), overlay, new SoundPlayer(mixer, sounds, SOUNDS), music, soundSettings, radio, surface, gpu, travel, musicShelf, drawn, stepBoot);
});
if (questJump) game.screens.quest.jump(questJump.picks, questJump.page);
relocalizeGame = () => {
  game.relanguageQuest();
  radio.relocalize();
  game.uiStale = true;
};
const view = { focus: () => game.rig.focus(), setSpeed: (factor: number) => game.follow.keyPan.setSpeed(factor) };
const opening = startKit(modeKit(world.setup.mode, CONFIG.startKit)).opening;
if (loadedFrom) game.hud.restoreLog(savedLogOf(storedSave(slots, loadedFrom)));
if (fresh && opening) for (const line of opening.log) game.hud.note(world, t(`opening.${line}`), "", "notable");
const debugConsole = new DebugConsole(uiRoot(), game, mountPerfPanel(overlay, () => travel.routeMsOfLastTurn()), mountLookMenu(uiRoot()), new Noclip(game, view, PHYSICS.metersPerTile));
keepRunningOnErrors((text) => debugConsole.error(text));
reportMusicFault = reportError;
musicFaults.forEach(reportError);
onEveryError(() => game.holdSaves());
stepBoot('running');
await uiFonts;
boot.showText();
gameContext.watchGraphics(() => game.graphicsFacts());
gameContext.watch({ world: () => game.state, log: () => game.logTexts() });
performance.mark('roam:ready');
startBank(mixer.ctx, BOOT_SOUNDS, soundOptions, sounds).loaded.then(soundsArrived).catch(reportError).finally(bankSettled);
void afterBank.then(() => preloadPictures('Quest art', townArtKeys().map(questArtPath))).catch(reportError);
afterBoot(boot.finish(), () => startTurnWorker(travel, Promise.resolve(), initPhysics(), map.terrain, () => ({ world: game.state, drive: driveSnapshotOf(game.state) })), () => game.warmPlans(), baking.keep).catch(reportError);
endMark();
if (benchMode) void afterBank.then(() => runBenchMode(game));
if (import.meta.env.DEV) {
  (window as any).__ROAM__ = Object.assign(game, { language, buildAllCells: () => game.streamer.buildAll() });
  (window as any).__ROAM_PERF__ = { snapshot: perfSnapshot, reset: resetPerf };
}

function freshSeed(): number {
  return Math.floor(Math.random() * 2 ** 32) | 0;
}

function freshRunId(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bootPrototype(): Booted {
    const world = prototypeFightFromSearch(map, window.location.search);
    const runId = freshRunId();
    writeSave(slots, 'auto', world, runId, Date.now());
    return { world, runId, loadedFrom: null, fresh: true };
}

function specialBoot(): boolean { return combatPrototype || questJump !== null; }
function bootSpecial(): Booted | Promise<Booted> {
  if (combatPrototype) return bootPrototype();
  if (!questJump) throw new Error('Missing quest jump');
  return boot.track('world', () => jumpedRun(questJump), BOOT_TEXT.newGame);
}
