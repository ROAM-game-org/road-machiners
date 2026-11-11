import { beforeAll, describe, expect, it } from 'vitest';
import { makeVehicle } from '../sim/factory';
import { bendField, restBend } from '../sim/rig';
import { groundAt } from '../sim/terrain';
import { editableTerrain, emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { endTurn, setMoveOrder } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, type Drive, type TurnResult } from './drive';
import { noseRise, type Quat, type VehicleFrame } from './frames';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const RUN_UP = 8;
const RISE_FROM = 4;
const TURNS = 3;
const SPEED = 5;
const MIN_AIR_STEPS = 10;
const LEVEL_WITHIN = 8;
const NOSE_DOWN_LIMIT = 5;

type Ridge = { rise: number; fall: number; drop: number };

type Landing = { airSteps: number; pitch: number; slope: number; impact: number };

const DEG = 180 / Math.PI;
const pitchOf = (q: Quat) => Math.asin(Math.max(-1, Math.min(1, noseRise(q)))) * DEG;

function ridgeWorld(chassisId: string, ridge: Ridge): { w: World; x0: number; heightOf: (x: number) => number } {
  const w = emptyWorld();
  const me = w.vehicles[0];
  const x0 = me.pos.x;
  const crest = x0 + RUN_UP;
  const top = (crest - x0 - RISE_FROM) * ridge.rise;
  const heightOf = (x: number) => x < x0 + RISE_FROM ? 0 : x <= crest ? (x - x0 - RISE_FROM) * ridge.rise : Math.max(top - ridge.drop, top - (x - crest) * ridge.fall);
  const t = editableTerrain(w);
  for (let j = 0; j <= t.size; j++) for (let i = 0; i <= t.size; i++) t.heights[j * (t.size + 1) + i] = heightOf(i);
  if (chassisId !== me.chassisId) {
    const parts = [{ defId: 'workhorseDiesel', wear: 0 }];
    const truck = makeVehicle(w, { faction: 'player', chassisId, parts, spares: [], cargo: {}, pos: me.pos, heading: me.heading, brain: null });
    w.vehicles[0] = { ...truck, id: me.id, ...bendField(restBend(chassisId)) };
  }
  w.vehicles[0].speed = SPEED;
  w.vehicles[0].direct = true;
  w.player.fuel = 999;
  return { w: setMoveOrder(w, { kind: 'through', dest: { x: x0 + 45, y: me.pos.y } }), x0, heightOf };
}

function flightOf(chassisId: string, ridge: Ridge, rear: boolean): Landing {
  const { w: start, x0 } = ridgeWorld(chassisId, ridge);
  let w = start;
  let d: Drive = buildDrive(w);
  const frames: VehicleFrame[] = [];
  let impact = 0;
  for (let turn = 0; turn < TURNS; turn++) {
    let res: TurnResult | null = null;
    w = endTurn(w, physicsMove(d, (r) => (res = r)));
    freeDrive(d);
    d = res!.next;
    frames.push(...res!.frames[w.player.vehicleId]);
    impact = Math.max(impact, ...res!.landings.map((l) => l.impact));
  }
  freeDrive(d);
  const grounded = (f: VehicleFrame) => [...f.wheels, ...(f.rear?.wheels ?? [])].some((wh) => wh.ground);
  const unit = (f: VehicleFrame) => (rear && f.rear ? f.rear : f);
  let first = -1;
  let airSteps = 0;
  for (let i = 1; i < frames.length; i++) {
    if (first < 0 && !grounded(frames[i]) && grounded(frames[i - 1]) && frames[i].pos.x / 4 > x0 + RUN_UP - 2) first = i;
    if (first >= 0 && grounded(frames[i])) { airSteps = i - first; if (airSteps >= MIN_AIR_STEPS) { first = i; break; } first = -1; }
  }
  if (first < 0) return { airSteps: 0, pitch: 0, slope: 0, impact };
  const f = unit(frames[first]);
  const x = f.pos.x / 4;
  const y = f.pos.z / 4;
  const slope = Math.atan((groundAt(w.terrain, x + 0.4, y) - groundAt(w.terrain, x - 0.4, y)) / 0.8) * DEG;
  return { airSteps, pitch: pitchOf(f.rot), slope, impact };
}

const CASES: [string, string, Ridge, boolean, number][] = [
  ['scout off a crest onto a 2-tile drop to flat', 'scout', { rise: 0.25, fall: 3, drop: 2 }, false, 18.6],
  ['scout off a symmetric ridge', 'scout', { rise: 0.45, fall: 0.45, drop: 99 }, false, 10.9],
  ['hauler off a crest onto a 2-tile drop to flat', 'hauler', { rise: 0.25, fall: 3, drop: 2 }, false, 18.9],
  ['semi cab off a crest onto a 2-tile drop to flat', 'semi', { rise: 0.25, fall: 3, drop: 2 }, false, 19.8],
  ['semi trailer off a crest onto a 2-tile drop to flat', 'semi', { rise: 0.25, fall: 3, drop: 2 }, true, 19.8],
];

describe('a truck that leaves a ridge at speed', () => {
  for (const [label, chassis, ridge, rear, impactCap] of CASES) {
    it(`${label} lands on its wheels`, () => {
      const l = flightOf(chassis, ridge, rear);
      expect(l.airSteps).toBeGreaterThanOrEqual(MIN_AIR_STEPS);
      expect(Math.abs(l.pitch - l.slope)).toBeLessThanOrEqual(LEVEL_WITHIN);
      expect(l.pitch - l.slope).toBeGreaterThanOrEqual(-NOSE_DOWN_LIMIT);
      expect(l.impact).toBeLessThanOrEqual(impactCap);
    }, 60_000);
  }
});
