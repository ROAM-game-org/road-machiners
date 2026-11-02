import { beforeAll, expect, it } from 'vitest';
import { HOLLOW } from '../data/sunward';
import { playerVehicle } from '../sim/damage';
import { insideCurtain } from '../sim/fortress';
import { hollowReach } from '../sim/hollow-layout';
import { duskTurn, gateOrder, rideOutTurn, sunwardFacts } from '../sim/sunward';
import { requireTruck } from '../sim/sites';
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
  w.vehicles = [me];
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

it('lets the Cavalcade out of the pad in gate order at ride-out and drives each car clear of the Hollow, with no stall', () => {
  const out = rideOutTurn(duskTurn(1));
  const w = farScene(out - 2);
  const left: string[] = [];
  let stalls = 0;
  const last = run(w, 60, (next) => {
    stalls += next.events.filter((e) => e.t === 'stall').length;
    for (const e of next.events) if (e.t === 'leftSite') left.push(e.vehicle);
  });
  expect(stalls).toBe(0);
  expect(left.length).toBeGreaterThanOrEqual(6);
  const night = sunwardFacts(last).night!;
  expect(left).toEqual([...gateOrder(last, night), ...(night.hunt?.party ?? [])].slice(0, left.length));
  for (const id of left.slice(0, -1)) expect(dist(requireTruck(last, id).pos, HOLLOW.pos)).toBeGreaterThan(hollowReach());
}, budget(600_000));
