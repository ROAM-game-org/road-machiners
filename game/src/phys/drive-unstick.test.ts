import { beforeAll, describe, expect, it } from 'vitest';
import { RULES } from '../data/rules';
import { addVehicle, emptyWorld } from '../sim/testkit';
import type { MoveOrder, Obstacle, World } from '../sim/types';
import { angleDiff, DEG, dist, type Vec } from '../sim/vec';
import { endTurn, setDirect } from '../sim/world';
import { buildDrive, freeDrive, initPhysics } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const START: Vec = { x: 30, y: 30 };

function rock(id: string, x: number, y: number, r = 1.2): Obstacle {
  return { id, kind: 'rock', pos: { x, y }, r };
}

function worldWith(rocks: Obstacle[], order: MoveOrder | null, opts: { manual?: boolean; chassis?: string; at?: Vec; heading?: number } = {}): World {
  let w = emptyWorld(opts.at ?? START);
  w.obstacles = rocks;
  if (opts.chassis) {
    w.vehicles[0].pos = { x: 90, y: 90 };
    const npc = addVehicle(w, 'independent', opts.chassis, ['stockEngine'], opts.at ?? START);
    w.vehicles = [npc, ...w.vehicles.filter((v) => v.id !== npc.id)];
  }
  const truck = w.vehicles[0];
  truck.heading = opts.heading ?? 0;
  truck.order = order;
  if (opts.manual) w = setDirect(w, true);
  return w;
}

function trace(w: World, turns: number): { w: World; path: Vec[]; headings: number[] } {
  let d = buildDrive(w);
  const path: Vec[] = [];
  const headings: number[] = [];
  for (let i = 0; i < turns; i++) {
    let next: ReturnType<typeof buildDrive> | null = null;
    w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
    freeDrive(d);
    d = next!;
    path.push({ ...w.vehicles[0].pos });
    headings.push(w.vehicles[0].heading);
  }
  freeDrive(d);
  return { w, path, headings };
}

const behind = (): MoveOrder => ({ kind: 'stopAt', dest: { x: START.x - 4, y: START.y } });

describe('a truck beside a prop backs away from it', () => {
  const side = [rock('rock-side', 30, 31.6)];

  describe.each([
    ['scout', 'manual', true],
    ['scout', 'auto', false],
  ])('%s, %s', (chassis, _mode, manual) => {
    it('a click straight behind backs it out within the reverse cone', () => {
      const { path, headings } = trace(worldWith(side, behind(), { manual, chassis: chassis === 'scout' ? undefined : chassis }), 3);
      expect(dist(path[2], START)).toBeGreaterThan(3);
      for (const h of headings) expect(Math.abs(angleDiff(0, h))).toBeLessThan(RULES.reverse.cone * DEG);
    });
  });
});

describe('a long hauler beside a prop', () => {
  it('drives out to an order behind it', () => {
    const side = [rock('rock-side', 30, 31.9)];
    const { path } = trace(worldWith(side, behind(), { chassis: 'hauler' }), 8);
    expect(dist(path.at(-1)!, { x: 26, y: 30 })).toBeLessThan(2);
  });
});

describe('a truck between two rocks', () => {
  it('arrives at an auto order behind it', () => {
    const rocks = [rock('rock-a', 31.5, 32), rock('rock-b', 28.2, 28)];
    const { path } = trace(worldWith(rocks, behind()), 6);
    expect(dist(path.at(-1)!, { x: 26, y: 30 })).toBeLessThan(1.5);
  });
});

describe('a truck after a glancing hit', () => {
  const hit = (order: MoveOrder | null, manual: boolean): World => {
    const w = worldWith([rock('rock-hit', 42, 31.6, 1.5)], order, { manual, at: { x: 30, y: 30 } });
    w.vehicles[0].speed = 8;
    return w;
  };

  function rested(manual: boolean): World {
    return trace(hit({ kind: 'through', dest: { x: 60, y: 30 } }, manual), 4).w;
  }

  it.each([0, 45, 90, 135, 180, 225, 270, 315])('an auto order toward %i degrees makes progress', (deg) => {
    const w = rested(false);
    const from = { ...w.vehicles[0].pos };
    w.vehicles[0].order = { kind: 'stopAt', dest: { x: from.x + 8 * Math.cos(deg * DEG), y: from.y + 8 * Math.sin(deg * DEG) } };
    const { path } = trace(w, 4);
    const best = Math.max(...path.map((p) => dist(p, from)));
    expect(best).toBeGreaterThan(deg === 0 || deg === 45 ? 0 : 4);
  });
});

describe('a prop directly behind a parked truck', () => {
  it('is not backed into by a click behind', () => {
    const wall = [rock('rock-behind', 28.2, 30, 1.2)];
    const w = worldWith(wall, behind(), { manual: true });
    const { path } = trace(w, 3);
    for (const p of path) expect(dist(p, wall[0].pos)).toBeGreaterThanOrEqual(dist(START, wall[0].pos) - 0.3);
  });
});
