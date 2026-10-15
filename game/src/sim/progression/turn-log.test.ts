import { REGION } from '../../data/region';
import { describe, expect, it } from 'vitest';
import { tileAt } from '../terrain';
import { addVehicle, editableTerrain, emptyWorld } from '../testkit';
import type { World } from '../types';
import { measuredRewardTurns, searchEffort, worldLine, type TruckSnap, type TurnLine } from './turn-log';
import { EFFORT } from '../../data/market';

function sandWithOneRoadTile(): World {
  const w = emptyWorld();
  const terrain = editableTerrain(w);
  terrain.types.fill('sand');
  terrain.types[tileAt(terrain, { x: 40, y: 40 })] = 'road';
  w.turn = 100;
  return w;
}

function snapOf(w: World, id: string): TruckSnap {
  const trucks = worldLine(w, [])?.trucks;
  if (!trucks) throw new Error(`Turn ${w.turn} wrote no snapshot`);
  const snap = trucks.find((s) => s.id === id);
  if (!snap) throw new Error(`No snapshot of ${id}`);
  return snap;
}

describe('world log snapshot', () => {
  it('marks a truck on a road tile as on road and one on open ground as off it', () => {
    const w = sandWithOneRoadTile();
    const onRoad = addVehicle(w, 'raiders', 'buggy', [], { x: 40.5, y: 40.5 });
    const offRoad = addVehicle(w, 'raiders', 'buggy', [], { x: 50.5, y: 40.5 });

    expect(snapOf(w, onRoad.id).onRoad).toBe(true);
    expect(snapOf(w, offRoad.id).onRoad).toBe(false);
  });

  it('records the gap to the nearest road edge, rounded and capped at 20 tiles', () => {
    const w = sandWithOneRoadTile();
    const [a, b] = REGION.roads[0];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const at = (gap: number) => ({ x: a.x - ((b.y - a.y) / len) * (REGION.roadWidth / 2 + gap), y: a.y + ((b.x - a.x) / len) * (REGION.roadWidth / 2 + gap) });
    const on = addVehicle(w, 'raiders', 'buggy', [], { ...a });
    const near = addVehicle(w, 'raiders', 'buggy', [], at(8));
    const far = addVehicle(w, 'raiders', 'buggy', [], at(60));
    expect(snapOf(w, on.id).roadGap).toBe(0);
    expect(snapOf(w, near.id).roadGap).toBeGreaterThan(0);
    expect(snapOf(w, near.id).roadGap).toBeLessThanOrEqual(8);
    expect(snapOf(w, far.id).roadGap).toBe(20);
  });
});

function line(t: number, ev: string[] = [], ledger: TurnLine['ledger'] = {}): TurnLine {
  return { t, pos: [0, 0], money: 0, nw: 0, fuel: 0, sup: 0, heat: 0, chassis: 'scout', speed: 0, v: 0, state: 'active', goods: {}, parts: [], contracts: [], order: null, job: null, flags: [], call: null, foes: [], ledger, ev };
}

describe('search effort from a turn log', () => {
  it('counts each search from accept to its end, and the running costs per turn', () => {
    const lines = [
      line(1, ['contract accepted search'], { fuel: -10 }),
      line(101, ['contract fulfilled search'], { repairs: -20 }),
      line(201, ['contract done search', 'money 9200 contract'], { supplies: -6, contracts: 9200 }),
      line(301, ['contract accepted search']),
      line(901, ['contract failed search']),
      line(950, ['contract accepted haul', 'contract accepted search']),
      line(1000),
    ];
    expect(searchEffort(lines)).toEqual({
      accepted: 3, claimed: 1, failed: 1, lapsed: 0, open: 1, efforts: [200], searchTurns: 200 + 600 + 50, runningCost: 36 / 7, turns: 7,
    });
  });

  it('sets the reward from effort, running cost and the tier 1 wage', () => {
    expect(measuredRewardTurns(246, 0.253 * 100)).toBe(Math.round((246 * (25.3 + EFFORT.wage[1])) / EFFORT.wage[1] / 10) * 10);
  });
});
