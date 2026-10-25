import { beforeAll, expect, it } from 'vitest';
import { HOLLOW } from '../data/sunward';
import { playerVehicle } from '../sim/damage';
import { insideCurtain } from '../sim/fortress';
import { hollowBays, hollowReach } from '../sim/hollow-layout';
import { duskTurn, isCavalcadeCar, membersOf, rideOutTurn } from '../sim/sunward';
import { addVehicle } from '../sim/testkit';
import type { Vec } from '../sim/vec';
import { dist } from '../sim/vec';
import { endTurn } from '../sim/world';
import { standardWorld } from '../test/world-cache';
import { budget } from '../test/budget';
import { buildDrive, freeDrive, initPhysics, type Drive, type TurnResult } from './drive';
import { physicsMove } from './turn';
import type { World } from '../sim/types';

beforeAll(async () => {
  await initPhysics();
});

function towardGate(distance: number): Vec {
  const gate = HOLLOW.site.gates[0];
  const out = { x: (gate.x - HOLLOW.pos.x) / HOLLOW.radius, y: (gate.y - HOLLOW.pos.y) / HOLLOW.radius };
  return { x: HOLLOW.pos.x + out.x * distance, y: HOLLOW.pos.y + out.y * distance };
}

function farScene(turn: number): World {
  const w = standardWorld(5);
  const me = playerVehicle(w);
  w.vehicles = [me, ...membersOf(w)];
  me.pos = { x: HOLLOW.pos.x + 60, y: HOLLOW.pos.y - 60 };
  me.speed = 0;
  me.order = null;
  w.turn = turn;
  w.events = [];
  return w;
}

function run(world: World, turns: number, each: (w: World, turn: number) => void): World {
  let w = world;
  let drive: Drive = buildDrive(w);
  for (let turn = 0; turn < turns; turn++) {
    let result: TurnResult | null = null;
    w = endTurn(w, physicsMove(drive, (next) => (result = next)));
    freeDrive(drive);
    drive = result!.next;
    each(w, turn);
  }
  freeDrive(drive);
  return w;
}

it('stops a stranger driving at the shut gatehouse outside the curtain', () => {
  const w = farScene(duskTurn(2) - 400);
  w.vehicles = [playerVehicle(w)];
  const stranger = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], towardGate(hollowReach()), Math.atan2(HOLLOW.pos.y - HOLLOW.site.gates[0].y, HOLLOW.pos.x - HOLLOW.site.gates[0].x));
  stranger.order = { kind: 'through', dest: { ...HOLLOW.pos } };
  let everInside = false;
  run(w, 14, (next) => {
    const me = next.vehicles.find((v) => v.id === stranger.id)!;
    if (insideCurtain(HOLLOW.site, me.pos)) everInside = true;
  });
  expect(everInside).toBe(false);
}, budget(300_000));

it('pulls the Cavalcade out of its bays in gate order at ride-out, with no stall', () => {
  const out = rideOutTurn(duskTurn(1));
  const w = farScene(out - 2);
  const bays = hollowBays();
  const firstGone = new Map<string, number>();
  let stalls = 0;
  run(w, 60, (next, turn) => {
    stalls += next.events.filter((e) => e.t === 'stall').length;
    for (const car of membersOf(next).filter(isCavalcadeCar)) {
      const home = bays.find((b) => dist(b, car.brain!.home) < 0.5)!;
      if (!firstGone.has(car.id) && dist(car.pos, home) > 6) firstGone.set(car.id, turn);
    }
  });
  expect(stalls).toBe(0);
  const order = [...firstGone.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  const rank = (id: string) => bays.findIndex((b) => dist(b, membersOf(w).find((v) => v.id === id)!.brain!.home) < 0.5);
  expect(order.length).toBeGreaterThanOrEqual(6);
  expect(order.map(rank)).toEqual([...order.map(rank)].sort((a, b) => a - b));
}, budget(600_000));
