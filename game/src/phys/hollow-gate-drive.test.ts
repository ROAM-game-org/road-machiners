import { beforeAll, expect, it } from 'vitest';
import { HOLLOW } from '../data/sunward';
import { playerVehicle } from '../sim/damage';
import { insideCurtain } from '../sim/fortress';
import { hollowGatePose, hollowGateShut } from '../sim/hollow-gate';
import { fillHollow } from '../sim/spawn';
import { duskTurn, hollowBays, membersOf } from '../sim/sunward';
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

function at(along: number, across: number = 0): Vec {
  const { yaw } = hollowGatePose();
  return { x: HOLLOW.pos.x + Math.cos(yaw) * along - Math.sin(yaw) * across, y: HOLLOW.pos.y + Math.sin(yaw) * along + Math.cos(yaw) * across };
}

function sceneWith(turn: number): World {
  const w = standardWorld(5);
  w.vehicles = [playerVehicle(w)];
  playerVehicle(w).pos = at(40, 22);
  playerVehicle(w).speed = 0;
  playerVehicle(w).order = null;
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

it('stops a stranger driving at the shut gate in front of the leaf', () => {
  const w = sceneWith(duskTurn(1) - 100);
  const stranger = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], at(20), hollowGatePose().yaw + Math.PI);
  stranger.order = { kind: 'through', dest: hollowBays()[3] };
  let everInside = false;
  run(w, 14, (next) => {
    const me = next.vehicles.find((v) => v.id === stranger.id)!;
    if (insideCurtain(HOLLOW.site, me.pos)) everInside = true;
    expect(hollowGateShut(next)).toBe(true);
  });
  expect(everInside).toBe(false);
}, budget(300_000));

it('files the whole column out at dusk with no stall, shutting the gate behind it', () => {
  const w = sceneWith(duskTurn(1) - 2);
  fillHollow(w);
  let stalls = 0;
  let opened = false;
  let shutAgain = false;
  let farthest = 0;
  const end = run(w, 70, (next) => {
    stalls += next.events.filter((e) => e.t === 'stall').length;
    if (!hollowGateShut(next)) opened = true;
    else if (opened) shutAgain = true;
    for (const car of membersOf(next)) farthest = Math.max(farthest, dist(car.pos, HOLLOW.pos));
  });
  expect(membersOf(end).length).toBeGreaterThan(0);
  expect(stalls).toBe(0);
  expect(opened).toBe(true);
  expect(shutAgain).toBe(true);
  expect(farthest).toBeGreaterThan(HOLLOW.radius + 10);
}, budget(900_000));
