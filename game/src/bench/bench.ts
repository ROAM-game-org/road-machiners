import type { Material, Object3D, SpotLight } from 'three';
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
import { lampsOf, Probe, systemRootsOf, type DrawReport } from './probe';
import {
  boundOf, frameStats, passStats, poolFrames, savingOf, slowFrameSums, spreadOf, SYSTEMS,
  type BenchReport, type BenchSystem, type FrameRecord, type SceneReport,
} from './report';

export type BenchOptions = { savingsAbove: number | null; passFrames: number | null };

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

type Ctx = { game: Game; probe: Probe; options: BenchOptions; passFrames: number };
type Check = SceneReport['check'];
type Evidence = { draws: DrawReport; frames: FrameRecord[] };
type TurnLog = { waits: number[]; workers: number[]; previews: number[]; shots: number };
type Toggle = { name: string; apply: () => () => void };
type Spec = {
  id: SceneReport['id'];
  night: boolean;
  warm: boolean;
  setup: () => Promise<void>;
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

function place(game: Game, world: World): void {
  if (!Reflect.has(game, 'drive')) throw new Error('Game has no drive field, so the bench cannot reset the physics snapshot');
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
    place(game, skipToHour(world, hour));
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
  return { id, night, warm: false, setup, play, count, check };
}

function propsCheck(evidence: Evidence): Check {
  const main = evidence.draws.bySystem.props.main.draws;
  const shadow = evidence.draws.bySystem.props.shadow.draws;
  return { name: 'props are drawn', passed: main > 0, detail: `${main} prop draws in the main pass and ${shadow} in the shadow pass` };
}

function isLitShadowSpot(spot: SpotLight, game: Game): boolean {
  return spot.castShadow && spot.visible && spot.intensity > 0 && spot.parent === game.scene;
}

function litBeams(game: Game): number {
  const beams = (Reflect.get(game, 'vehicleLights') as { shadowed: SpotLight[] }).shadowed;
  return beams.filter((beam) => isLitShadowSpot(beam, game)).length;
}

function litSites(game: Game): number {
  const slots = (Reflect.get(game, 'siteLights') as { slots: { spot: SpotLight }[] }).slots;
  return slots.filter(({ spot }) => isLitShadowSpot(spot, game)).length;
}

function nightCheck(game: Game): (evidence: Evidence) => Check {
  return (evidence) => {
    const [beams, sites, shadowDraws] = [litBeams(game), litSites(game), evidence.draws.byPass.shadow.draws];
    return {
      name: 'a shadowed beam and a site spot are lit',
      passed: beams > 0 && sites > 0 && shadowDraws > 0,
      detail: `${beams} shadowed beams and ${sites} shadowed site spots lit, ${shadowDraws} draws in the shadow pass`,
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

async function startTurn(ctx: Ctx, log: TurnLog, trigger: () => void): Promise<void> {
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
  log.waits.push(started - start);
  log.shots += shotsIn(game.state);
  log.workers.push(workerTurnMs());
}

async function finishPlayback(ctx: Ctx): Promise<void> {
  await ctx.probe.until(() => !ctx.game.busy, TURN_MS, 'the turn to finish playing');
}

async function playFightTurns(ctx: Ctx, log: TurnLog): Promise<void> {
  for (let i = 0; i < FIGHT_TURNS; i++) {
    await startTurn(ctx, log, () => ctx.game.endTurn());
    await finishPlayback(ctx);
  }
}

async function playDrive(ctx: Ctx, log: TurnLog): Promise<void> {
  const target = ctx.game.state.turn + DRIVE_TURNS;
  await startTurn(ctx, log, () => tapTurnKey(ctx.game));
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

type TurnScene = { id: Spec['id']; warm: boolean; start: World; run: () => Promise<void>; check: Spec['check'] };

function turnSpec(ctx: Ctx, scene: TurnScene): Spec {
  const { game, probe } = ctx;
  const setup = async () => {
    place(game, scene.start);
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
  return { id: scene.id, night: false, warm: scene.warm, setup, play, count, check: scene.check };
}

function outsideBase(base: World, town: Town): World {
  const clamp = (v: number) => Math.max(1, Math.min(base.size - 1, v));
  const outside = { x: clamp(town.def.pos.x + town.def.radius + OUTSIDE_TILES), y: clamp(town.def.pos.y) };
  return teleport(skipToHour(base, DAY_HOUR), outside);
}

function fightStart(base: World, town: Town): World {
  const moved = toggleGod(outsideBase(base, town));
  return FIGHT_TEMPLATES.reduce((world, template) => spawnNear(world, template, true), moved);
}

function driveStart(world: World): World {
  const me = world.vehicles.find((v) => v.id === world.player.vehicleId);
  if (!me) throw new Error(`Player vehicle ${world.player.vehicleId} missing`);
  const clamp = (v: number) => Math.max(1, Math.min(world.size - 1, v));
  const toward = me.pos.x < world.size / 2 ? 1 : -1;
  const dest = { x: clamp(me.pos.x + toward * DRIVE_TILES), y: clamp(me.pos.y) };
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
  place(ctx.game, world);
  await settle(ctx, false);
  for (const offset of PREVIEW_OFFSETS) log.previews.push(await previewMs(ctx, world, offset));
}

function fightCheck(log: TurnLog): Spec['check'] {
  return () => ({ name: 'shots were fired', passed: log.shots > 0, detail: `${log.shots} shot events over the fight turns` });
}

function driveCheck(evidence: Evidence): Check {
  const builds = evidence.frames.reduce((sum, f) => sum + f.chunkBuilds, 0);
  return { name: 'new terrain chunks were built', passed: builds > 0, detail: `${builds} terrain chunks built during the timed drive frames` };
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

function hidden(objects: readonly Object3D[]): () => void {
  const before = objects.map((object) => object.visible);
  objects.forEach((object) => (object.visible = false));
  return () => objects.forEach((object, i) => (object.visible = before[i]));
}

function hideSystem(game: Game, system: BenchSystem): Toggle {
  return { name: system, apply: () => hidden(system === 'lights' ? lampsOf(game) : systemRootsOf(game)[system]) };
}

const SHADOW_OFF: (game: Game) => Toggle = (game) => ({
  name: 'shadowMaps',
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
  await spec.setup();
  const undo = toggle ? toggle.apply() : () => undefined;
  try {
    if (toggle) await settle(ctx, spec.night);
    const frames = Math.min(SAVINGS_FRAMES, ctx.passFrames);
    return passStats(await spec.play(frames, WARMUP_FRAMES)).real.median;
  } finally {
    undo();
  }
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
    await spec.setup();
    await spec.play(ctx.passFrames, WARMUP_FRAMES);
  }
  const passes: FrameRecord[][] = [];
  let longTasks = 0;
  for (let i = 0; i < PASS_COUNT; i++) {
    await spec.setup();
    const from = performance.now();
    passes.push(await spec.play(ctx.passFrames, WARMUP_FRAMES));
    longTasks += ctx.probe.longTasks.countBetween(from, performance.now());
  }
  return { passes, longTasks };
}

async function runScene(ctx: Ctx, spec: Spec): Promise<SceneReport> {
  const { passes, longTasks } = await measurePasses(ctx, spec);
  const stats = passes.map(passStats);
  const pooled = poolFrames(passes);
  const frame = passStats(pooled);
  const draws = await spec.count();
  const check = spec.check({ draws, frames: pooled });
  if (!check.passed) throw new Error(`Scene ${spec.id} failed its content check "${check.name}": ${check.detail}`);
  const wanted = spec.id !== 'drive' && ctx.options.savingsAbove !== null && frame.real.p99 > ctx.options.savingsAbove;
  const savings = wanted ? await measureSavings(ctx, spec, draws) : null;
  return { id: spec.id, passes: stats, frame, spread: spreadOf(stats), bound: boundOf(frame), longTasks, draws, slowFrames: slowFrameSums(pooled), savings, check };
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

function stepsOf(): BenchReport['turns']['steps'] {
  const entries = Object.entries(perfSnapshot()).map(([name, s]) => [name, { total: s.total, calls: s.calls, max: s.max }]);
  return Object.fromEntries(entries);
}

function specsFor(ctx: Ctx, town: Town, base: World, log: TurnLog): Spec[] {
  const near = { zoom: NEAR_ZOOM, pan: NEAR_PAN_TILES };
  const far = { zoom: FAR_ZOOM, pan: FAR_PAN_TILES };
  const still = { zoom: NEAR_ZOOM, pan: 0 };
  const stillFar = { zoom: FAR_ZOOM, pan: 0 };
  const fight: TurnScene = { id: 'fight', warm: true, start: fightStart(base, town), run: () => playFightTurns(ctx, log), check: fightCheck(log) };
  const drive: TurnScene = { id: 'drive', warm: false, start: driveStart(outsideBase(base, town)), run: () => playDrive(ctx, log), check: driveCheck };
  return [
    townSpec(ctx, base, town, 'town-day', DAY_HOUR, near),
    townSpec(ctx, base, town, 'town-day-far', DAY_HOUR, far),
    townSpec(ctx, base, town, 'town-night', NIGHT_HOUR, still),
    townSpec(ctx, base, town, 'town-night-far', NIGHT_HOUR, stillFar),
    turnSpec(ctx, fight),
    turnSpec(ctx, drive),
  ];
}

async function playAll(ctx: Ctx, specs: Spec[], preview: () => Promise<void>): Promise<SceneReport[]> {
  const scenes: SceneReport[] = [];
  for (const spec of specs) {
    if (spec.id === 'fight') resetPerf();
    if (spec.id === 'drive') await preview();
    scenes.push(await runScene(ctx, spec).catch((error: Error) => {
      throw new Error(`Scene ${spec.id}: ${error.message}`, { cause: error });
    }));
  }
  return scenes;
}

export async function runBench(game: Game, options: BenchOptions): Promise<BenchReport> {
  const probe = new Probe(game);
  const passFrames = options.passFrames ?? PASS_FRAMES;
  const ctx: Ctx = { game, probe, options, passFrames };
  const start = { pixelRatio: window.devicePixelRatio, scale: game.renderer.getPixelRatio() / window.devicePixelRatio };
  const base = game.state;
  const town = pickTown(base);
  const log: TurnLog = { waits: [], workers: [], previews: [], shots: 0 };
  probe.install();
  try {
    const specs = specsFor(ctx, town, teleport(base, town.pad), log);
    const scenes = await playAll(ctx, specs, () => measurePreviews(ctx, outsideBase(teleport(base, town.pad), town), log));
    return {
      schema: 1,
      version: GAME_VERSION,
      renderer: rendererName(game),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      pixelRatio: start.pixelRatio,
      renderScale: start.scale,
      gpuTimer: probe.gpu.available,
      town: town.def.id,
      scenes,
      turns: { waitMs: frameStats(log.waits), workerTurnMs: frameStats(log.workers), previewMs: frameStats(log.previews), steps: stepsOf() },
      bootMs: bootMs(),
    };
  } finally {
    probe.uninstall();
  }
}
