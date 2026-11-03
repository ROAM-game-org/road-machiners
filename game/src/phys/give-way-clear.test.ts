import { beforeAll, describe, expect, it } from 'vitest';
import { RULES } from '../data/rules';
import { yieldsToTraffic } from '../sim/ai';
import { addState } from '../sim/states';
import { vehicleStats } from '../sim/stats';
import { addVehicle, emptyWorld, npcBrain } from '../sim/testkit';
import type { Vehicle, World } from '../sim/types';
import { dist } from '../sim/vec';
import { endTurn } from '../sim/world';
import { budget } from '../test/budget';
import { buildDrive, freeDrive, initPhysics, type Drive, type TurnResult } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

type Seen = { crashes: string[]; gaps: number[]; yielded: boolean };

function play(start: World, turns: number, pairs: [string, string][]): Seen {
  let w = start;
  let d: Drive = buildDrive(w);
  const seen: Seen = { crashes: [], gaps: [], yielded: false };
  for (let i = 0; i < turns; i++) {
    seen.yielded ||= yieldsToTraffic(w, w.vehicles[0]);
    let res: TurnResult | null = null;
    w = endTurn(w, physicsMove(d, (r) => (res = r)));
    freeDrive(d);
    d = res!.next;
    for (const c of res!.crashes) {
      if (c.impact < RULES.collisionMinImpact) continue;
      if (pairs.some(([a, b]) => (c.a === a && c.b === b) || (c.a === b && c.b === a))) seen.crashes.push(`${c.a}-${c.b}@${i}`);
    }
    for (const [a, b] of pairs) {
      const va = w.vehicles.find((v) => v.id === a)!;
      const vb = w.vehicles.find((v) => v.id === b)!;
      seen.gaps.push(dist(va.pos, vb.pos) - vehicleStats(w, va).radius - vehicleStats(w, vb).radius);
    }
  }
  freeDrive(d);
  return seen;
}

function walls(w: World, from: number, to: number): void {
  for (let x = from; x <= to; x++) {
    w.obstacles = [...w.obstacles, { id: `n${x}`, kind: 'rock', pos: { x, y: 97 }, r: 1 }, { id: `s${x}`, kind: 'rock', pos: { x, y: 103 }, r: 1 }];
  }
}

function pocket(w: World): void {
  walls(w, 92, 112);
  for (let y = 98; y <= 102; y++) w.obstacles = [...w.obstacles, { id: `end${y}`, kind: 'rock', pos: { x: 91, y }, r: 1 }];
}

function hauler(w: World, chassis: string, x: number, heading: number, dest: number): Vehicle {
  const v = addVehicle(w, 'independent', chassis, chassis === 'semi' ? ['stockEngine'] : ['mg', 'stockEngine'], { x, y: 100 }, heading);
  v.brain = npcBrain('trader', v.pos, ['trader']);
  v.speed = 3;
  v.brain.goals.push({ kind: 'explore', targetId: null, destination: { x: dest, y: 100 }, phase: 'travel', reason: 'tripToSite' });
  return v;
}

describe('a truck holding its line meets a giver that brakes', () => {
  it('a tower with a rope client never hits the player braking for it', () => {
    const w = emptyWorld({ x: 101, y: 100 });
    const me = w.vehicles[0];
    me.heading = 0;
    me.speed = 3;
    me.order = { kind: 'through', dest: { x: 150, y: 100 }, pace: 3 };
    pocket(w);
    const bus = hauler(w, 'hauler', 110, Math.PI, 40);
    const client = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { x: 114, y: 100 }, Math.PI);
    client.speed = 3;
    addState(w, 'tow', bus.id, client.id, { kind: 'tow', site: 'bowl', fee: 10, waived: 0, hitched: true });
    const seen = play(w, 8, [[me.id, bus.id], [me.id, client.id]]);
    expect(seen.yielded).toBe(true);
    expect(seen.crashes).toEqual([]);
    expect(Math.min(...seen.gaps)).toBeGreaterThan(0);
  }, budget(90_000));

  it.each(['hauler', 'semi'])('an NPC %s holding its line never hits the NPC that brakes for it', (chassis) => {
    const w = emptyWorld({ x: 30, y: 30 });
    const giver = hauler(w, 'hauler', 100, 0, 150);
    const holder = hauler(w, chassis, 114, Math.PI, 50);
    if (giver.id > holder.id) [giver.id, holder.id] = [holder.id, giver.id];
    walls(w, 90, 140);
    const seen = play(w, 8, [[giver.id, holder.id]]);
    expect(seen.crashes).toEqual([]);
  }, budget(90_000));
});
