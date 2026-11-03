import { describe, expect, it } from 'vitest';
import { CHAOS_HIGHWAY } from '../data/modes';
import { haulerOf, playerVehicle } from './damage';
import { interceptPoint, spawnGroup, waveOf } from './chaos-highway';
import { acrossOf, alongOf, roadHeading, roadPoint, toRoad } from './highway';
import { chaosHighwayWorld } from './testkit';
import { dist } from './vec';
import type { World } from './types';

const N = 150;
const FOOT_TOLERANCE = 1e-3;

function playerAt(w: World, across: number, speed: number): void {
  const me = playerVehicle(w);
  me.pos = roadPoint(w.seed, 0, N, across);
  me.heading = roadHeading(w.seed, N);
  me.speed = speed;
  const hauler = haulerOf(w);
  hauler.pos = { ...me.pos };
  hauler.heading = me.heading;
  hauler.speed = speed;
}

function spawnedFrom(w: World, from: 'ahead') {
  const run = w.chaosHighway!;
  const group = { ...run.groups[0], stretch: 1, from, templates: ['buggy'], level: waveOf(1).level };
  run.groups = [group];
  spawnGroup(w, run, group, alongOf(w.seed, toRoad(w.seed, 0, playerVehicle(w).pos)));
  return w.vehicles.find((v) => v.id === group.vehicles[0])!;
}

const acrossAt = (w: World, pos: { x: number; y: number }) => acrossOf(w.seed, toRoad(w.seed, 0, pos));

describe('Chaos Highway groups on the player line', () => {
  it('spawn ahead around the player on the verge, not on the road', () => {
    const w = chaosHighwayWorld(3);
    playerAt(w, 16, 0);
    expect(Math.abs(acrossAt(w, spawnedFrom(w, 'ahead').pos) - 16)).toBeLessThanOrEqual(Math.max(...CHAOS_HIGHWAY.spawnOffsets.map(Math.abs)));
  });

  it('never spawn past the flanks when the player hugs the ridge', () => {
    const w = chaosHighwayWorld(3);
    playerAt(w, -25, 0);
    expect(Math.abs(acrossAt(w, spawnedFrom(w, 'ahead').pos))).toBeLessThanOrEqual(CHAOS_HIGHWAY.sides.flank.across + FOOT_TOLERANCE);
  });
});

describe('Chaos Highway hunters', () => {
  function hunterWorld(playerSpeed: number) {
    const w = chaosHighwayWorld(3);
    playerAt(w, 0, playerSpeed);
    const hunter = spawnedFrom(w, 'ahead');
    return { w, me: playerVehicle(w), hunter };
  }

  it('aim ahead of a moving player, at most the encounter range ahead', () => {
    const { w, me, hunter } = hunterWorld(8);
    const aim = interceptPoint(w, w.chaosHighway!, hunter, me);
    const lead = alongOf(w.seed, toRoad(w.seed, 0, aim)) - alongOf(w.seed, toRoad(w.seed, 0, me.pos));

    expect(lead).toBeGreaterThan(5);
    expect(dist(aim, me.pos)).toBeLessThanOrEqual(CHAOS_HIGHWAY.pacing.near + 0.5);
  });

  it('aim at a parked player', () => {
    const { w, me, hunter } = hunterWorld(0);
    expect(interceptPoint(w, w.chaosHighway!, hunter, me)).toEqual(me.pos);
  });

  it('keep the aim inside the flanks when the player drives at the ridge', () => {
    const { w, me, hunter } = hunterWorld(8);
    me.heading += Math.PI / 2;
    expect(Math.abs(acrossAt(w, interceptPoint(w, w.chaosHighway!, hunter, me)))).toBeLessThanOrEqual(CHAOS_HIGHWAY.sides.flank.across + FOOT_TOLERANCE);
  });
});
