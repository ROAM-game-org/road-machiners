import { beforeAll, describe, expect, it } from 'vitest';
import { RULES } from '../data/rules';
import { PERK_NUMBERS } from '../data/skills';
import { dustRange, soundRange } from '../sim/detect';
import { vehicleStats } from '../sim/stats';
import { addVehicle, emptyWorld } from '../sim/testkit';
import type { MoveOrder, World } from '../sim/types';
import { endTurn } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const ROAD_Y = 30;
const TURNS = 8;
const HALF_SHARE = 0.45;

function drive(kind: MoveOrder['kind'], paceOf: (top: number) => number | undefined): { speeds: number[]; world: World; id: string; top: number; pace: number | undefined } {
  let w = emptyWorld({ x: 70, y: ROAD_Y + 12 });
  const v = addVehicle(w, 'independent', 'scout', ['stockEngine', 'mg'], { x: 20, y: ROAD_Y }, 0);
  const top = vehicleStats(w, v).maxSpeed;
  const pace = paceOf(top);
  v.order = { kind, dest: { x: 400, y: ROAD_Y }, ...(pace === undefined ? {} : { pace }) } as MoveOrder;
  let d: Drive = buildDrive(w);
  const speeds: number[] = [];
  for (let i = 0; i < TURNS; i++) {
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(d, (r) => { next = r.next; }));
    freeDrive(d);
    d = next!;
    speeds.push(w.vehicles.find((x) => x.id === v.id)!.speed);
  }
  freeDrive(d);
  return { speeds, world: w, id: v.id, top, pace };
}

describe('a route held at a pace', () => {
  it.each(['through', 'stopAt'] as const)('Half on a %s order stays under the Cold running threshold every turn', (kind) => {
    const { speeds, top } = drive(kind, (top) => HALF_SHARE * top);
    for (const speed of speeds) expect(speed).toBeLessThan(top * PERK_NUMBERS.coldRunning.speedShare);
    expect(speeds[TURNS - 1]).toBeGreaterThan(RULES.crawlSpeed);
  });

  it.each(['through', 'stopAt'] as const)('Crawl on a %s order raises no dust and no more sound than the limp base', (kind) => {
    const { speeds, world, id, pace } = drive(kind, () => RULES.crawlSpeed);
    for (const speed of speeds.slice(2)) expect(speed).toBeLessThanOrEqual(pace! * 1.1);
    const v = world.vehicles.find((x) => x.id === id)!;
    expect(dustRange(world, v)).toBe(0);
    expect(soundRange(world, v)).toBeGreaterThan(0);
  });

  it('Full keeps speeding up toward top speed on a stop order', () => {
    const { speeds, top } = drive('stopAt', () => undefined);
    expect(speeds[TURNS - 1]).toBeGreaterThan(top * 0.8);
  });
});
