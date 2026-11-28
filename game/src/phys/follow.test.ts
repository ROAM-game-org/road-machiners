import { beforeAll, describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { NPC_BEHAVIOR } from '../data/npcs';
import { playerVehicle } from '../sim/damage';
import { followTruck } from '../sim/follow';
import { fallbackFaction } from '../sim/spawn';
import { addVehicle, emptyWorld } from '../sim/testkit';
import type { Vehicle, World } from '../sim/types';
import { dist } from '../sim/vec';
import { refreshVision } from '../sim/vision';
import { endTurn } from '../sim/world';
import { buildDrive, freeDrive, initPhysics, type Drive, type TurnResult } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const TURNS = 30;

type Run = { gaps: number[]; leads: number[]; stalls: number; arrivals: number; w: World };

function trial(startAhead: number): Run {
  let w = emptyWorld({ x: 60, y: 60 });
  const me = playerVehicle(w);
  me.heading = 0;
  w.player.fuel = 999;
  const trader = addVehicle(w, fallbackFaction(NPCS.convoy), 'hauler', ['mg', 'workhorseDiesel', 'haulingRack'], { x: me.pos.x + startAhead, y: me.pos.y });
  trader.heading = 0;
  trader.speed = 0;
  refreshVision(w);
  w = followTruck(w, trader.id);
  let drive: Drive = buildDrive(w);
  const gaps: number[] = [];
  const leads: number[] = [];
  let stalls = 0;
  let arrivals = 0;
  for (let turn = 0; turn < TURNS; turn++) {
    const t = w.vehicles.find((v) => v.id === trader.id)!;
    t.order = { kind: 'through', dest: { x: t.pos.x + 40, y: t.pos.y } };
    let result: TurnResult | null = null;
    w = endTurn(w, physicsMove(drive, (next) => (result = next)));
    freeDrive(drive);
    drive = result!.next;
    stalls += w.events.filter((e) => e.t === 'stall').length;
    arrivals += w.events.filter((e) => e.t === 'arrived' && e.vehicle === me.id).length;
    const p = playerVehicle(w);
    const tr = w.vehicles.find((v) => v.id === trader.id) as Vehicle;
    gaps.push(dist(p.pos, tr.pos));
    leads.push(p.pos.x - tr.pos.x);
  }
  freeDrive(drive);
  return { gaps, leads, stalls, arrivals, w };
}

describe('a faster player truck following a slower trader', () => {
  it.each([5, -30])('stays beside or behind the trader when starting %i tiles ahead of it', (startAhead) => {
    const run = trial(startAhead);
    const settled = run.gaps.slice(-10);
    console.info(`start ${startAhead}: gaps ${run.gaps.map((g) => g.toFixed(0)).join(' ')}`);
    expect(run.stalls).toBe(0);
    expect(run.arrivals).toBe(0);
    expect(Math.max(...settled)).toBeLessThan(NPC_BEHAVIOR.escortWaitGap);
    expect(Math.max(...run.leads.slice(-10))).toBeLessThan(4);
  });
});
