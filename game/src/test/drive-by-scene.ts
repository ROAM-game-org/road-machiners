import { HUNT, NPCS } from '../data/npcs';
import { REGION } from '../data/region';
import { TERRAIN } from '../data/terrain';
import { TIME } from '../data/time';
import { START_KITS } from '../data/start';
import { TEST_MAP } from './map';
import { reusedWorld } from './world-cache';
import { goodsCount, isLoot } from '../sim/grid';
import { mountAwayFromFront, mountFacingFront } from './layout-spots';
import { addGoods } from '../sim/inventory';
import { isTransientWreck } from '../sim/nav/layer';
import { huntingGrounds } from '../sim/npc-decisions';
import { sitePads } from '../sim/sites';
import { defaultSetup } from '../sim/settings';
import { sunAt } from '../sim/sun';
import { stateOf } from '../sim/states';
import { addVehicle, npcBrain, testDrive } from '../sim/testkit';
import type { Vehicle, World } from '../sim/types';
import { dist, type Vec } from '../sim/vec';
import { exposureAt, seesGround, watchPost } from '../sim/watch-posts';
import { endTurn, newWorld } from '../sim/world';
import { formatNpcPass } from '../ui/format';
import { resolve } from '../text/resolve';
import { playerVehicle } from '../sim/damage';
import { canVehicleSee } from '../sim/vision';
import { contactsOf } from '../sim/detect';

export const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const camp = REGION.locations.find((l) => l.id === 'scrapjaw')!;
export const TURNS = 40;
export const SLOW_PASS_TURNS = 55;

type Prey = 'trader' | 'player' | 'playerEmpty' | 'empty' | 'parked' | 'brute';

function nightTurn(): number {
  for (let t = 1; t < TIME.turnsPerDay; t++) if (sunAt(t) === null) return t;
  throw new Error('No night turn');
}

const PASS_SHARE = 0.6;

function passPoint(post: Vec, ground: Vec, night: boolean): Vec {
  const reach = TERRAIN.vision.radius * (night ? TIME.nightSight : 1) * PASS_SHARE;
  const gap = dist(post, ground);
  if (gap <= reach) return ground;
  return { x: post.x + ((ground.x - post.x) * reach) / gap, y: post.y + ((ground.y - post.y) * reach) / gap };
}

function roadGround(w: World, night: boolean): { ground: Vec; post: Vec; dir: Vec } {
  const hidden = huntingGrounds(w).map((g) => watchPost(w, g)).filter((p): p is Vec => p !== null && exposureAt(w, p) === 0);
  const scenes = hidden.map((post) => {
    const road = nearestStretch(post);
    return { post, dir: road.dir, ground: passPoint(post, road.ground, night) };
  }).filter((s) => seesGround(w, s.post, s.ground));
  if (scenes.length === 0) throw new Error('No hidden raid post sees ground toward its road');
  return scenes.reduce((best, s) => (dist(s.post, s.ground) < dist(best.post, best.ground) ? s : best));
}

function nearestStretch(post: Vec): { ground: Vec; dir: Vec } {
  let best: { ground: Vec; dir: Vec } | null = null;
  for (const road of REGION.roads)
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1];
      const b = road[i];
      const len = dist(a, b);
      if (len === 0) continue;
      const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      const t = Math.max(0, Math.min(len, (post.x - a.x) * dir.x + (post.y - a.y) * dir.y));
      const ground = { x: a.x + dir.x * t, y: a.y + dir.y * t };
      if (best === null || dist(post, ground) < dist(post, best.ground)) best = { ground, dir };
    }
  if (best === null) throw new Error('The map has no road');
  return best;
}

type Scene = { w: World; raider: Vehicle; prey: Vehicle; ground: Vec; end: Vec; moves: boolean; parkedAt: Vec };

function scene(seed: number, kind: Prey, night: boolean): Scene {
  const w = reusedWorld(`seed ${seed}`, () => newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false));
  w.obstacles = w.obstacles.filter((o) => !isTransientWreck(o));
  if (night) w.turn = nightTurn();
  const { ground, post, dir } = roadGround(w, night);
  const me = playerVehicle(w);
  const at = (along: number): Vec => ({ x: ground.x + dir.x * along, y: ground.y + dir.y * along });
  const start = kind === 'parked' ? { x: post.x + (post.x > w.size / 2 ? -60 : 60), y: post.y } : at(-45);
  const others = w.vehicles.filter((v) => v.id !== me.id);
  w.vehicles = w.vehicles.filter((v) => v.id === me.id);
  w.removed.push(...others);
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  const raider = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], { ...post });
  mountFacingFront(w, raider, 'mg');
  raider.brain = npcBrain('buggy', sitePads(camp)[0], ['raider']);
  raider.brain.goals = [{ kind: 'raid', targetId: null, destination: null, phase: 'act', reason: 'watchedRoad', watchUntil: w.turn + HUNT.watchTurns }];
  const end = kind === 'playerEmpty' ? { x: post.x, y: post.y - 6 } : at(60);
  let prey: Vehicle;
  if (kind === 'player' || kind === 'playerEmpty') {
    prey = me;
    if (kind === 'playerEmpty') me.items = me.items.filter((item) => !isLoot(me.chassisId, item));
    prey.pos = { ...start };
  } else {
    me.items = me.items.filter((item) => !isLoot(me.chassisId, item));
    me.pos = { x: post.x + 3, y: post.y + 3 };
    prey = addVehicle(w, 'independent', kind === 'brute' ? 'hauler' : 'scout', kind === 'brute' ? ['mg', 'mg', 'mg', 'mg', 'stockEngine'] : ['stockEngine'], { ...start });
    if (kind !== 'brute') mountAwayFromFront(w, prey, 'mg');
    prey.brain = npcBrain('trader', prey.pos, ['trader']);
    prey.brain.goals = [];
    if (kind === 'empty') prey.items = prey.items.filter((item) => !isLoot(prey.chassisId, item));
    if (kind !== 'empty' && kind !== 'parked') addGoods(w, prey, 'electronics', 6);
    if (kind === 'brute') addGoods(w, prey, 'electronics', 6);
    if (kind !== 'empty' && kind !== 'parked' && goodsCount(prey).electronics === undefined) throw new Error('The prey holds no cargo');
  }
  if (kind === 'parked') prey.pos = { ...start };
  w.rngState = seed * 7919 + 1;
  return { w, raider, prey, ground, end, moves: kind !== 'parked', parkedAt: { ...prey.pos } };
}

type Frame = { turn: number; raider: Vec; prey: Vec; sees: boolean; heard: string; goals: string[]; changes: string[]; cargo: number };
export type Result = { hover: string[]; engaged: boolean; passed: string[]; frames: Frame[]; goalsChanged: boolean; feud: boolean; fled: boolean };

function play(s: Scene, turns = TURNS): Result {
  let w = s.w;
  const frames: Frame[] = [];
  const passed: string[] = [];
  const hover = new Set<string>();
  let engaged = false, goalsChanged = false, feud = false, fled = false;
  for (let i = 0; i < turns; i++) {
    if (w.player.call) {
      if (w.player.call.with === s.raider.id) engaged = true;
      w.player.call = null;
    }
    if (engaged) break;
    w = endTurn(w, (world) => {
      const mover = world.vehicles.find((v) => v.id === s.prey.id)!;
      if (s.moves) mover.order = { kind: 'stopAt', dest: s.end };
      else {
        mover.order = null;
        mover.speed = 0;
      }
      testDrive(world);
    });
    const raider = w.vehicles.find((v) => v.id === s.raider.id)!;
    const prey = w.vehicles.find((v) => v.id === s.prey.id)!;
    if (!s.moves) {
      prey.pos = { ...s.parkedAt };
      prey.speed = 0;
      prey.order = null;
    }
    const goals = raider.brain!.goals;
    if (goals.some((g) => g.kind === 'fight' && g.targetId === prey.id) || stateOf(w, 'combat', raider.id, prey.id) !== null) engaged = true;
    if (goals.some((g) => g.kind === 'flee' && g.targetId === prey.id)) fled = true;
    if (stateOf(w, 'feud', raider.id, prey.id) !== null || stateOf(w, 'feud', prey.id, raider.id) !== null) feud = true;
    if (goals.some((g) => g.targetId === prey.id)) goalsChanged = true;
    for (const e of w.events) if (e.t === 'preyPassed' && e.vehicle === raider.id) passed.push(e.reason);
    const line = formatNpcPass(w, raider);
    if (line) hover.add(resolve(line, 'en'));
    const contact = contactsOf(w, raider, Infinity).find((c) => c.vehicleId === prey.id);
    frames.push({
      turn: w.turn,
      raider: { x: Math.round(raider.pos.x), y: Math.round(raider.pos.y) },
      prey: { x: Math.round(prey.pos.x), y: Math.round(prey.pos.y) },
      sees: canVehicleSee(w, raider, prey.pos),
      heard: contact ? `${Math.round(contact.center.x)},${Math.round(contact.center.y)} r${contact.radius.toFixed(0)}` : '-',
      goals: goals.map((g) => g.kind),
      changes: w.events.flatMap((e) => (e.t === 'activity' && e.vehicle === raider.id ? [`${e.previous}>${e.activity}:${e.reason}`] : [])),
      cargo: prey.items.length,
    });
    if (engaged) break;
  }
  return { hover: [...hover], engaged, passed, frames, goalsChanged, feud, fled };
}


const trace = (r: Result): string => r.frames.map((f) => `${f.turn} R${f.raider.x},${f.raider.y} P${f.prey.x},${f.prey.y} ${f.sees ? 'SEES' : 'blind'} heard ${f.heard} [${f.goals.join('>')}] ${f.changes.join(' ')}`).join('\n');

const memo = new Map<string, Result>();

export function runs(kind: Prey, night: boolean, turns = TURNS, seeds: readonly number[] = SEEDS): Result[] {
  return seeds.map((seed) => {
    const key = `${kind}:${night}:${turns}:${seed}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const result = play(scene(seed, kind, night), turns);
    memo.set(key, result);
    return result;
  });
}

export function count(results: Result[], pick: (r: Result) => boolean): number {
  return results.filter(pick).length;
}

export function summary(results: Result[], seeds: readonly number[] = SEEDS): string {
  return results.map((r, i) => `seed ${seeds[i]}: engaged ${r.engaged} passed ${r.passed.join('+') || '-'}\n${trace(r)}`).join('\n\n');
}

