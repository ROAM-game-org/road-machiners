import { beforeAll, describe, expect, it } from 'vitest';
import { makeVehicle } from '../sim/factory';
import { emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { endTurn, setMoveOrder } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const START = { x: 40, y: 40 };
const BEHIND = { x: 34, y: 40 };

function jeepFacingAway(): World {
  const w = emptyWorld(START);
  const jeep = makeVehicle(w, { faction: 'player', chassisId: 'jeep', parts: [{ defId: 'stockEngine', wear: 0 }], spares: [], cargo: {}, pos: START, heading: 0, brain: null });
  w.vehicles[0] = { ...jeep, id: w.vehicles[0].id };
  w.player.fuel = 999;
  return setMoveOrder(w, { kind: 'stopAt', dest: BEHIND });
}

function distancesToGoal(start: World, turns: number): number[] {
  let w = start;
  let d: Drive = buildDrive(w);
  const out: number[] = [];
  for (let i = 0; i < turns; i++) {
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
    freeDrive(d);
    d = next!;
    const p = w.vehicles[0].pos;
    out.push(Math.hypot(p.x - BEHIND.x, p.y - BEHIND.y));
    if (w.events.some((e) => e.kind === 'stall')) throw new Error(`the jeep stalled on turn ${i + 1}`);
  }
  freeDrive(d);
  return out;
}

describe('the jeep on its Type 82 wheelbase', () => {
  it('turns round in open ground and reaches a point six tiles behind it', () => {
    const left = distancesToGoal(jeepFacingAway(), 8);
    expect(Math.min(...left)).toBeLessThan(1.5);
  }, 120_000);
});
