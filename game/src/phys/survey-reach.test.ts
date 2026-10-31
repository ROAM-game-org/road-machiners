import { beforeAll, describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { ECONOMY } from '../data/goods';
import { REGION } from '../data/region';
import { addGoods } from '../sim/inventory';
import { mapObstacles, propReach } from '../sim/mapgen';
import { navLayer } from '../sim/nav/layer';
import { MAX_RADIUS, nearestRoadPoint, standPoint } from '../sim/salvage';
import { defaultSetup } from '../sim/settings';
import { surveySites } from '../sim/survey';
import { addVehicle, editableTerrain, emptyWorld, PLAIN_KIT } from '../sim/testkit';
import type { Obstacle, Vehicle, World } from '../sim/types';
import { dist, type Vec } from '../sim/vec';
import { endTurn, newWorld, setMoveOrder } from '../sim/world';
import { budget } from '../test/budget';
import { TEST_MAP } from '../test/map';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const DRIVE_TURNS = 120;
const baked = mapObstacles(TEST_MAP);
const layer = navLayer(TEST_MAP.terrain, baked, MAX_RADIUS);
const STEP = REGION.navigation.climbStep;

type Place = { prop: Obstacle; need: number; stand: Vec };

function placeOf(prop: Obstacle): Place | null {
  for (let climb = 0; climb < 0.6 + STEP; climb += STEP) {
    const stand = standPoint(layer, prop, climb);
    if (stand) return { prop, need: climb, stand };
  }
  return null;
}

function steepest(props: Obstacle[], above: number): Place {
  const places = props.flatMap((p) => placeOf(p) ?? []).filter((p) => p.need > above);
  return places.reduce((a, b) => (b.need > a.need ? b : a));
}

function referenceBuggy(w: World, pos: Vec): Vehicle {
  const buggy = addVehicle(w, 'player', 'courier', ['mg', 'stockEngine', 'plates'], pos);
  addGoods(w, buggy, 'scrap', 999);
  w.vehicles = [buggy];
  w.player.vehicleId = buggy.id;
  w.player.fuel = 999;
  return buggy;
}

function holdNpcSpawns(w: World): void {
  w.spawnQueue = [];
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
}

function driveToStand(place: Place): { inReach: boolean } {
  let w = newWorld(1337, PLAIN_KIT, TEST_MAP, defaultSetup('roaming'));
  holdNpcSpawns(w);
  const buggy = referenceBuggy(w, nearestRoadPoint(place.prop.pos));
  let drive: Drive = buildDrive(w);
  const reach = (propReach(place.prop) + ECONOMY.useRange) * ECONOMY.interactionScale;
  for (let i = 0; i < DRIVE_TURNS && dist(w.vehicles[0].pos, place.prop.pos) > reach; i++) {
    w = setMoveOrder(w, { kind: 'stopAt', dest: place.stand });
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(drive, (r) => (next = r.next)));
    freeDrive(drive);
    drive = next!;
    expect(w.events.filter((e) => e.t === 'stall')).toEqual([]);
  }
  freeDrive(drive);
  const here = w.vehicles.find((v) => v.id === buggy.id)!;
  return { inReach: dist(here.pos, place.prop.pos) <= reach };
}

describe('a loaded stock courier on the committed map', () => {
  it('drives from the nearest road to the steepest posted survey place and parks in reach', () => {
    const props = surveySites(TEST_MAP).map((s) => baked.find((o) => `survey-${o.id}` === s.id)!);
    const place = steepest(props, 0);
    expect(place.need).toBeLessThanOrEqual(REGION.navigation.reachClimb);
    expect(driveToStand(place).inReach).toBe(true);
  }, budget(300_000));
});

const RAMP_FOOT = 40;
const RAMP_LENGTH = 20;
const RAMP_TOP: Vec = { x: 75, y: 100 };

function climbsRamp(grade: number): boolean {
  let w = emptyWorld({ x: 20, y: 100 });
  holdNpcSpawns(w);
  const terrain = editableTerrain(w);
  const n = terrain.size;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) terrain.heights[j * (n + 1) + i] = Math.min(RAMP_LENGTH, Math.max(0, i - RAMP_FOOT)) * grade;
  const buggy = referenceBuggy(w, { x: 20, y: 100 });
  let drive: Drive = buildDrive(w);
  for (let i = 0; i < DRIVE_TURNS && dist(w.vehicles[0].pos, RAMP_TOP) > 3; i++) {
    w = setMoveOrder(w, { kind: 'stopAt', dest: RAMP_TOP });
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(drive, (r) => (next = r.next)));
    freeDrive(drive);
    drive = next!;
  }
  freeDrive(drive);
  return dist(w.vehicles.find((v) => v.id === buggy.id)!.pos, RAMP_TOP) <= 3;
}

describe('a loaded stock courier on a synthetic ramp', () => {
  it('tops a ramp at the reference climb', () => {
    expect(climbsRamp(REGION.navigation.reachClimb)).toBe(true);
  }, budget(300_000));

  it('does not top a ramp at twice the reference climb', () => {
    expect(climbsRamp(2 * REGION.navigation.reachClimb)).toBe(false);
  }, budget(300_000));
});
