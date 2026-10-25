import { beforeAll, describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { SUNWARD } from '../data/sunward';
import { playerVehicle } from '../sim/damage';
import { generateNpcLoadout } from '../sim/npc-loadout';
import { spawnAt } from '../sim/spawn';
import { checkOffering, giveWord, lightZone, offeringOf, wordGap } from '../sim/sunward-crater';
import { duskTurn, sunwardFacts } from '../sim/sunward';
import { endTurn } from '../sim/world';
import { standardWorld } from '../test/world-cache';
import type { Vec } from '../sim/vec';
import type { Vehicle, World } from '../sim/types';
import { buildDrive, freeDrive, initPhysics, type Drive } from './drive';
import { physicsMove } from './turn';

beforeAll(async () => {
  await initPhysics();
});

const REPORT_SPOT = { x: 436, y: 352 };
const TURNS = 40;

function nightWorld(at: Vec): { w: World; me: Vehicle } {
  const w = standardWorld(5);
  w.vehicles = [playerVehicle(w)];
  w.turn = duskTurn(1) + 80;
  sunwardFacts(w).night = { dusk: duskTurn(1), roster: [], beaten: [], calls: {}, hunt: null, shouted: [], offered: [] };
  const me = playerVehicle(w);
  me.pos = { ...at };
  me.trail = [{ ...at, heading: 0 }, { ...at, heading: 0 }];
  const caller = spawnAt(w, NPCS.trader, generateNpcLoadout(w, NPCS.trader), { x: at.x + 200, y: at.y }, 'independent');
  giveWord(w, me, caller);
  return { w, me };
}

function drive(w: World, turns: number, until: (w: World) => boolean): { w: World; held: boolean; worstGap: number } {
  let d: Drive = buildDrive(w);
  let worstGap = 0;
  for (let i = 0; i < turns; i++) {
    let next: Drive | null = null;
    w = endTurn(w, physicsMove(d, (r) => { next = r.next; }));
    freeDrive(d);
    d = next!;
    const state = offeringOf(w, w.player.vehicleId);
    if (!state) {
      freeDrive(d);
      return { w, held: false, worstGap };
    }
    const data = state.data as { closest: number };
    worstGap = Math.max(worstGap, wordGap(w, playerVehicle(w)) - data.closest);
    if (until(w)) break;
  }
  freeDrive(d);
  return { w, held: true, worstGap };
}

describe('the word given at the Fallen Sun, driven with physics', () => {
  it('holds all the way round the ship bow from the spot of report 85', () => {
    const { w, me } = nightWorld(REPORT_SPOT);
    me.order = { kind: 'stopAt', dest: { ...lightZone().pos } };

    const run = drive(w, TURNS, (x) => dist2(playerVehicle(x).pos, lightZone().pos) < SUNWARD.offerMargin);

    expect(run.held).toBe(true);
    expect(run.worstGap).toBeLessThan(SUNWARD.offerMargin);
  });

  it('breaks within six turns from a standstill once the truck drives back toward the rim', () => {
    const { w, me } = nightWorld({ x: lightZone().pos.x, y: lightZone().pos.y + 40 });
    me.order = { kind: 'stopAt', dest: { x: lightZone().pos.x, y: lightZone().pos.y + 140 } };

    const run = drive(w, 6, () => false);

    expect(run.held).toBe(false);
  });

  it('judges a truck at its own gap', () => {
    const { w, me } = nightWorld(REPORT_SPOT);
    const s = offeringOf(w, me.id)!;
    expect(checkOffering(w, s)).toBeNull();
  });
});

function dist2(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
