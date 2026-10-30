import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { advanceFar } from './far';
import { freeCells } from './grid';
import { addGoods } from './inventory';
import { remember } from './memory';
import { thinkNpc, topGoal } from './npc-activities';
import { lootTaken } from './npc-decisions';
import { workableSpots } from './loot-picks';
import { canReachSalvage, oldSpotOf } from './salvage';
import { beginSearch } from './search';
import { isFree } from './spawn';
import { vehicleStats } from './stats';
import { refreshVision } from './vision';
import { territoryAt, territorySpots } from './territory';
import { addVehicle, emptyWorld, forceOption, npcBrain } from './testkit';
import type { SalvageStock, Vehicle, World } from './types';
import { dist, type Vec } from './vec';
import { cloneWorld, endTurn } from './world';

const orchard = REGION.locations.find((l) => l.id === 'orchard')!;

function driverIn(at: Vec, template = 'scavenger', traits: Parameters<typeof npcBrain>[2] = ['scavenger'], crates = 1): { w: World; npc: Vehicle } {
  const w = emptyWorld({ x: 50, y: 50 });
  const npc = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { ...at });
  npc.brain = npcBrain(template, npc.pos, traits);
  if (crates > 0) addGoods(w, npc, 'scrap', crates);
  return { w, npc };
}

function nearestSpot(w: World, at: Vec, territoryId = 'orchard'): SalvageStock {
  return territorySpots(w, territoryId).reduce((a, b) => (dist(at, b.pos) < dist(at, a.pos) ? b : a));
}

function parkingSpot(w: World, stock: SalvageStock): Vec {
  const probe = w.vehicles[0];
  const radius = vehicleStats(w, probe).radius;
  for (let r = stock.radius + radius + 0.5; r < stock.radius + 4; r += 0.25)
    for (let k = 0; k < 24; k++) {
      const at = { x: stock.pos.x + Math.cos((k / 24) * 2 * Math.PI) * r, y: stock.pos.y + Math.sin((k / 24) * 2 * Math.PI) * r };
      if (isFree(w, at, radius, null) && canReachSalvage({ ...probe, pos: at, speed: 0 }, stock)) return at;
    }
  throw new Error(`No parking spot beside ${stock.id}`);
}

function strip(w: World, npc: Vehicle, stock: SalvageStock): void {
  remember(w, npc, { kind: 'stripped', stock: stock.id });
}

describe('spot work in a territory', () => {
  it('goes to the nearest Orchard spot with a sellable crate aboard', () => {
    const { w, npc } = driverIn(orchard.pos);
    forceOption('spotWork', 'work');
    const goal = thinkNpc(w, npc);
    const spot = nearestSpot(w, npc.pos);
    expect(goal).toMatchObject({ kind: 'scavenge', targetId: spot.id, reason: 'searchSpot' });
    expect(goal.destination).toEqual(spot.pos);
  });

  it('skips a spot it remembers as stripped', () => {
    const { w, npc } = driverIn(orchard.pos);
    forceOption('spotWork', 'work');
    const first = nearestSpot(w, npc.pos);
    strip(w, npc, first);
    const goal = thinkNpc(w, npc);
    expect(goal.kind).toBe('scavenge');
    expect(goal.targetId).not.toBe(first.id);
    expect(territorySpots(w, 'orchard').some((s) => s.id === goal.targetId)).toBe(true);
  });

  it('skips a spot another truck is searching', () => {
    const { w, npc } = driverIn(orchard.pos);
    forceOption('spotWork', 'work');
    const first = nearestSpot(w, npc.pos);
    const other = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], parkingSpot(w, first));
    other.brain = npcBrain('scavenger', other.pos, ['scavenger']);
    other.speed = 0;
    other.brain.goals = [{ kind: 'scavenge', targetId: first.id, destination: { ...first.pos }, phase: 'act', reason: 'searchSpot' }];
    beginSearch(w, other, first.id);
    refreshVision(w);
    npc.brain!.noticed[`lootContested:${other.id}`] = w.turn;
    expect(lootTaken(w, npc, first.id)).toBe('lootTaken');
    expect(workableSpots(w, npc).map((s) => s.id)).not.toContain(first.id);
    expect(thinkNpc(w, npc).targetId).not.toBe(first.id);
  });

  it('heads off to sell when it chooses to move on', () => {
    const { w, npc } = driverIn(orchard.pos);
    forceOption('spotWork', 'moveOn');
    expect(thinkNpc(w, npc).kind).toBe('sell');
  });

  it('has no spot work with a full hold, and sells', () => {
    const { w, npc } = driverIn(orchard.pos);
    forceOption('spotWork', 'work');
    addGoods(w, npc, 'scrap', freeCells(npc));
    expect(workableSpots(w, npc)).toEqual([]);
    expect(thinkNpc(w, npc).kind).toBe('sell');
  });

  it('has no spot work once every spot is stripped', () => {
    const { w, npc } = driverIn(orchard.pos);
    for (const spot of territorySpots(w, 'orchard')) strip(w, npc, spot);
    expect(workableSpots(w, npc)).toEqual([]);
  });

  it('gives a trader no spot work', () => {
    const { w, npc } = driverIn(orchard.pos, 'trader', ['trader']);
    expect(workableSpots(w, npc)).toEqual([]);
  });

  it('gives a driver outside every territory no spot work', () => {
    const { w, npc } = driverIn({ x: 10, y: 10 });
    expect(territoryAt(npc.pos)).toBeNull();
    expect(workableSpots(w, npc)).toEqual([]);
  });
});

describe('spot picks from outside a territory', () => {
  it('picks the one Glass Flats spot it has not stripped', () => {
    const { w, npc } = driverIn({ x: 10, y: 10 }, 'scavenger', ['scavenger'], 0);
    forceOption('idle', 'scavenge');
    const spots = territorySpots(w, 'glass-flats');
    const kept = spots[spots.length - 1];
    for (const spot of spots) if (spot !== kept) strip(w, npc, spot);
    for (let k = 0; k < 20; k++) {
      const trial = cloneWorld(w);
      trial.rngState = k + 1;
      const me = trial.vehicles.find((v) => v.id === npc.id)!;
      const goal = thinkNpc(trial, me);
      if (goal.kind !== 'scavenge' || !spots.some((s) => s.id === goal.targetId)) continue;
      expect(goal.targetId).toBe(kept.id);
      return;
    }
    throw new Error('No trial picked a Glass Flats spot');
  });

  it('never picks an old spot it remembers as stripped when another is near', () => {
    const { w, npc } = driverIn({ x: 10, y: 10 }, 'scavenger', ['scavenger'], 0);
    forceOption('idle', 'scavenge');
    const old = w.salvage.filter((s) => oldSpotOf(s) !== null);
    const stripped = old.filter((_, i) => i % 2 === 0);
    for (const stock of stripped) strip(w, npc, stock);
    const strippedIds = new Set(stripped.map((s) => s.id));
    let picked = 0;
    for (let k = 0; k < 40; k++) {
      const trial = cloneWorld(w);
      trial.rngState = k + 1;
      const me = trial.vehicles.find((v) => v.id === npc.id)!;
      me.pos = { ...old[(2 * k + 1) % old.length].pos };
      const goal = thinkNpc(trial, me);
      if (!oldSpotOf({ id: goal.targetId ?? '' })) continue;
      picked++;
      expect(strippedIds.has(goal.targetId!)).toBe(false);
    }
    expect(picked).toBeGreaterThan(0);
  });
});

describe('a scavenger working the Orchard', () => {
  const moveFar = (w: World): void => w.vehicles.forEach((v) => v.brain && advanceFar(w, v));

  function run(start: World, npcId: string, turns: number): { searched: string[]; soldAfter: number; w: World } {
    let w = start;
    const searched: string[] = [];
    for (let turn = 0; turn < turns; turn++) {
      w = endTurn(w, moveFar);
      expect(w.events.filter((e) => e.t === 'stall'), `turn ${turn}`).toEqual([]);
      const me = w.vehicles.find((v) => v.id === npcId)!;
      if (me.job?.kind === 'search' && !searched.includes(me.job.stockId)) searched.push(me.job.stockId);
      if (topGoal(me)?.kind === 'sell') return { searched, soldAfter: turn, w };
    }
    return { searched, soldAfter: turns, w };
  }

  function orchardWorld(): { w: World; npc: Vehicle } {
    const { w, npc } = driverIn(orchard.pos);
    w.vehicles = w.vehicles.filter((v) => v.faction === 'player' || v.id === npc.id);
    forceOption('spotWork', 'work');
    forceOption('salvageSeen', 'keep');
    return { w, npc };
  }

  it('searches at least two Orchard spots before it sells, with no stall', () => {
    const { w, npc } = orchardWorld();
    const { searched } = run(w, npc.id, 400);
    const orchardIds = new Set(territorySpots(w, 'orchard').map((s) => s.id));
    expect(searched.filter((id) => orchardIds.has(id)).length).toBeGreaterThanOrEqual(2);
  }, 240_000);

  it('plays the same from the same seed', () => {
    const a = orchardWorld();
    const b = { w: cloneWorld(a.w), npc: a.npc };
    const first = run(a.w, a.npc.id, 40);
    const second = run(b.w, b.npc.id, 40);
    expect(second.searched).toEqual(first.searched);
    expect(second.soldAfter).toBe(first.soldAfter);
    expect(second.w.vehicles.find((v) => v.id === a.npc.id)!.pos).toEqual(first.w.vehicles.find((v) => v.id === a.npc.id)!.pos);
  }, 240_000);
});
