import { beforeAll, describe, expect, it } from 'vitest';
import { chassisDef } from '../data/chassis';
import { START_KITS } from '../data/start';
import { isFree } from '../sim/spawn';
import { emptyWorld } from '../sim/testkit';
import { defaultSetup } from '../sim/settings';
import type { MoveOrder, World } from '../sim/types';
import { bearing, dist, type Vec } from '../sim/vec';
import { endTurn, newWorld, setMoveOrder } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { buildDrive, freeDrive, GROUND, initPhysics, type Drive, type TurnResult } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

type Trip = { w: World; crashes: { b: string; impact: number }[]; breaks: string[]; turns: number; arrived: boolean; moved: number[] };

function drive(start: World, turns: number): Trip {
  let w = start;
  let d: Drive = buildDrive(w);
  const crashes: Trip['crashes'] = [];
  const breaks: string[] = [];
  const moved: number[] = [];
  let arrived = false;
  let n = 0;
  for (; n < turns && !arrived; n++) {
    const before = { ...w.vehicles[0].pos };
    let res: TurnResult | null = null;
    w = endTurn(w, physicsMove(d, (r) => (res = r)));
    freeDrive(d);
    d = res!.next;
    for (const c of res!.crashes) if (c.b !== GROUND && !c.b.startsWith('v')) crashes.push({ b: c.b, impact: c.impact });
    for (const b of res!.breaks) breaks.push(b.prop);
    moved.push(dist(before, w.vehicles[0].pos));
    arrived = !w.vehicles[0].order;
  }
  freeDrive(d);
  return { w, crashes, breaks, turns: n, arrived, moved };
}

const hard = (t: Trip) => t.crashes.filter((c) => c.impact > 1);

function stalls(t: Trip): boolean {
  for (let i = 0; i + 4 <= t.moved.length; i++) if (!t.arrived && t.moved.slice(i, i + 4).reduce((a, b) => a + b, 0) < 1) return true;
  return false;
}

function onFlat(speed: number, heading: number, order: MoveOrder, rocks: Vec[], r = 0.9): World {
  const w = emptyWorld();
  w.vehicles[0].speed = speed;
  w.vehicles[0].heading = heading;
  w.obstacles = rocks.map((pos, i) => ({ id: `rock${i + 1}`, pos, r, kind: 'rock' as const }));
  return setMoveOrder(w, order);
}

describe('a truck on a route sweeps its turn clear', () => {
  it('IV1: at speed 6 with a stop point to the side, it does not swing into a rock in the turn', () => {
    const t = drive(onFlat(6, 0, { kind: 'stopAt', dest: { x: 32, y: 40 } }, [{ x: 34, y: 32 }]), 12);
    expect(hard(t)).toEqual([]);
    expect(t.arrived).toBe(true);
  });

  it('IV2: nosed against a rock with the stop point to the side, it gets free and arrives', () => {
    const w = onFlat(0, 0, { kind: 'stopAt', dest: { x: 31, y: 36 } }, [{ x: 31.7, y: 30 }], 1.2);
    const t = drive(w, 8);
    expect(t.arrived).toBe(true);
    expect(t.crashes.filter((c) => c.b === 'rock1').length).toBeLessThanOrEqual(1);
  });

  it('IV5: a fence across the route is still driven through', () => {
    const w = emptyWorld();
    w.vehicles[0].speed = 6;
    w.obstacles = Array.from({ length: 41 }, (_, k) => k / 2 - 10).map((i) => ({ id: `fence-${i}`, pos: { x: 38, y: 30 + i }, r: 0.6, kind: 'landmark' as const, look: 'fence' as const, yaw: Math.PI / 2 }));
    const t = drive(setMoveOrder(w, { kind: 'through', dest: { x: 44, y: 30 } }), 8);
    expect(t.breaks.length).toBeGreaterThan(0);
    expect(t.arrived).toBe(true);
  });

  it('PC2: a rock beside a clear 30 tile line does not slow the truck', () => {
    const t = drive(onFlat(0, 0, { kind: 'through', dest: { x: 60, y: 30 } }, [{ x: 45, y: 31.5 }]), 12);
    expect(t.arrived).toBe(true);
    expect(t.turns).toBeLessThanOrEqual(CLEAR_TURNS);
  });
});

const CLEAR_TURNS = 8;

describe('reproduced TEST_MAP trips', () => {
  const base = () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    w.vehicles = w.vehicles.filter((v) => v.faction === 'player');
    w.player.fuel = 100;
    return w;
  };

  function trip(prop: string, start: Vec, dest: Vec, turn: number, kind: MoveOrder['kind'], speed: number): Trip {
    const w = base();
    const v = w.vehicles[0];
    const rock = w.obstacles.find((o) => o.id === prop)!;
    expect(isFree(w, start, chassisDef(v.chassisId).radius, v.id)).toBe(true);
    v.pos = start;
    v.heading = bearing(start, rock.pos) + turn;
    v.speed = speed;
    return drive(setMoveOrder(w, { kind, dest }), 20);
  }

  it.each([Math.PI / 2, -Math.PI / 2])('IV3: a rock beside the start, truck turned %d, reaches its waypoint with no damaging crash', (turn) => {
    const dest = { x: 292.9, y: 177.7 };
    const t = trip('rock2572', { x: 299.8, y: 190.6 }, dest, turn, 'stopAt', 3);
    expect(hard(t)).toEqual([]);
    expect(stalls(t)).toBe(false);
    expect(t.arrived).toBe(true);
  });
});
