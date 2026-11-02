import { beforeAll, describe, expect, it } from 'vitest';
import { addVehicle, npcBrain } from '../sim/testkit';
import type { World } from '../sim/types';
import { endTurn } from '../sim/world';
import { budget } from '../test/budget';
import { me, ordered } from '../test/drive-kit';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

function turns(w: World, count: number, seen: (w: World, d: Drive) => void): World {
  let d = buildDrive(w);
  for (let i = 0; i < count; i++) {
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
    freeDrive(d);
    d = next!;
    seen(w, d);
  }
  freeDrive(d);
  return w;
}

describe('backing out', () => {
  it('a truck coming the other way is a speed cap, never solid clearance or a back-out', () => {
    const w = ordered({ kind: 'through', dest: { x: 90, y: 30 } }, 5);
    const trader = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 38, y: 30.2 }, Math.PI);
    trader.brain = npcBrain('trader', trader.pos, ['trader']);
    trader.speed = 5;
    trader.brain.goals.push({ kind: 'explore', targetId: null, destination: { x: 10, y: 30.2 }, phase: 'travel', reason: 'tripToSite' });
    const solid: number[] = [];
    const moving: number[] = [];
    const backed: boolean[] = [];
    turns(w, 6, (next, d) => {
      const mem = d.memory[me(next).id];
      solid.push(mem.clearAhead);
      moving.push(mem.clearMoving);
      backed.push(mem.backFrom !== null || mem.reverse);
    });
    expect(solid.every((s) => s === Infinity)).toBe(true);
    expect(moving.some((m) => m < Infinity)).toBe(true);
    expect(backed.some(Boolean)).toBe(false);
  }, budget(60_000));

  it('a dead end nosed against the truck still starts a back-out', () => {
    const w = ordered({ kind: 'through', dest: { x: 60, y: 30 } });
    for (let y = 26; y <= 34; y += 1) w.obstacles = [...w.obstacles, { id: `end${y}`, pos: { x: 33.5, y }, r: 0.7, kind: 'rock' }];
    for (let x = 27; x <= 33; x += 1) w.obstacles = [...w.obstacles, { id: `left${x}`, pos: { x, y: 26 }, r: 0.7, kind: 'rock' }, { id: `right${x}`, pos: { x, y: 34 }, r: 0.7, kind: 'rock' }];
    const xs = [me(w).pos.x];
    turns(w, 6, (next) => xs.push(me(next).pos.x));
    expect(xs.some((x, i) => i > 0 && x < xs[i - 1] - 1)).toBe(true);
  }, budget(60_000));
});
