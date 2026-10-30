import { beforeAll, expect, it } from 'vitest';
import { alongOf, roadPoint, toRoad } from '../sim/highway';
import { groupPrey } from '../sim/combat';
import { haulerOf, playerVehicle } from '../sim/damage';
import { spawnGroup, waveOf } from '../sim/chaos-highway';
import { followMove } from '../sim/progression/escort-brain';
import { vehicleStats } from '../sim/stats';
import { chaosHighwayWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { endTurn, setMoveOrder } from '../sim/world';
import { budget } from '../test/budget';
import { buildDrive, freeDrive, initPhysics, type Drive, type TurnResult } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const TURNS = 40;
const CONTACT_BOUND = 20;
const CHARGE_LEAD = 30;
const ESCAPE_MARGIN = 4;
const ESCAPE_TURNS = 3;

type Gun = 'escort' | 'charge';
type Meeting = { leads: number[]; reach: number; shots: number; stalls: number; beatenAt: number | null };

function alongOfTruck(w: World, id: string): number {
  return alongOf(w.seed, toRoad(w.seed, w.chaosHighway!.window, w.vehicles.find((v) => v.id === id)!.pos));
}

function meetGroup(seed: number, gun: Gun): Meeting {
  let w = chaosHighwayWorld(seed);
  const run = w.chaosHighway!;
  const group = { ...run.groups[0], stretch: 1, from: 'ahead' as const, templates: ['buggy'], level: waveOf(1).level };
  run.groups = [group];
  spawnGroup(w, run, group, alongOf(w.seed, toRoad(w.seed, 0, haulerOf(w).pos)));
  w.player.fuel = 999;
  const hunterId = group.vehicles[0];
  const reach = Math.max(...vehicleStats(w, w.vehicles.find((v) => v.id === hunterId)!).weapons.map((mw) => mw.def.range));
  const meeting: Meeting = { leads: [], reach, shots: 0, stalls: 0, beatenAt: null };
  let drive: Drive = buildDrive(w);
  for (let turn = 0; turn < TURNS && meeting.beatenAt === null && w.player.state === 'active'; turn++) {
    const me = playerVehicle(w);
    const order =
      gun === 'escort'
        ? followMove(w, me, haulerOf(w))
        : { kind: 'through' as const, dest: roadPoint(w.seed, 0, alongOf(w.seed, toRoad(w.seed, 0, me.pos)) + CHARGE_LEAD, 0), pace: vehicleStats(w, me).maxSpeed };
    w = setMoveOrder(w, order);
    let result: TurnResult | null = null;
    w = endTurn(w, physicsMove(drive, (next) => (result = next)));
    freeDrive(drive);
    drive = result!.next;
    meeting.stalls += w.events.filter((e) => e.t === 'stall').length;
    const hunter = w.vehicles.find((v) => v.id === hunterId);
    meeting.shots += w.events.filter((e) => e.t === 'shot' && group.vehicles.includes(e.shooter)).length;
    if (!hunter || hunter.defeat) {
      meeting.beatenAt = turn;
      break;
    }
    meeting.leads.push(alongOfTruck(w, hunterId) - alongOfTruck(w, groupPrey(w, hunter).id));
  }
  freeDrive(drive);
  return meeting;
}

function contactTurn(m: Meeting): number {
  return m.leads.findIndex((lead) => lead <= m.reach);
}

it('brings a group spawned ahead into gun reach of the escorted convoy and keeps it fighting instead of leading the convoy up the road', () => {
  for (const seed of [1, 2, 3]) {
    const m = meetGroup(seed, 'escort');
    const contact = contactTurn(m);
    expect(contact, `seed ${seed} contact`).toBeGreaterThanOrEqual(0);
    expect(contact, `seed ${seed} contact`).toBeLessThanOrEqual(CONTACT_BOUND);
    const outside = m.leads.slice(contact).map((lead) => lead > m.reach + ESCAPE_MARGIN);
    const ranAway = outside.some((_, i) => outside.slice(i, i + ESCAPE_TURNS).length === ESCAPE_TURNS && outside.slice(i, i + ESCAPE_TURNS).every(Boolean));
    expect(ranAway, `seed ${seed} leads ${m.leads.map((l) => l.toFixed(1)).join(' ')} reach ${m.reach}`).toBe(false);
    expect(m.shots, `seed ${seed} shots`).toBeGreaterThan(0);
    expect(m.stalls, `seed ${seed} stalls`).toBe(0);
  }
}, budget(900_000));

it('closes on a group ahead every turn while the gun truck drives at it at full speed', () => {
  const m = meetGroup(3, 'charge');
  const contact = contactTurn(m);
  expect(contact).toBeGreaterThan(0);
  const approach = m.leads.slice(0, contact + 1);
  const shrinking = approach.every((lead, i) => i === 0 || lead < approach[i - 1]);
  expect(shrinking, approach.map((l) => l.toFixed(1)).join(' ')).toBe(true);
  expect(m.stalls).toBe(0);
}, budget(900_000));
