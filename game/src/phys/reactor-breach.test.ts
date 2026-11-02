import { beforeAll, describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { inCore } from '../sim/hazard';
import { makeVehicle } from '../sim/factory';
import { hangUp } from '../sim/dialogue';
import { defaultSetup } from '../sim/settings';
import { lightZone } from '../sim/sunward-crater';
import { PLAIN_KIT } from '../sim/testkit';
import type { Vehicle, World } from '../sim/types';
import { dist } from '../sim/vec';
import { endTurn, newWorld, setMoveOrder } from '../sim/world';
import { budget } from '../test/budget';
import { TEST_MAP } from '../test/map';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const APPROACH = 11;
const CLEAR_OF_DRUM = 3;
const DRIVE_TURNS = 14;
const SETTLE_TURNS = 2;
const START_HEALTH = 40;

function worldWith(chassisId: string): World {
  const w = newWorld(1337, PLAIN_KIT, TEST_MAP, defaultSetup('roaming'));
  w.vehicles = w.vehicles.filter((v) => v.faction === 'player');
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  const zone = lightZone();
  const pos = { x: zone.pos.x + APPROACH, y: zone.pos.y + CLEAR_OF_DRUM };
  const truck = makeVehicle(w, { faction: 'player', chassisId, parts: [{ defId: 'stockEngine', wear: 0 }], spares: [], cargo: {}, pos, heading: Math.PI, brain: null });
  w.vehicles[0] = { ...truck, id: w.vehicles[0].id };
  w.player.fuel = 999;
  w.player.health = START_HEALTH;
  return w;
}

function me(w: World): Vehicle {
  return w.vehicles.find((v) => v.id === w.player.vehicleId)!;
}

function drive(chassisId: string): { w: World; closest: number; burned: boolean; told: boolean; died: boolean } {
  const zone = lightZone();
  let w = worldWith(chassisId);
  me(w).direct = true;
  let d: Drive = buildDrive(w);
  let closest = Infinity;
  let burned = false;
  let told = false;
  let died = false;
  for (let turn = 0; turn < DRIVE_TURNS + SETTLE_TURNS; turn++) {
    if (w.player.state !== 'active') break;
    if (w.player.call) w = hangUp(w);
    w = turn < DRIVE_TURNS ? setMoveOrder(w, { kind: 'through', dest: zone.pos, pace: 1.5 }) : setMoveOrder(w, { kind: 'brake' });
    me(w).direct = true;
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
    freeDrive(d);
    d = next!;
    expect(w.events.filter((e) => e.t === 'stall'), `${chassisId} turn ${turn + 1}`).toEqual([]);
    burned ||= w.events.some((e) => e.t === 'coreBurn');
    told ||= w.events.some((e) => e.t === 'info' && e.note.id === 'core');
    died ||= w.events.some((e) => e.t === 'death' && e.cause === 'core');
    closest = Math.min(closest, dist(me(w).pos, zone.pos));
  }
  freeDrive(d);
  return { w, closest, burned, told, died };
}

describe('the reactor core from the breach side', () => {
  it.each(['buggy', 'semi'])('a %s that drives into the breach light ends inside the core and burns', (chassisId) => {
    const zone = lightZone();
    const { w, closest, burned, told, died } = drive(chassisId);
    expect(closest).toBeGreaterThan(zone.core!.radius);
    expect(inCore(zone, me(w).pos)).toBe(true);
    expect(w.player.health).toBeLessThan(30);
    expect(died).toBe(true);
    expect(burned).toBe(true);
    expect(told).toBe(true);
  }, budget(180_000));
});
