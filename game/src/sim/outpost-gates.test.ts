import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { FURY_ROAD } from '../data/modes';
import { haulerOf, playerVehicle } from './damage';
import { canDriveOn, driveOn, outpostNear, reachedOutpostAt, spawnGroup, waveOf } from './fury-road';
import { milestoneAt, outpostFort, outpostGateSpots, outpostYardHalf, roadPoint, toRoad } from './highway';
import { gatesShut, inYard, outpostGates, wholeInYard, yardSpots, type GateState } from './outpost-gates';
import { outpostBuyPart } from './outposts';
import { furyRoadWorld, parkInYard } from './testkit';
import type { Vehicle, World } from './types';
import { Refused, endTurn, setMoveOrder } from './world';
import { FORTRESS } from '../data/fortress';

const still = () => {};

function runOf(w: World) {
  return w.furyRoad!;
}

function arrive(w: World): World {
  parkInYard(w, runOf(w).window + 1);
  return endTurn(w, still);
}

function toWindow(seed: number, window: number): World {
  let w = furyRoadWorld(seed);
  for (let k = 0; k < window; k++) w = driveOn(arrive(w));
  return w;
}

function table(gates: GateState[]): string[] {
  return gates.map((g) => `${g.milestone}${g.side[0]}:${g.closed ? 'closed' : 'open'}:${g.movable ? 'moves' : 'static'}`);
}

describe('the outpost gates', () => {
  it('follow the table for windows 0, 1 and 2, before and after the shut (IV3)', () => {
    const w0 = furyRoadWorld();
    expect(table(outpostGates(w0))).toEqual(['1s:open:moves', '1n:closed:static']);
    expect(table(outpostGates(arrive(w0)))).toEqual(['1s:closed:moves', '1n:closed:static']);

    const w1 = toWindow(3, 1);
    expect(table(outpostGates(w1))).toEqual(['1s:closed:static', '1n:open:moves', '2s:open:moves', '2n:closed:static']);
    expect(table(outpostGates(arrive(w1)))).toEqual(['1s:closed:static', '1n:open:moves', '2s:closed:moves', '2n:closed:static']);

    const w2 = toWindow(3, 2);
    expect(table(outpostGates(w2))).toEqual(['2s:closed:static', '2n:open:moves', '3s:open:moves', '3n:closed:static']);
    expect(table(outpostGates(arrive(w2)))).toEqual(['2s:closed:static', '2n:open:moves', '3s:closed:moves', '3n:closed:static']);
  });

  it('sit on the gate spots of their forts', () => {
    const w = toWindow(3, 1);
    for (const g of outpostGates(w)) expect(g.spot).toEqual(outpostGateSpots(w.seed, 1, g.milestone)[g.side]);
  });

  it('throw with no run, and the yard spots throw for milestone 0 (PC7)', () => {
    const roaming = furyRoadWorld();
    roaming.furyRoad = null;
    expect(() => outpostGates(roaming)).toThrow(/No Fury Road run/);
    expect(() => yardSpots(furyRoadWorld(), 0)).toThrow(/no outpost/);
  });
});

describe('the yard', () => {
  it('holds a point inside its walls and not outside them', () => {
    const w = furyRoadWorld();
    const center = outpostFort(w.seed, 0, 1).pos;
    const half = outpostYardHalf() - FORTRESS.wallDepth / 2;
    expect(inYard(w, center, 1)).toBe(true);
    expect(inYard(w, { x: center.x + half - 0.1, y: center.y - half + 0.1 }, 1)).toBe(true);
    expect(inYard(w, { x: center.x + half + 0.1, y: center.y }, 1)).toBe(false);
    expect(inYard(w, { x: center.x, y: center.y + half + 0.1 }, 1)).toBe(false);
  });

  it('seats the widest truck whole at both park spots, and not at the gate line', () => {
    const w = furyRoadWorld();
    const widest = Object.values(CHASSIS).reduce((a, b) => (b.radius > a.radius ? b : a));
    const spots = yardSpots(w, 1);
    const truck = { chassisId: widest.id, pos: spots.hauler } as Vehicle;
    expect(wholeInYard(w, truck, 1)).toBe(true);
    expect(wholeInYard(w, { ...truck, pos: spots.truck } as Vehicle, 1)).toBe(true);
    const gate = outpostGateSpots(w.seed, 0, 1).south.center;
    expect(wholeInYard(w, { ...truck, pos: gate } as Vehicle, 1)).toBe(false);
    const center = outpostFort(w.seed, 0, 1).pos;
    expect(wholeInYard(w, { ...truck, pos: { x: center.x + outpostYardHalf() - 1, y: center.y } } as Vehicle, 1)).toBe(false);
  });
});

describe('shutting the gates (IV4)', () => {
  it('needs the next outpost paid and both trucks parked whole inside', () => {
    const early = furyRoadWorld();
    parkInYard(early, 1);
    expect(gatesShut(early)).toBe(false);

    const w = arrive(furyRoadWorld());
    expect(gatesShut(w)).toBe(true);

    const outside = structuredClone(w);
    playerVehicle(outside).pos = roadPoint(outside.seed, 0, milestoneAt(1) - 20, 1);
    expect(gatesShut(outside)).toBe(false);

    const rolling = structuredClone(w);
    haulerOf(rolling).speed = 3;
    expect(gatesShut(rolling)).toBe(false);

    const hauler = structuredClone(w);
    haulerOf(hauler).pos = roadPoint(hauler.seed, 0, milestoneAt(1) - 20, 1);
    expect(gatesShut(hauler)).toBe(false);

    const gateLine = structuredClone(w);
    playerVehicle(gateLine).pos = outpostGateSpots(gateLine.seed, 0, 1).north.center;
    expect(gatesShut(gateLine)).toBe(false);
  });

  it('is false in a world with no run', () => {
    const w = furyRoadWorld();
    w.furyRoad = null;
    expect(gatesShut(w)).toBe(false);
  });
});

describe('the shop and the garage (IV5)', () => {
  it('open only in the yard of the next outpost once paid, and close for the last one after Drive on', () => {
    const w = arrive(furyRoadWorld());
    expect(outpostNear(w)?.id).toBe('outpost-1');
    expect(reachedOutpostAt(w)?.id).toBe('outpost-1');
    const part = outpostNear(w)!.stock[0];

    const after = driveOn(w);
    expect(outpostNear(after)).toBeNull();
    expect(outpostNear(after, haulerOf(after))).toBeNull();
    expect(reachedOutpostAt(after)).toBeNull();
    expect(() => outpostBuyPart(after, part.id)).toThrow();
  });

  it('stays closed when a truck drives back into the last yard through the open north gate (AS2)', () => {
    const w = toWindow(3, 1);
    const back = structuredClone(w);
    playerVehicle(back).pos = yardSpots(back, 1).truck;
    playerVehicle(back).speed = 0;
    expect(inYard(back, playerVehicle(back).pos, 1)).toBe(true);
    expect(reachedOutpostAt(back)).toBeNull();
  });
});

describe('orders and Drive on while shut (IV6)', () => {
  it('refuses a move order for the player truck while the gates are shut and allows it before', () => {
    const early = furyRoadWorld();
    parkInYard(early, 1);
    expect(() => setMoveOrder(early, { kind: 'stopAt', dest: { x: 10, y: 10 } })).not.toThrow();

    const shut = arrive(furyRoadWorld());
    expect(() => setMoveOrder(shut, { kind: 'stopAt', dest: { x: 10, y: 10 } })).toThrow(Refused);
    expect(() => setMoveOrder(shut, null)).toThrow(Refused);
    expect(() => setMoveOrder(shut, { kind: 'brake' })).toThrow(Refused);
    try {
      setMoveOrder(shut, null);
    } catch (e) {
      expect((e as Refused).refusal).toEqual({ id: 'gatesShut' });
    }
  });

  it('allows orders again once the window moved', () => {
    const w = driveOn(arrive(furyRoadWorld()));
    expect(() => setMoveOrder(w, { kind: 'stopAt', dest: { x: 10, y: 10 } })).not.toThrow();
  });

  it('throws on Drive on unless the gates are shut', () => {
    const early = furyRoadWorld();
    parkInYard(early, 1);
    expect(canDriveOn(early)).toBe(false);
    expect(() => driveOn(early)).toThrow(/Drive on/);
    expect(canDriveOn(arrive(furyRoadWorld()))).toBe(true);
  });
});

describe('driving on (IV9)', () => {
  it('keeps both trucks where they stand, inside the last fort of the new window', () => {
    for (const seed of [1, 2, 3]) {
      const w = arrive(furyRoadWorld(seed));
      const before = [playerVehicle(w), haulerOf(w)].map((t) => ({ ...t.pos }));
      const after = driveOn(w);
      const trucks = [playerVehicle(after), haulerOf(after)];
      trucks.forEach((t, i) => {
        expect(t.pos.x).toBeCloseTo(before[i].x, 6);
        expect(t.pos.y - before[i].y).toBeCloseTo(310, 6);
        expect(inYard(after, t.pos, runOf(after).window)).toBe(true);
        expect(toRoad(runOf(after).window, t.pos).n).toBeCloseTo(milestoneAt(1), 0);
      });
    }
  });

  it('puts the trucks into the new window parked, inside the yard that is no longer for sale', () => {
    const after = driveOn(arrive(furyRoadWorld()));
    expect(gatesShut(after)).toBe(false);
    expect(playerVehicle(after).speed).toBe(0);
  });
});

describe('group spawns around the forts (IV8)', () => {
  it('keep out of both forts and their spawn reach on every side and progress', () => {
    let spawns = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const window of [0, 1]) {
        const w = toWindow(seed, window);
        const run = runOf(w);
        const forts = [window, window + 1].filter((j) => j >= 1).map((j) => outpostFort(seed, window, j));
        for (const from of ['ahead', 'left', 'right'] as const) {
          for (const progress of [milestoneAt(window) + 5, milestoneAt(window) + 60, milestoneAt(window) + 150, milestoneAt(window) + 250, milestoneAt(window + 1) - 30, milestoneAt(window + 1) - 5, milestoneAt(window + 1)]) {
            w.vehicles = w.vehicles.filter((v) => v.id === w.player.vehicleId || v.id === run.hauler.id);
            const group = { ...run.groups[0], stretch: window + 1, from, templates: ['buggy'], level: waveOf(window + 1).level, spawned: false, vehicles: [], retryUntil: null };
            run.groups = [group];
            spawnGroup(w, run, group, progress);
            for (const id of group.vehicles) {
              const v = w.vehicles.find((x) => x.id === id)!;
              spawns++;
              const reach = outpostYardHalf() + FORTRESS.wallDepth / 2 + CHASSIS[v.chassisId].radius + FURY_ROAD.spawnClear;
              for (const fort of forts) {
                const gap = Math.max(Math.abs(v.pos.x - fort.pos.x), Math.abs(v.pos.y - fort.pos.y));
                expect(gap, `seed ${seed} window ${window} ${from} ${progress}`).toBeGreaterThanOrEqual(reach - 1e-6);
              }
            }
          }
        }
      }
    }
    expect(spawns).toBeGreaterThan(60);
  }, 300_000);
});
