import { describe, expect, it } from 'vitest';
import { BEACON } from '../data/tow';
import { REGION } from '../data/region';
import { standardWorld } from '../test/world-cache';
import { playerVehicle } from './damage';
import { nearestRoadPoint } from './salvage';
import { siteGap } from './sites';
import { isFree } from './spawn';
import { testDrive } from './testkit';
import { playerTow, setBeacon } from './tow';
import type { World } from './types';
import { dist, type Vec } from './vec';
import { endTurn } from './world';

const SAMPLE_STEP = 10;
const EDGE = 20;
const RESCUE_TURNS = 300;
const towns = [...REGION.towns, ...REGION.locations];

function emptiestPoint(world: World): Vec {
  let best = { pos: { x: 0, y: 0 }, away: -1 };
  for (let x = EDGE; x < REGION.size - EDGE; x += SAMPLE_STEP)
    for (let y = EDGE; y < REGION.size - EDGE; y += SAMPLE_STEP) {
      const pos = { x, y };
      const away = Math.min(dist(pos, nearestRoadPoint(pos)), ...towns.map((t) => siteGap(t, pos)));
      if (away > best.away && isFree(world, pos, 2, null)) best = { pos, away };
    }
  return best.pos;
}

describe('a beacon at the emptiest point of Icarus', () => {
  const world = standardWorld(1);
  const pos = emptiestPoint(world);

  it('reaches a town or a road from there', () => {
    expect(Math.min(...towns.map((t) => dist(t.pos, pos)))).toBeLessThan(BEACON.range);
    expect(dist(pos, nearestRoadPoint(pos))).toBeLessThan(BEACON.range);
  });

  it('brings a tow to a broke, fuelless truck', () => {
    let w = world;
    playerVehicle(w).pos = { ...pos };
    playerVehicle(w).trail = [];
    w.player.money = 0;
    playerVehicle(w).fuel = 0;
    w = setBeacon(w, true);
    for (let i = 0; i < RESCUE_TURNS && playerTow(w) === null; i++) w = endTurn(w, testDrive);
    expect(playerTow(w)).not.toBeNull();
    expect(w.player.money).toBe(0);
  }, 300_000);
});
