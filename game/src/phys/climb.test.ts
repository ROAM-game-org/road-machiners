
import { beforeAll, describe, expect, it } from 'vitest';
import { PHYSICS } from '../data/physics';
import { RULES } from '../data/rules';
import type { TerrainTypeId } from '../data/terrain';
import { makeVehicle } from '../sim/factory';
import { addGoods } from '../sim/inventory';
import { climbGrade } from '../sim/stats';
import { editableTerrain, emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { endTurn, setMoveOrder } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const RAMP_FOOT = 28;

type Build = 'scout' | 'loadedHauler';

function ramp(build: Build, grade: number, type: TerrainTypeId): World {
  const w = emptyWorld({ x: 26, y: 30 });
  const t = editableTerrain(w);
  const n = t.size;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) t.heights[j * (n + 1) + i] = Math.max(0, i - RAMP_FOOT) * grade;
  t.types.fill(type);
  if (build === 'loadedHauler') {
    const hauler = makeVehicle(w, { faction: 'player', chassisId: 'hauler', parts: ['mg', 'stockEngine', 'plates', 'trailerBox'].map((defId) => ({ defId, wear: 0 })), spares: [], cargo: {}, pos: { x: 26, y: 30 }, heading: 0, brain: null });
    w.vehicles[0] = { ...hauler, id: w.vehicles[0].id };
    addGoods(w, w.vehicles[0], 'scrap', 122);
  }
  w.player.fuel = 999;
  return setMoveOrder(w, { kind: 'through', dest: { x: 120, y: 30 } });
}

function drive(start: World, turns: number): number[] {
  let w = start;
  let d: Drive = buildDrive(w);
  const xs: number[] = [];
  for (let i = 0; i < turns; i++) {
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
    freeDrive(d);
    d = next!;
    xs.push(w.vehicles[0].pos.x);
  }
  freeDrive(d);
  return xs;
}

const climbTiles = (build: Build, grade: number, type: TerrainTypeId = 'road') => drive(ramp(build, grade, type), 8)[7] - RAMP_FOOT;

describe('climbing', () => {
  it('a loaded hauler keeps climbing a grade it stalled on before the climb reserve', () => {
    expect(climbTiles('loadedHauler', 0.35)).toBeGreaterThan(3);
  }, 90_000);

  it.each(['scout', 'loadedHauler'] as const)('a %s climbs a ramp at its planned climb grade', (build) => {
    expect(climbTiles(build, climbGrade(ramp(build, 0, 'road'), ramp(build, 0, 'road').vehicles[0]))).toBeGreaterThan(1);
  }, 90_000);

  it.each(['scout', 'loadedHauler'] as const)('a %s stops on a ramp a third steeper in sine than the grade it plans for', (build) => {
    const w = ramp(build, 0, 'road');
    const grade = climbGrade(w, w.vehicles[0]);
    const sine = Math.sin(Math.atan(grade)) / PHYSICS.truck.climbPlanShare;
    expect(climbTiles(build, Math.tan(Math.asin(Math.min(0.99, 1.35 * sine))))).toBeLessThan(1);
  }, 90_000);

  it('flat ground launch from rest is pinned', () => {
    const xs = drive(ramp('scout', 0, 'road'), 3);
    expect(xs[0]).toBeCloseTo(26.741777, 5);
    expect(xs[1]).toBeCloseTo(28.652092, 5);
    expect(xs[2]).toBeCloseTo(31.714813, 5);
  }, 90_000);

  it('a launch from rest gains about 85% of the distance it did at the old acceleration scale', () => {
    const rules = RULES as { accelScale: number };
    const scale = rules.accelScale;
    const now = drive(ramp('scout', 0, 'road'), 3);
    let old: number[];
    try {
      rules.accelScale = scale / 0.85;
      old = drive(ramp('scout', 0, 'road'), 3);
    } finally {
      rules.accelScale = scale;
    }
    const ratio = (now[2] - 26) / (old[2] - 26);
    expect(ratio).toBeGreaterThan(0.82);
    expect(ratio).toBeLessThan(0.88);
  }, 90_000);
});
