
import { beforeAll, expect, it } from 'vitest';
import { REGION, scalePoint } from '../data/region';
import { dist, polylineDist, type Vec } from '../sim/vec';
import { editableTerrain, emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { endTurn, setMoveOrder } from '../sim/world';
import { buildDrive, freeDrive, GROUND, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';
import { budget } from '../test/budget';
import { climbNeedOnRoads, navLayer } from '../sim/nav/layer';
import { vehicleStats } from '../sim/stats';
import { reusedWorld } from '../test/world-cache';
import { START_KITS } from '../data/start';
import { defaultSetup } from '../sim/settings';
import { newWorld } from '../sim/world';
import { NPCS } from '../data/npcs';
import { TEST_MAP } from '../test/map';

beforeAll(async () => {
  await initPhysics();
  const world = playerOnlyWorld(1337);
  const player = world.vehicles.find((v) => v.id === world.player.vehicleId)!;
  climbNeedOnRoads(navLayer(world.terrain, world.obstacles, vehicleStats(world, player).radius));
});

function play(w: World, max: number, afterTurn: (w: World) => boolean = () => false): World {
  let d = buildDrive(w);
  for (let i = 0; i < max; i++) {
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
    freeDrive(d);
    d = next!;
    if (afterTurn(w)) break;
  }
  freeDrive(d);
  return w;
}

const NEVER_SPAWNS = 1e9;

function playerOnlyWorld(seed: number): World {
  return reusedWorld(`player only ${seed}`, () => {
    const world = newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    world.spawnQueue = [];
    for (const id of Object.keys(NPCS)) world.spawnTimer[id] = NEVER_SPAWNS;
    return world;
  });
}

type Leg = { pos: Vec; heading: number; speed: number };

const NOSE = REGION.towns.find((t) => t.id === 'nose')!;
const BOWL_LEG: Leg = { pos: scalePoint({ x: 209.3 / 5, y: 276.8 / 5 }), heading: -Math.PI / 4, speed: 7 };
const FIRST_BEND: Leg = { pos: { x: 1392.9, y: 595.8 }, heading: 0.674, speed: 0.94 };
const LAST_STRETCH: Leg = { pos: { x: 1521.4, y: 634.6 }, heading: 0.028, speed: 0.94 };

function driveLeg(from: Leg, dest: Vec, arrivedWithin: number): { staticDamage: number; end: Vec } {
  let w = setMoveOrder(playerOnlyWorld(1337), { kind: 'stopAt', dest });
  w.vehicles = w.vehicles.filter((v) => v.faction === 'player');
  w.player.fuel = 100;
  const me = w.player.vehicleId;
  Object.assign(w.vehicles[0], from);
  let staticDamage = 0;
  w = play(w, w.size, (world) => {
    world.vehicles = world.vehicles.filter((v) => v.faction === 'player');
    world.player.engineHeat = 0;
    for (const e of world.events)
      if (e.t === 'collision' && e.a === me && !e.b.startsWith('v') && !e.b.startsWith('site-') && e.b !== GROUND)
        staticDamage += e.hitsA.reduce((sum, h) => sum + h.damage, 0);
    return dist(world.vehicles[0].pos, dest) <= arrivedWithin;
  });
  return { staticDamage, end: w.vehicles[0].pos };
}

it('the player drives from Bowl to the first bend without a serious hit on a static obstacle', () => {
  const leg = driveLeg(BOWL_LEG, FIRST_BEND.pos, 4);
  expect(leg.staticDamage).toBeLessThan(5);
  expect(dist(leg.end, FIRST_BEND.pos)).toBeLessThanOrEqual(4);
});

it('the player drives from the first bend to the last stretch without a serious hit on a static obstacle', () => {
  const leg = driveLeg(FIRST_BEND, LAST_STRETCH.pos, 4);
  expect(leg.staticDamage).toBeLessThan(5);
  expect(dist(leg.end, LAST_STRETCH.pos)).toBeLessThanOrEqual(4);
});

it('the player drives from the last stretch to Nose without a serious hit on a static obstacle', () => {
  const leg = driveLeg(LAST_STRETCH, NOSE.pos, NOSE.radius + 1.5);
  expect(leg.staticDamage).toBeLessThan(5);
  expect(dist(leg.end, NOSE.pos)).toBeGreaterThan(NOSE.radius);
  expect(dist(leg.end, NOSE.pos)).toBeLessThanOrEqual(NOSE.radius + 1.5);
});

function roadWorld(road: Vec[]) {
  const w = emptyWorld();
  const t = editableTerrain(w);
  for (let y = 0; y < t.size; y++)
    for (let x = 0; x < t.size; x++) t.types[y * t.size + x] = polylineDist({ x: x + 0.5, y: y + 0.5 }, road) < REGION.roadWidth / 2 ? 'road' : 'hardpan';
  return w;
}

it('a truck following a road into a blocking rock stops on the corner without a serious hit', () => {
  const rock = { x: 60, y: 30 };
  let w = roadWorld([{ x: 20, y: 30 }, rock, { x: 60, y: 0 }]);
  w.obstacles = [{ id: 'r', pos: rock, r: 6, kind: 'rock' }];
  w.vehicles[0].pos = { x: 22, y: 30 };
  w = setMoveOrder(w, { kind: 'stopAt', dest: { x: 60, y: 8 } });
  let damage = 0;
  w = play(w, 40, (world) => {
    for (const e of world.events) if (e.t === 'collision') damage += e.hitsA.reduce((sum, h) => sum + h.damage, 0);
    return !world.vehicles[0].order;
  });
  expect(damage).toBeLessThan(5);
  expect(dist(w.vehicles[0].pos, { x: 60, y: 8 })).toBeLessThan(0.6);
}, budget(120_000));
