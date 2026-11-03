import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { BEACON } from '../data/tow';
import { REGION } from '../data/region';
import { standardWorld } from '../test/world-cache';
import { playerVehicle } from './damage';
import { hangUp } from './dialogue';
import { nearestRoadPoint } from './salvage';
import { siteGap } from './sites';
import { isFree } from './spawn';
import { addVehicle, npcBrain, testDrive } from './testkit';
import { playerTow, setBeacon } from './tow';
import type { World } from './types';
import { dist, type Vec } from './vec';
import { endTurn } from './world';

const SAMPLE_STEP = 10;
const EDGE = 20;
const RESCUE_TURNS = 300;
const FIRST_PART_TURNS = 130;
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

  it('reaches a road from there', () => {
    expect(dist(pos, nearestRoadPoint(pos))).toBeLessThan(BEACON.range);
  });

  let rescue = world;
  let turnsPlayed = 0;

  function playUntil(limit: number): void {
    while (turnsPlayed < limit && playerTow(rescue) === null) {
      rescue = rescue.player.call ? hangUp(rescue) : endTurn(rescue, testDrive);
      turnsPlayed++;
    }
  }

  it('sets a broke, fuelless truck beaconing and plays the first part of the wait', () => {
    playerVehicle(rescue).pos = { ...pos };
    playerVehicle(rescue).trail = [];
    rescue.player.money = 0;
    rescue.player.fuel = 0;
    const road = nearestRoadPoint(pos);
    const tower = addVehicle(rescue, 'independent', 'hauler', ['stockEngine'], road, Math.PI);
    tower.brain = npcBrain('trader', road, NPCS.trader.traits);
    rescue = setBeacon(rescue, true);
    playUntil(FIRST_PART_TURNS);
  }, 300_000);

  it('brings a tow to a broke, fuelless truck', () => {
    playUntil(RESCUE_TURNS);
    expect(playerTow(rescue)).not.toBeNull();
    expect(rescue.player.money).toBe(0);
  }, 300_000);
});
