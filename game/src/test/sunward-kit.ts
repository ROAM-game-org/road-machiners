import { HOLLOW, SUNWARD } from '../data/sunward';
import { REGION } from '../data/region';
import { NPCS } from '../data/npcs';
import { playerVehicle } from '../sim/damage';
import { advanceFar } from '../sim/far';
import { setHeadless } from '../sim/fidelity';
import { getResources } from '../sim/resources';
import { spawnNpcs } from '../sim/spawn';
import { dawnAfter, duskTurn, membersOf, orderDusk, phaseAt, rideOutTurn } from '../sim/sunward';
import { testDrive } from '../sim/testkit';
import { everyTruck, leaveSite } from '../sim/sites';
import { hollowPad } from '../sim/hollow-layout';
import type { Vehicle, World } from '../sim/types';
import type { Vec } from '../sim/vec';
import { expect } from 'vitest';
import { refreshVision } from '../sim/vision';
import { endTurn } from '../sim/world';
import { reusedWorld, standardWorld } from './world-cache';

export function quietWorld(seed: number): World {
  const w = standardWorld(seed);
  const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
  w.vehicles = [playerVehicle(w)];
  w.sheltered = [];
  playerVehicle(w).pos = { x: bowl.pos.x + bowl.radius + 6, y: bowl.pos.y };
  refreshVision(w);
  w.events = [];
  return w;
}

export const seen = { stalls: 0, broken: new Set<string>() };

export function runTo(w: World, turn: number): World {
  let world = w;
  while (world.turn < turn) {
    world = endTurn(world, testDrive);
    keepMembersUnhurt(world);
    seen.stalls += world.events.filter((e) => e.t === 'stall').length;
    for (const e of world.events) if (e.t === 'breakdown') seen.broken.add(e.vehicle);
  }
  return world;
}

function keepMembersUnhurt(w: World): void {
  for (const v of membersOf(w)) getResources(w, v).health = 100;
}

export function runFarTo(w: World, turn: number, onTurn: (w: World) => void): World {
  let world = w;
  setHeadless(true);
  try {
    while (world.turn < turn) {
      world = endTurn(world, (x) => {
        for (const v of x.vehicles) advanceFar(x, v);
      });
      seen.stalls += world.events.filter((e) => e.t === 'stall').length;
      for (const e of world.events) if (e.t === 'breakdown') seen.broken.add(e.vehicle);
      onTurn(world);
    }
  } finally {
    setHeadless(false);
  }
  return world;
}

export function fillHollowByDay(w: World): void {
  for (let i = 0; i < 800 && membersOf(w).length < SUNWARD.cavalcade + SUNWARD.hunters; i++) {
    w.turn = phaseAt(w.turn + 1) === 'rest' ? w.turn + 1 : dawnAfter(orderDusk(w.turn + 1));
    spawnNpcs(w);
  }
}

export function orderWorld(seed: number): World {
  return reusedWorld(`order ${seed}`, () => builtOrderWorld(seed));
}

function builtOrderWorld(seed: number): World {
  const w = quietWorld(seed);
  fillHollowByDay(w);
  w.vehicles = w.vehicles.filter((v) => v.id === w.player.vehicleId || membersOf(w).includes(v));
  for (const tpl of Object.values(NPCS)) if (tpl.spawn.kind !== 'hollow') w.spawnTimer[tpl.id] = Number.MAX_SAFE_INTEGER;
  w.turn = rideOutTurn(duskTurn(1)) - 3;
  w.events = [];
  return w;
}

export function watchedFromTheGate(w: World): World {
  const gate = HOLLOW.site.gates[0];
  const out = { x: (gate.x - HOLLOW.pos.x) / HOLLOW.radius, y: (gate.y - HOLLOW.pos.y) / HOLLOW.radius };
  playerVehicle(w).pos = { x: gate.x - out.y * 30, y: gate.y + out.x * 30 };
  playerVehicle(w).trail = [];
  refreshVision(w);
  return w;
}

export function beyondPad(by: number): Vec {
  const pad = hollowPad();
  const a = Math.atan2(pad.y - HOLLOW.pos.y, pad.x - HOLLOW.pos.x);
  return { x: pad.x + Math.cos(a) * by, y: pad.y + Math.sin(a) * by };
}

export function riderAt(w: World, id: string): Vehicle {
  const v = everyTruck(w).find((x) => x.id === id);
  if (!v) throw new Error(`No rider ${id}`);
  return v;
}

export function letOut(w: World, id: string): Vehicle {
  w.events = [];
  expect(leaveSite(w, id)).toBe(true);
  return riderAt(w, id);
}
