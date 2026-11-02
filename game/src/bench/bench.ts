import type { Camera, Material, Object3D, SpotLight } from 'three';
import { GAME_VERSION } from '../config';
import { REGION, type TownDef } from '../data/region';
import { DEFAULT_ZOOM } from '../data/view';
import { driveSnapshotOf } from '../phys/turn';
import { perfSnapshot, resetPerf } from '../perf';
import { skipToHour, spawnNear, teleport, toggleGod } from '../sim/cheats';
import { sitePads } from '../sim/sites';
import type { World } from '../sim/types';
import { dist, type Vec } from '../sim/vec';
import type { Game } from '../three/game';
import { lampsOf, OVERLAY_FIELDS, Probe, systemRootsOf, type DrawReport } from './probe';
import {
  boundOf, frameStats, passStats, poolFrames, savingOf, slowFrameSums, spreadOf, SYSTEMS,
  type BenchReport, type BenchSystem, type FrameRecord, type SceneReport,
} from './report';

export type BenchOptions = { savingsAbove: number | null; passFrames: number | null; marks: boolean; scenes: string[] | null };

const PASS_FRAMES = 600;
const SAVINGS_FRAMES = 240;
const WARMUP_FRAMES = 60;
const PASS_COUNT = 2;
const STABLE_ROUNDS = 30;
const SETTLE_MS = 60000;
const RECORD_MS = 120000;
const TURN_MS = 30000;
const DRIVE_MS = 120000;
const COUNT_AFTER_FRAMES = 30;
const PROP_RADIUS_TILES = 40;
const DAY_HOUR = 10;
const NIGHT_HOUR = 23;
const NEAR_ZOOM = 1.15;
const FAR_ZOOM = 0.35;
const NEAR_PAN_TILES = 6;
const FAR_PAN_TILES = 24;
const FIGHT_TEMPLATES = ['buggy', 'gunwagon', 'buggy'];
const FIGHT_TURNS = 4;
const OUTSIDE_TILES = 25;
const DRIVE_TILES = 150;
const DRIVE_TURNS = 6;
const PREVIEW_OFFSETS: readonly (readonly [number, number])[] = [[12, 4], [40, 25], [-30, 60], [150, 150]];

const HELD_SHARE = 0.25;
const GAME_FIELDS = [
  'drive', 'siteLights', 'vehicleLights', 'travel', 'death', 'screens', 'menu', 'isEditingControl', 'modalOpen', 'timeHeld',
  'pressTurn', 'releaseTurn', 'trucks', 'sun', 'sky', 'ground', 'props', 'fx', 'weather', 'clouds', 'craters', 'streamer', ...OVERLAY_FIELDS,
];

type Steps = BenchReport['turns']['steps'];
type TurnLog = { waits: number[]; workers: number[]; previews: number[]; passShots: number[]; recording: boolean; steps: Steps; spans: { scene: SceneReport['id']; start: number; end: number }[] };
type Ctx = { game: Game; probe: Probe; options: BenchOptions; passFrames: number; log: TurnLog };
type Check = SceneReport['check'];
type Evidence = { draws: DrawReport; frames: FrameRecord[]; passes: FrameRecord[][]; shadowDraws: ReadonlyMap<Camera, number> };
type Toggle = { name: string; system: BenchSystem | null; apply: () => () => void };
type Spec = {
  id: SceneReport['id'];
  night: boolean;
  warm: boolean;
  turns: boolean;
  setup: (pass: number) => Promise<void>;
  play: (frames: number, drop: number) => Promise<FrameRecord[]>;
  count: () => Promise<DrawReport>;
  check: (evidence: Evidence) => Check;
};
type Town = { def: TownDef; pad: Vec };

export function pickTown(world: World): Town {
  const towns = REGION.towns.flatMap((def) => {
    const pad = sitePads(def)[0];
    return pad ? [{ def, pad }] : [];
  });
  if (towns.length === 0) throw new Error('No town has a landing pad, so the bench has nowhere to play');
  const props = (town: Town) => world.obstacles.filter((o) => dist(o.pos, town.pad) <= PROP_RADIUS_TILES).length;
  return towns.reduce((best, town) => (props(town) > props(best) ? town : best));
}

async function place(ctx: Ctx, world: World): Promise<void> {
  const { game } = ctx;
  if (!Reflect.has(game, 'drive')) throw new Error('Game has no drive field, so the bench cannot reset the physics snapshot');
  game.apply(game.state);
  await ctx.probe.until(() => !game.busy, TURN_MS, 'the last turn to finish playing before the bench places a new world');
  const placed = { ...world };
  game.apply(placed);
  Reflect.set(game, 'drive', driveSnapshotOf(placed));
}

function nightLevel(game: Game): number {
  return (Reflect.get(game, 'siteLights') as { nightLevel: number }).nightLevel;
}

async function settle(ctx: Ctx, night: boolean): Promise<void> {
  const { game, probe } = ctx;
  let seen = `${probe.programCount()}:${probe.chunkBuilds}`;
  let stable = 0;
  try {
    await probe.until(() => {
      const now = `${probe.programCount()}:${probe.chunkBuilds}`;
      stable = now === seen ? stable + 1 : 0;
      seen = now;
      return stable >= STABLE_ROUNDS && nightLevel(game) === (night ? 1 : 0);
    }, SETTLE_MS, 'shaders compiled, the streamer idle and the site lights at rest');
  } catch (error) {
    const state = `${stable} of ${STABLE_ROUNDS} rounds without a new shader program or chunk build, night level ${nightLevel(game)}`;
    throw new Error(`${(error as Error).message} (${state})`, { cause: error });
  }
}

function townSpec(ctx: Ctx, world: World, town: Town, id: Spec['id'], hour: number, view: { zoom: number; pan: number }): Spec {
  const { game, probe } = ctx;
  const night = hour === NIGHT_HOUR;
  const aim = (progress: number) => game.debugView(town.pad.x + view.pan * Math.min(1, progress), town.pad.y, view.zoom);
  const setup = async () => {
    await place(ctx, skipToHour(world, hour));
    aim(0);
    await settle(ctx, night);
  };
  const play = async (frames: number, drop: number) => {
    let round = 0;
    probe.pace = () => aim(++round / (frames + drop));
    try {
      const records = await probe.record((n) => n >= frames + drop, () => true, RECORD_MS, `${frames + drop} town frames`);
      return records.slice(drop);
    } finally {
      probe.pace = null;
    }
  };
  const count = async () => {
    await setup();
    probe.pace = () => aim(0);
    try {
      return await probe.countDraws();
    } finally {
      probe.pace = null;
    }
  };
  const check = night ? nightCheck(game) : propsCheck;
  return { id, night, warm: false, turns: false, setup, play, count, check };
}

function medianCalls(frames: readonly FrameRecord[]): number {
  const sorted = frames.map((f) => f.calls).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function held(evidence: Evidence): { passed: boolean; detail: string } {
  const timed = medianCalls(evidence.frames);
  const counted = evidence.draws.total;
  const passed = counted > 0 && Math.abs(timed - counted) / counted <= HELD_SHARE;
  return { passed, detail: `timed frames drew a median of ${timed} draws against ${counted} in the counted frame` };
}

function leadsMainPass(draws: DrawReport, system: BenchSystem): boolean {
  const main = (s: BenchSystem) => draws.bySystem[s].main.draws;
  return SYSTEMS.every((s) => s === system || main(s) <= main(system));
}

function propsCheck(evidence: Evidence): Check {
  const main = evidence.draws.bySystem.props.main.draws;
  const shadow = evidence.draws.bySystem.props.shadow.draws;
  const same = held(evidence);
  const passed = main > 0 && leadsMainPass(evidence.draws, 'props') && same.passed;
  return { name: 'props lead the draws in every timed frame', passed, detail: `${main} prop draws in the main pass and ${shadow} in the shadow pass, ${same.detail}` };
}

function isLitShadowSpot(spot: SpotLight, game: Game): boolean {
  return spot.castShadow && spot.visible && spot.intensity > 0 && spot.parent === game.scene;
}

function beamSpots(game: Game): SpotLight[] {
  return (Reflect.get(game, 'vehicleLights') as { shadowed: SpotLight[] }).shadowed;
}

function siteSpots(game: Game): SpotLight[] {
  return (Reflect.get(game, 'siteLights') as { slots: { spot: SpotLight }[] }).slots.map((slot) => slot.spot);
}

function castingSpots(game: Game, spots: readonly SpotLight[], evidence: Evidence): number {
  return spots.filter((spot) => isLitShadowSpot(spot, game) && (evidence.shadowDraws.get(spot.shadow.camera) ?? 0) > 0).length;
}

function nightCheck(game: Game): (evidence: Evidence) => Check {
  return (evidence) => {
    const [beams, sites] = [castingSpots(game, beamSpots(game), evidence), castingSpots(game, siteSpots(game), evidence)];
    const same = held(evidence);
    return {
      name: 'a beam and a site spot draw their shadow maps',
      passed: beams > 0 && sites > 0 && same.passed,
      detail: `${beams} beams and ${sites} site spots drew into their shadow maps, ${same.detail}`,
    };
  };
}

function shotsIn(world: World): number {
  return world.events.filter((event) => event.t === 'shot').length;
}

function workerTurnMs(): number {
  const turn = perfSnapshot().turn;
  if (!turn) throw new Error('No worker turn timer arrived with the turn reply');
  return turn.last;
}

function tapTurnKey(game: Game): void {
  const keys = game as unknown as { pressTurn: () => void; releaseTurn: () => void };
  if (typeof keys.pressTurn !== 'function' || typeof keys.releaseTurn !== 'function') throw new Error('Game has no pressTurn and releaseTurn, so the bench cannot start automatic travel');
  keys.pressTurn();
  keys.releaseTurn();
}

async function startTurn(ctx: Ctx, log: TurnLog, scene: Spec['id'], trigger: () => void): Promise<void> {
  const { game, probe } = ctx;
  const turn = game.state.turn;
  const start = performance.now();
  let started = start;
  trigger();
  await probe.until(() => {
    if (game.state.turn === turn) return false;
    started = performance.now();
    return true;
  }, TURN_MS, 'End turn to start the turn').catch((error: Error) => {
    const { player, vehicles } = game.state;
    const order = JSON.stringify(vehicles.find((v) => v.id === player.vehicleId)?.order);
    const travel = JSON.stringify(Reflect.get(game, 'travel'), ['automatic', 'requested', 'pressedAt', 'autoHalted', 'autoPress']);
    const asks = ['modalOpen', 'timeHeld'].map((name) => `${name} ${(Reflect.get(game, name) as () => unknown).call(game)}`).join(', ');
    const dead = (Reflect.get(game, 'death') as { isShown: () => boolean }).isShown();
    throw new Error(`${error.message} (turn ${turn}, busy ${game.busy}, player ${player.state}, call ${JSON.stringify(player.call)}, quest ${player.quests.live?.quest ?? null}, order ${order}, travel ${travel}, ${asks}, death screen ${dead})`, { cause: error });
  });
  if (!log.recording) return;
  log.spans.push({ scene, start, end: started });
  log.waits.push(started - start);
  log.passShots[log.passShots.length - 1] += shotsIn(game.state);
  log.workers.push(workerTurnMs());
}

async function finishPlayback(ctx: Ctx): Promise<void> {
  await ctx.probe.until(() => !ctx.game.busy, TURN_MS, 'the turn to finish playing');
}

async function playFightTurns(ctx: Ctx, log: TurnLog): Promise<void> {
  for (let i = 0; i < FIGHT_TURNS; i++) {
    await startTurn(ctx, log, 'fight', () => ctx.game.endTurn());
    await finishPlayback(ctx);
  }
}

async function playDrive(ctx: Ctx, log: TurnLog): Promise<void> {
  const target = ctx.game.state.turn + DRIVE_TURNS;
  await startTurn(ctx, log, 'drive', () => tapTurnKey(ctx.game));
  await ctx.probe.until(() => ctx.game.state.turn >= target && !ctx.game.busy, DRIVE_MS, `${DRIVE_TURNS} turns of automatic travel`).catch((error: Error) => {
    throw new Error(`${error.message} (turn ${ctx.game.state.turn} of ${target}, busy ${ctx.game.busy})`, { cause: error });
  });
}

async function countDuringTurns(ctx: Ctx, run: () => Promise<void>): Promise<DrawReport> {
  const { game, probe } = ctx;
  const counting = (async () => {
    await probe.until(() => game.busy, TURN_MS, 'a turn to play before counting draws');
    await probe.frames(COUNT_AFTER_FRAMES, TURN_MS);
    return probe.countDraws();
  })();
  const [draws] = await Promise.all([counting, run()]);
  return draws;
}

type TurnScene = { id: Spec['id']; warm: boolean; start: (pass: number) => World; run: () => Promise<void>; check: Spec['check'] };

function turnSpec(ctx: Ctx, scene: TurnScene): Spec {
  const { game, probe } = ctx;
  const setup = async (pass = 0) => {
    await place(ctx, scene.start(pass));
    game.rig.setZoom(DEFAULT_ZOOM);
    game.follow.recenter();
    await settle(ctx, false);
  };
  const play = async (): Promise<FrameRecord[]> => {
    let finished = false;
    let failure: unknown = null;
    const running = scene.run().then(() => undefined, (error) => void (failure = error)).then(() => void (finished = true));
    const records = probe.record(() => finished, () => game.busy, DRIVE_MS, 'the turns to finish');
    const [recorded] = await Promise.all([records, running]);
    if (failure !== null) throw failure;
    return recorded;
  };
  const count = async () => {
    await setup();
    return countDuringTurns(ctx, scene.run);
  };
  return { id: scene.id, night: false, warm: scene.warm, turns: true, setup, play, count, check: scene.check };
}

function outsideBase(base: World, town: Town, side = 1): World {
  const clamp = (v: number) => Math.max(1, Math.min(base.size - 1, v));
  const outside = { x: clamp(town.def.pos.x + side * (town.def.radius + OUTSIDE_TILES)), y: clamp(town.def.pos.y) };
  return teleport(skipToHour(base, DAY_HOUR), outside);
}

function fightStart(base: World, town: Town): World {
  const moved = toggleGod(outsideBase(base, town));
  return FIGHT_TEMPLATES.reduce((world, template) => spawnNear(world, template, true), moved);
}

function driveSide(pass: number): number {
  return pass % 2 === 0 ? 1 : -1;
}

function driveStart(world: World, side: number): World {
  const me = world.vehicles.find((v) => v.id === world.player.vehicleId);
  if (!me) throw new Error(`Player vehicle ${world.player.vehicleId} missing`);
  const clamp = (v: number) => Math.max(1, Math.min(world.size - 1, v));
  const dest = { x: clamp(me.pos.x + side * DRIVE_TILES), y: clamp(me.pos.y) };
  const vehicles = world.vehicles.map((v) => (v === me ? { ...v, order: { kind: 'through' as const, dest } } : v));
  return { ...world, vehicles };
}

async function previewMs(ctx: Ctx, from: World, offset: readonly [number, number]): Promise<number> {
  const { game, probe } = ctx;
  const me = from.vehicles.find((v) => v.id === from.player.vehicleId);
  if (!me) throw new Error(`Player vehicle ${from.player.vehicleId} missing`);
  const clamp = (v: number) => Math.max(1, Math.min(from.size - 1, v));
  const dest = { x: clamp(me.pos.x + offset[0]), y: clamp(me.pos.y + offset[1]) };
  const callsBefore = perfSnapshot().preview?.calls ?? 0;
  const vehicles = from.vehicles.map((v) => (v.id === me.id ? { ...v, order: { kind: 'stopAt' as const, dest } } : v));
  game.apply({ ...from, vehicles });
  await probe.until(() => (perfSnapshot().preview?.calls ?? 0) > callsBefore, TURN_MS, 'a plan preview after a move order');
  return (perfSnapshot().preview as { last: number }).last;
}

async function measurePreviews(ctx: Ctx, world: World, log: TurnLog): Promise<void> {
  await place(ctx, world);
  await settle(ctx, false);
  for (const offset of PREVIEW_OFFSETS) log.previews.push(await previewMs(ctx, world, offset));
}

function fightCheck(log: TurnLog): Spec['check'] {
  return () => {
    const shots = log.passShots.slice(-PASS_COUNT);
    return { name: 'shots were fired in every timed pass', passed: shots.length === PASS_COUNT && shots.every((n) => n > 0), detail: `${shots.join(' and ')} shot events in the timed passes` };
  };
}

function driveCheck(evidence: Evidence): Check {
  const builds = evidence.passes.map((frames) => frames.reduce((sum, f) => sum + f.chunkBuilds, 0));
  return { name: 'every timed pass built new terrain chunks', passed: builds.every((n) => n > 0), detail: `${builds.join(' and ')} terrain chunks built in the timed passes` };
}

function materialsOf(object: Object3D): Material[] {
  const material = (object as { material?: Material | Material[] }).material;
  return material ? [material].flat() : [];
}

function refreshMaterials(game: Game): void {
  game.scene.traverse((object) => {
    for (const material of materialsOf(object)) material.needsUpdate = true;
  });
}

function pinHidden(object: Object3D): () => void {
  let wanted = object.visible;
  Object.defineProperty(object, 'visible', { configurable: true, get: () => false, set: (value: boolean) => void (wanted = value) });
  return () => {
    Reflect.deleteProperty(object, 'visible');
    object.visible = wanted;
  };
}

function hidden(objects: readonly Object3D[]): () => void {
  const restores = objects.map(pinHidden);
  return () => restores.forEach((restore) => restore());
}

function hideSystem(game: Game, system: BenchSystem): Toggle {
  return { name: system, system, apply: () => hidden(system === 'lights' ? lampsOf(game) : systemRootsOf(game)[system]) };
}

const SHADOW_OFF: (game: Game) => Toggle = (game) => ({
  name: 'shadowMaps',
  system: null,
  apply: () => {
    game.renderer.shadowMap.enabled = false;
    refreshMaterials(game);
    return () => {
      game.renderer.shadowMap.enabled = true;
      refreshMaterials(game);
    };
  },
});

const PIXEL_RATIO_ONE: (game: Game) => Toggle = (game) => ({
  name: 'pixelRatio1',
  system: null,
  apply: () => {
    const was = game.renderer.getPixelRatio();
    game.renderer.setPixelRatio(1);
    return () => game.renderer.setPixelRatio(was);
  },
});

function togglesFor(game: Game, draws: DrawReport): Toggle[] {
  const drawn = (system: BenchSystem) => draws.bySystem[system].main.draws + draws.bySystem[system].shadow.draws > 0;
  const systems = SYSTEMS.filter((s) => s !== 'other' && (s === 'lights' ? lampsOf(game).length > 0 : drawn(s)));
  return [...systems.map((s) => hideSystem(game, s)), SHADOW_OFF(game), PIXEL_RATIO_ONE(game)];
}

async function replayMedian(ctx: Ctx, spec: Spec, toggle: Toggle | null): Promise<number> {
  await spec.setup(0);
  const undo = toggle ? toggle.apply() : () => undefined;
  try {
    if (toggle) await settle(ctx, spec.night);
    if (toggle) await checkHidden(ctx, toggle);
    const frames = Math.min(SAVINGS_FRAMES, ctx.passFrames);
    return passStats(await spec.play(frames, WARMUP_FRAMES)).real.median;
  } finally {
    undo();
  }
}

async function checkHidden(ctx: Ctx, toggle: Toggle): Promise<void> {
  if (toggle.system === null || toggle.system === 'lights') return;
  const { main, shadow } = (await ctx.probe.countDraws()).bySystem[toggle.system];
  if (main.draws + shadow.draws > 0) throw new Error(`hiding ${toggle.system} still left ${main.draws + shadow.draws} of its draws, so its saving would be wrong`);
}

async function measureSaving(ctx: Ctx, spec: Spec, baseline: number, toggle: Toggle): Promise<number> {
  try {
    return savingOf(baseline, await replayMedian(ctx, spec, toggle));
  } catch (error) {
    throw new Error(`with ${toggle.name} switched off: ${(error as Error).message}`, { cause: error });
  }
}

async function measureSavings(ctx: Ctx, spec: Spec, draws: DrawReport): Promise<Record<string, number>> {
  const baseline = await replayMedian(ctx, spec, null);
  const savings: Record<string, number> = {};
  for (const toggle of togglesFor(ctx.game, draws)) savings[toggle.name] = await measureSaving(ctx, spec, baseline, toggle);
  return savings;
}

async function measurePasses(ctx: Ctx, spec: Spec): Promise<{ passes: FrameRecord[][]; longTasks: number }> {
  if (spec.warm) {
    await spec.setup(0);
    await spec.play(ctx.passFrames, WARMUP_FRAMES);
  }
  const passes: FrameRecord[][] = [];
  let longTasks = 0;
  for (let i = 0; i < PASS_COUNT; i++) {
    await spec.setup(i);
    const from = performance.now();
    const played = await timedPass(ctx, spec);
    if (ctx.options.marks) ctx.probe.markSlowFrames(spec.id, played);
    passes.push(played);
    longTasks += ctx.probe.longTasks.countBetween(from, performance.now());
  }
  return { passes, longTasks };
}

async function timedPass(ctx: Ctx, spec: Spec): Promise<FrameRecord[]> {
  const { log } = ctx;
  log.passShots.push(0);
  log.recording = spec.turns;
  if (spec.turns) resetPerf();
  try {
    return await spec.play(ctx.passFrames, WARMUP_FRAMES);
  } finally {
    log.recording = false;
    if (spec.turns) addSteps(log.steps);
  }
}

function addSteps(steps: Steps): void {
  for (const [name, pass] of Object.entries(perfSnapshot())) {
    const step = steps[name] ?? { total: 0, calls: 0, max: 0 };
    steps[name] = { total: step.total + pass.total, calls: step.calls + pass.calls, max: Math.max(step.max, pass.max) };
  }
}

async function runScene(ctx: Ctx, spec: Spec): Promise<SceneReport> {
  const { passes, longTasks } = await measurePasses(ctx, spec);
  const stats = passes.map(passStats);
  const pooled = poolFrames(passes);
  const frame = passStats(pooled);
  const draws = await spec.count();
  const check = spec.check({ draws, frames: pooled, passes, shadowDraws: ctx.probe.shadowDraws });
  if (!check.passed) throw new Error(`Scene ${spec.id} failed its content check "${check.name}": ${check.detail}`);
  const wanted = ctx.options.savingsAbove !== null && frame.real.p99 > ctx.options.savingsAbove;
  const savings = wanted ? await measureSavings(ctx, spec, draws) : null;
  return { id: spec.id, passes: stats, frame, spread: spreadOf(stats), bound: boundOf(frame), longTasks, draws, slowFrames: slowFrameSums(pooled), savings, check };
}

function markTurns(log: TurnLog): void {
  for (const { scene, start, end } of log.spans) performance.measure(`bench:turn:${scene}`, { start, end });
}

function bootMs(): number {
  const mark = performance.getEntriesByName('roam:ready')[0];
  if (!mark) throw new Error('No roam:ready performance mark');
  return mark.startTime;
}

function rendererName(game: Game): string {
  const gl = game.renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
}

function checkGameFields(game: Game): void {
  const missing = GAME_FIELDS.filter((name) => !Reflect.has(game, name) || Reflect.get(game, name) === undefined);
  if (missing.length > 0) throw new Error(`Game has no ${missing.join(', ')}, which the bench reads. Update the bench to the renamed fields`);
}

function specsFor(ctx: Ctx, town: Town, base: World): Spec[] {
  const { log } = ctx;
  const near = { zoom: NEAR_ZOOM, pan: NEAR_PAN_TILES };
  const far = { zoom: FAR_ZOOM, pan: FAR_PAN_TILES };
  const still = { zoom: NEAR_ZOOM, pan: 0 };
  const stillFar = { zoom: FAR_ZOOM, pan: 0 };
  const fightWorld = fightStart(base, town);
  const fight: TurnScene = { id: 'fight', warm: true, start: () => fightWorld, run: () => playFightTurns(ctx, log), check: fightCheck(log) };
  const driveWorld = (pass: number) => driveStart(outsideBase(base, town, driveSide(pass)), driveSide(pass));
  const drive: TurnScene = { id: 'drive', warm: false, start: driveWorld, run: () => playDrive(ctx, log), check: driveCheck };
  return [
    townSpec(ctx, base, town, 'town-day', DAY_HOUR, near),
    townSpec(ctx, base, town, 'town-day-far', DAY_HOUR, far),
    townSpec(ctx, base, town, 'town-night', NIGHT_HOUR, still),
    townSpec(ctx, base, town, 'town-night-far', NIGHT_HOUR, stillFar),
    turnSpec(ctx, fight),
    turnSpec(ctx, drive),
  ];
}

function chosenSpecs(specs: Spec[], only: string[] | null): Spec[] {
  if (only === null) return specs;
  const unknown = only.filter((id) => !specs.some((spec) => spec.id === id));
  if (unknown.length > 0) throw new Error(`No bench scene ${unknown.join(', ')}. Scenes are ${specs.map((spec) => spec.id).join(', ')}`);
  return specs.filter((spec) => only.includes(spec.id));
}

async function playAll(ctx: Ctx, specs: Spec[], preview: () => Promise<void>): Promise<SceneReport[]> {
  const scenes: SceneReport[] = [];
  for (const spec of specs) {
    if (spec.id === 'drive') await preview();
    scenes.push(await runScene(ctx, spec).catch((error: Error) => {
      throw new Error(`Scene ${spec.id}: ${error.message} (${timeHolders(ctx.game)})`, { cause: error });
    }));
  }
  return scenes;
}

function timeHolders(game: Game): string {
  const screens = Reflect.get(game, 'screens') as { inventory: { isOpen: () => boolean }; blockingOpen: () => boolean };
  const menu = Reflect.get(game, 'menu') as { isOpen: () => boolean };
  const editing = (Reflect.get(game, 'isEditingControl') as () => boolean).call(game);
  return `inventory ${screens.inventory.isOpen()}, blocking screen ${screens.blockingOpen()}, menu ${menu.isOpen()}, editing control ${editing}, page hidden ${document.hidden}`;
}

export async function runBench(game: Game, options: BenchOptions): Promise<BenchReport> {
  checkGameFields(game);
  const probe = new Probe(game);
  const passFrames = options.passFrames ?? PASS_FRAMES;
  const log: TurnLog = { waits: [], workers: [], previews: [], passShots: [], recording: false, steps: {}, spans: [] };
  const ctx: Ctx = { game, probe, options, passFrames, log };
  const start = { pixelRatio: window.devicePixelRatio, scale: game.renderer.getPixelRatio() / window.devicePixelRatio };
  const base = game.state;
  const town = pickTown(base);
  probe.install();
  try {
    const specs = chosenSpecs(specsFor(ctx, town, teleport(base, town.pad)), options.scenes);
    const scenes = await playAll(ctx, specs, () => measurePreviews(ctx, outsideBase(teleport(base, town.pad), town), log));
    if (options.marks) markTurns(log);
    return {
      schema: 1,
      version: GAME_VERSION,
      renderer: rendererName(game),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      pixelRatio: start.pixelRatio,
      renderScale: start.scale,
      gpuTimer: probe.gpu.available,
      town: town.def.id,
      only: options.scenes,
      scenes,
      turns: { waitMs: frameStats(log.waits), workerTurnMs: frameStats(log.workers), previewMs: frameStats(log.previews), steps: log.steps },
      bootMs: bootMs(),
    };
  } finally {
    probe.uninstall();
  }
}
