import { beforeAll, describe, expect, it } from 'vitest';
import { chassisTopSpeed } from '../sim/chassis-features';
import { makeVehicle } from '../sim/factory';
import { mountedParts } from '../sim/grid';
import { emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { endTurn, setMoveOrder } from '../sim/world';
import { budget } from '../test/budget';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const START = { x: 40, y: 40 };
const AHEAD = 4;
const AROUND = 4;

function driven(chassisId: string): { w: World; fastest: number } {
  let w = emptyWorld(START);
  const truck = makeVehicle(w, { faction: 'player', chassisId, parts: [{ defId: 'stockEngine', wear: 0 }], spares: [], cargo: {}, pos: START, heading: 0, brain: null });
  w.vehicles[0] = { ...truck, id: w.vehicles[0].id };
  w.player.fuel = 999;
  let drive: Drive = buildDrive(w);
  let fastest = 0;
  for (let turn = 0; turn < AHEAD + AROUND; turn++) {
    const here = w.vehicles[0].pos;
    const dest = turn < AHEAD ? { x: here.x + 30, y: here.y } : { x: here.x, y: here.y + 30 };
    w = setMoveOrder(w, { kind: 'through', dest });
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(drive, (r) => (next = r.next)));
    freeDrive(drive);
    drive = next!;
    w.player.call = null;
    fastest = Math.max(fastest, w.vehicles[0].speed);
    expect(w.events.some((e) => e.t === 'stall'), `${chassisId} stalled on turn ${turn + 1}`).toBe(false);
  }
  freeDrive(drive);
  return { w, fastest };
}

describe('the fastest chassis', () => {
  it.each(['courier', 'lincoln'])('a %s drives its full speed through a right-angle turn and stays whole', (chassisId) => {
    const { w, fastest } = driven(chassisId);
    const me = w.vehicles[0];
    expect(fastest).toBeGreaterThan(chassisTopSpeed(chassisId) * 0.6);
    expect(Math.sin(me.heading)).toBeGreaterThan(0.5);
    for (const part of mountedParts(me)) expect(part.hp, part.defId).toBeGreaterThan(0);
  }, budget(120_000));
});
