import { beforeAll, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { partDef } from '../data/parts';
import { makePart } from '../sim/factory';
import { mountPart } from '../sim/inventory';
import { highwayMap } from '../sim/highway';
import { defaultSetup } from '../sim/settings';
import type { World } from '../sim/types';
import { endTurn, newWorld, setMoveOrder } from '../sim/world';
import { budget } from '../test/budget';
import { bodyState, buildDrive, freeDrive, initPhysics, type Drive, type TurnResult } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const SEED = 66;
const RAMP_WINDOW = 2;
const FITTED = ['mg', 'slugCannon', 'slugCannon', 'plowRam', 'heavyDiesel'];
const LIP_POSE = {
  at: { x: 830.9, y: 6.46, z: 1169.73 },
  turn: { x: -0.0867, y: 0.8774, z: -0.3816, w: 0.2775 },
  backedFrom: { x: 209.04, y: 292.81 },
};
const DEST = { x: 212, y: 262 };
const TURNS = 20;

function scoutOnRampLip(): World {
  const w = newWorld(SEED, START_KITS.arrival, highwayMap(SEED, 0), defaultSetup('chaosHighway'));
  w.terrain = highwayMap(SEED, RAMP_WINDOW).terrain;
  w.obstacles = [];
  w.chaosHighway!.groups = [];
  w.player.fuel = 999;
  const me = w.vehicles[0];
  me.items = me.items.filter((i) => i.kind === 'part' && partDef(i.part.defId).kind === 'core');
  for (const defId of FITTED) if (!mountPart(w, me, makePart(w, defId, 0))) throw new Error(`The scout has no free mount for ${defId}`);
  me.pos = { x: LIP_POSE.at.x / 4, y: LIP_POSE.at.z / 4 };
  me.heading = Math.atan2(2 * LIP_POSE.turn.y * LIP_POSE.turn.w, 1 - 2 * LIP_POSE.turn.y * LIP_POSE.turn.y);
  me.speed = 0;
  me.direct = true;
  return setMoveOrder(w, { kind: 'through', dest: DEST });
}

function restOnLip(d: Drive, w: World): void {
  const id = w.vehicles[0].id;
  const body = d.world.getRigidBody(d.bodies[id]);
  body.setTranslation(LIP_POSE.at, true);
  body.setRotation(LIP_POSE.turn, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  d.memory[id].reverse = true;
  d.memory[id].backFrom = { ...LIP_POSE.backedFrom };
}

it('a truck nosed over the high end of a ramp, backing with no motion, rocks forward and drives on', () => {
  let w = scoutOnRampLip();
  const id = w.vehicles[0].id;
  let d = buildDrive(w);
  restOnLip(d, w);
  const start = { ...w.vehicles[0].pos };
  let upright = true;
  for (let i = 0; i < TURNS; i++) {
    let r: TurnResult | null = null;
    w = endTurn(w, physicsMove(d, (x) => (r = x)));
    freeDrive(d);
    d = r!.next;
    upright &&= bodyState(d, id).upright;
  }
  freeDrive(d);
  const gone = start.y - w.vehicles[0].pos.y;

  expect(upright).toBe(true);
  expect(gone).toBeGreaterThan(20);
}, budget(120_000));
