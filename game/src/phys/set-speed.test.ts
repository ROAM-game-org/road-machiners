import { beforeAll, describe, expect, it } from 'vitest';
import { RULES } from '../data/rules';
import { TERRAIN } from '../data/terrain';
import { makeVehicle } from '../sim/factory';
import { restBend } from '../sim/rig';
import { vehicleStats } from '../sim/stats';
import { zoneEdges } from '../sim/steering';
import { editableTerrain, emptyWorld } from '../sim/testkit';
import type { MoveOrder, World } from '../sim/types';
import { endTurn, setMoveOrder } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const SET = 5;
const holdAhead = () => (zoneEdges().brakeEnd + zoneEdges().holdEnd) / 2;

function rigWorld(chassisId: string): World {
  const w = emptyWorld({ x: 20, y: 40 });
  const me = w.vehicles[0];
  const rig = makeVehicle(w, { faction: 'player', chassisId, parts: [{ defId: 'workhorseDiesel', wear: 0 }], spares: [], cargo: {}, pos: me.pos, heading: 0, brain: null });
  w.vehicles[0] = { ...rig, id: me.id, speed: 0, bend: restBend(chassisId) };
  w.player.fuel = 999;
  return w;
}

function startedAt(w: World, speed: number): World {
  const v = w.vehicles[0];
  Object.assign(v, { speed, setSpeed: speed, direct: true });
  return w;
}

type Step = { ground: string; order: (w: World) => MoveOrder | null };

const hold = (w: World): MoveOrder => ({ kind: 'through', dest: { x: w.vehicles[0].pos.x + holdAhead(), y: w.vehicles[0].pos.y } });

function drive(start: World, steps: Step[]): World[] {
  let w = start;
  let d: Drive | null = null;
  const worlds: World[] = [];
  for (const step of steps) {
    editableTerrain(w).types.fill(step.ground as 'road');
    const order = step.order(w);
    w = order ? setMoveOrder(w, order) : w;
    d ??= buildDrive(w);
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
    freeDrive(d);
    d = next;
    worlds.push(w);
  }
  freeDrive(d!);
  return worlds;
}

const repeat = (ground: string, n: number, order: Step['order']): Step[] => Array.from({ length: n }, () => ({ ground, order }));

describe('manual driving keeps a set speed', () => {
  it.each(['scout', 'semi'])('a %s slowed by loose ground returns to its set speed on asphalt with hold clicks only', (chassisId) => {
    const w = startedAt(rigWorld(chassisId), 0);
    const top = vehicleStats(w, w.vehicles[0]).maxSpeed;
    const set = Math.min(SET, top * 0.8);
    startedAt(w, set);
    const worlds = drive(w, [...repeat('sand', 4, hold), ...repeat('asphalt', 8, hold)]);
    const loose = worlds[3].vehicles[0];
    const share = TERRAIN.drive.unpavedTopSpeed;
    expect(loose.setSpeed).toBeCloseTo(set, 5);
    expect(loose.speed).toBeLessThan(set * 0.97);
    expect(loose.speed).toBeGreaterThan(set * share * 0.5);
    const back = worlds[worlds.length - 1].vehicles[0];
    expect(back.setSpeed).toBeCloseTo(set, 5);
    expect(back.speed).toBeGreaterThan(set * 0.97);
  }, 120_000);

  it('a brake order drops the set speed', () => {
    const w = startedAt(emptyWorld({ x: 20, y: 40 }), 3);
    const worlds = drive(w, [{ ground: 'asphalt', order: () => ({ kind: 'brake' }) }]);
    expect(worlds[0].vehicles[0].setSpeed).toBeUndefined();
  });

  it('a coast with no order keeps the set speed', () => {
    const w = startedAt(emptyWorld({ x: 20, y: 40 }), 3);
    const worlds = drive(w, repeat('asphalt', 2, () => null));
    expect(worlds[1].vehicles[0].setSpeed).toBeGreaterThan(RULES.parkedSpeed);
  });

  it('a truck at rest does not climb back to an old set speed', () => {
    const w = startedAt(emptyWorld({ x: 20, y: 40 }), 0);
    w.vehicles[0].setSpeed = 5;
    const worlds = drive(w, [{ ground: 'asphalt', order: () => null }]);
    expect(worlds[0].vehicles[0].setSpeed).toBeUndefined();
    expect(worlds[0].vehicles[0].speed).toBeLessThanOrEqual(RULES.parkedSpeed);
  });

  it('route mode keeps no set speed', () => {
    const w = startedAt(emptyWorld({ x: 20, y: 40 }), 3);
    w.vehicles[0].direct = false;
    const worlds = drive(w, [{ ground: 'asphalt', order: hold }]);
    expect(worlds[0].vehicles[0].setSpeed).toBeUndefined();
  });
});
