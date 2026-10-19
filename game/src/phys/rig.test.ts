import { beforeAll, describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { couplingOf } from '../sim/body';
import { makeVehicle } from '../sim/factory';
import { bendField, lengthOf, restBend, rigBoxes, unitPoses, type RigBox } from '../sim/rig';
import { hangUp } from '../sim/dialogue';
import type { MoveOrder, Obstacle, Vehicle, World } from '../sim/types';
import { dist, type Vec } from '../sim/vec';
import { endTurn, newWorld, setMoveOrder } from '../sim/world';
import { NPCS } from '../data/npcs';
import { REGION } from '../data/region';
import { START_KITS } from '../data/start';
import { addGoods } from '../sim/inventory';
import { defaultSetup } from '../sim/settings';
import { canUseSite, parkedOn } from '../sim/sites';
import { addVehicle, emptyWorld, npcBrain } from '../sim/testkit';
import { TEST_MAP } from '../test/map';
import { budget } from '../test/budget';
import { buildDrive, captureDrive, freeDrive, initPhysics, restoreDrive, simulateTurn, type Drive, type TurnResult } from './drive';
import { frameBend, headingOf, toMap } from './frames';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const RIG = 'semi';
const coupling = couplingOf(RIG)!;

function rigWorld(pos: Vec, heading: number, speed = 0, bend?: number, chassisId = RIG): World {
  const w = emptyWorld(pos);
  const me = w.vehicles[0];
  const rig = makeVehicle(w, { faction: 'player', chassisId, parts: [{ defId: 'workhorseDiesel', wear: 0 }], spares: [], cargo: {}, pos, heading, brain: null });
  w.vehicles[0] = { ...rig, id: me.id, speed, ...bendField(bend ?? restBend(chassisId)) };
  w.player.fuel = 999;
  return w;
}

type Run = { w: World; results: TurnResult[] };

function play(start: World, turns: number, order: MoveOrder | null, direct = false): Run {
  let w = order ? setMoveOrder(start, order) : start;
  w.vehicles[0].direct = direct;
  let d: Drive = buildDrive(w);
  const results: TurnResult[] = [];
  for (let i = 0; i < turns; i++) {
    let res: TurnResult | null = null;
    w = endTurn(w, physicsMove(d, (r) => (res = r)));
    freeDrive(d);
    d = res!.next;
    results.push(res!);
    if (!w.vehicles[0].order) break;
  }
  freeDrive(d);
  return { w, results };
}

function bendsOf(run: Run, id: string): number[] {
  return run.results.flatMap((r) => r.frames[id].map((f) => frameBend(f)!));
}

function posesOf(run: Run, id: string): Vehicle[] {
  const me = run.w.vehicles.find((v) => v.id === id)!;
  return run.results.flatMap((r) => r.frames[id].map((f) => ({ ...me, pos: toMap(f.pos), heading: headingOf(f.rot), bend: frameBend(f) })));
}

function boxGap(box: RigBox, p: Vec): number {
  const dx = p.x - box.center.x;
  const dy = p.y - box.center.y;
  const along = Math.abs(dx * box.axis.x + dy * box.axis.y) - box.half.x;
  const across = Math.abs(-dx * box.axis.y + dy * box.axis.x) - box.half.y;
  return Math.hypot(Math.max(0, along), Math.max(0, across));
}

describe('a rig drives as two bodies on a pivot', () => {
  it('IV3: a rock that only the trailer sweeps in a right-angle turn is hit by a trailer lane, and the tractor passes clear of it', () => {
    const start = { x: 40, y: 40 };
    const order: MoveOrder = { kind: 'stopAt', dest: { x: 46, y: 58 } };
    const clean = play(rigWorld(start, 0, 3), 6, order, true);
    const id = clean.w.vehicles[0].id;
    const poses = posesOf(clean, id);
    const fronts = poses.map((p) => rigBoxes(p)[0]);
    const inner = poses.flatMap((p) => {
      const trailer = rigBoxes(p)[1];
      return [-1, 1].flatMap((side) => [-0.8, -0.6, -0.4, -0.2, 0, 0.2].map((share) => {
        const along = trailer.half.x * share;
        const across = (trailer.half.y - 0.1) * side;
        return { x: trailer.center.x + trailer.axis.x * along - trailer.axis.y * across, y: trailer.center.y + trailer.axis.y * along + trailer.axis.x * across };
      }));
    });
    const spot = inner.reduce((best, p) => (Math.min(...fronts.map((b) => boxGap(b, p))) > Math.min(...fronts.map((b) => boxGap(b, best))) ? p : best));
    const rock: Obstacle = { id: 'rock1', pos: spot, r: 0.3, kind: 'rock' };
    expect(Math.min(...fronts.map((b) => boxGap(b, spot)))).toBeGreaterThan(rock.r + 0.3);

    const world = rigWorld(start, 0, 3);
    world.obstacles = [rock];
    const hit = play(world, 6, order, true);
    const crashes = hit.results.flatMap((r) => r.crashes).filter((c) => c.a === id && c.b === rock.id);
    expect(crashes.length).toBeGreaterThan(0);
    for (const c of crashes) {
      expect(['left', 'right']).toContain(c.contact.a.side);
      expect(Math.min(...c.contact.a.lanes)).toBeGreaterThanOrEqual(CHASSIS[RIG].coupling!.row);
    }
  }, budget(120_000));

  it('bends the trailer in a lane change and lines it up again after', () => {
    const run = play(rigWorld({ x: 30, y: 40 }, 0, 4), 12, { kind: 'stopAt', dest: { x: 75, y: 42.5 } });
    const bends = bendsOf(run, run.w.vehicles[0].id);
    expect(Math.max(...bends.map(Math.abs))).toBeGreaterThan(0.02);
    expect(Math.abs(bends[bends.length - 1])).toBeLessThan(0.02);
    expect(Math.max(...bends.map(Math.abs))).toBeLessThanOrEqual(coupling.bendLimit + coupling.bendTolerance);
  }, budget(120_000));

  it('writes the bend of the bodies back to the truck, inside the limit', () => {
    const run = play(rigWorld({ x: 30, y: 40 }, 0, 3), 1, { kind: 'stopAt', dest: { x: 38, y: 52 } }, true);
    const me = run.w.vehicles[0];
    const last = run.results.at(-1)!.frames[me.id].at(-1)!;
    expect(me.bend).toBeCloseTo(frameBend(last)!, 6);
    expect(Math.abs(me.bend!)).toBeGreaterThan(0.05);
    expect(dist(unitPoses(me)[1].pos, toMap(last.rear!.pos))).toBeLessThan(0.05);
  }, budget(120_000));

  it('restores a bent rig from a snapshot and plays the same turn after it', () => {
    let w = setMoveOrder(rigWorld({ x: 30, y: 40 }, 0, 3), { kind: 'stopAt', dest: { x: 40, y: 54 } });
    w.vehicles[0].direct = true;
    const d = buildDrive(w);
    let res: TurnResult | null = null;
    w = endTurn(w, physicsMove(d, (r) => (res = r)));
    freeDrive(d);
    const bent = res!.next;
    const copy = restoreDrive(captureDrive(bent));
    const a = simulateTurn(bent, w);
    const b = simulateTurn(copy, w);
    const id = w.vehicles[0].id;
    expect(Math.abs(frameBend(a.frames[id].at(-1)!)!)).toBeGreaterThan(0.01);
    expect(b.frames[id].at(-1)).toEqual(a.frames[id].at(-1));
    for (const drive of [bent, copy, a.next, b.next]) freeDrive(drive);
  }, budget(120_000));

  it('backs a bent rig a short leg straight behind it without folding further', () => {
    const run = play(rigWorld({ x: 40, y: 40 }, 0, 0, 0.25), 6, { kind: 'stopAt', dest: { x: 38, y: 40 } });
    const bends = bendsOf(run, run.w.vehicles[0].id);
    expect(Math.max(...bends.map(Math.abs))).toBeLessThan(0.4);
    expect(dist(run.w.vehicles[0].pos, { x: 38, y: 40 })).toBeLessThan(1);
  }, budget(120_000));

  it('turns the sorokonoga on a full-lock circle no wider than the longbed, though the sorokonoga is the longer truck', () => {
    const circle = (chassisId: string) => {
      const run = play(rigWorld({ x: 60, y: 40 }, 0, 2, undefined, chassisId), 4, { kind: 'through', dest: { x: 30, y: 40.5 } }, true);
      const path = run.results.flatMap((r) => r.frames[run.w.vehicles[0].id].map((f) => toMap(f.pos)));
      return Math.max(...path.map((p) => Math.abs(p.y - 40)));
    };
    expect(lengthOf('sorokonoga')).toBeGreaterThan(lengthOf('longbed'));
    expect(circle('sorokonoga')).toBeLessThanOrEqual(circle('longbed'));
  }, budget(240_000));

  it('drives a trader in a sorokonoga onto a town pad, parks it there and drives it off again with no stall', () => {
    let w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    w.vehicles = w.vehicles.filter((v) => v.faction === 'player');
    for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
    const [bowl] = REGION.towns;
    w.vehicles[0].pos = { x: bowl.pos.x + bowl.radius + 3, y: bowl.pos.y + 8 };
    const trader = addVehicle(w, 'independent', 'sorokonoga', ['mg', 'stockEngine'], { x: bowl.pos.x + bowl.radius + 14, y: bowl.pos.y }, Math.PI);
    trader.brain = npcBrain('trader', trader.pos, ['trader']);
    addGoods(w, trader, 'scrap', 1);
    trader.brain.goals = [{ kind: 'sell', targetId: bowl.id, destination: { ...bowl.pos }, phase: 'travel', reason: 'deliverCargo' }];
    let d: Drive = buildDrive(w);
    let parkedAt: number | null = null;
    let leftAt: number | null = null;
    const stalls: string[] = [];
    for (let turn = 0; turn < 60 && leftAt === null; turn++) {
      let res: TurnResult | null = null;
      if (w.player.call) w = hangUp(w);
      w = endTurn(w, physicsMove(d, (r) => (res = r)));
      freeDrive(d);
      d = res!.next;
      stalls.push(...w.events.filter((e) => e.t === 'stall' && e.vehicle === trader.id).map((e) => e.t));
      const rig = w.vehicles.find((v) => v.id === trader.id)!;
      if (parkedAt === null && parkedOn(rig, bowl)) parkedAt = turn;
      if (parkedAt !== null && !canUseSite(rig.pos, bowl)) leftAt = turn;
    }
    freeDrive(d);
    expect(parkedAt).not.toBeNull();
    expect(leftAt).not.toBeNull();
    expect(stalls).toEqual([]);
  }, budget(600_000));
});
