import { describe, expect, it } from "vitest";
import { PHYSICS } from "../data/physics";
import type { VehicleFrame } from "../phys/frames";
import { kph } from "../ui/units";
import { emptyWorld } from '../sim/testkit';
import { cloneWorld } from '../sim/world';
import { mountedParts } from '../sim/grid';
import { playbackKph, playbackWorld, timedDisplay } from './timed-display';
import { newTimedCombat } from '../sim/timed-combat';

it('changes inspected health at the recorded impact without changing simulation state', () => {
  const before = emptyWorld();
  const vehicle = before.vehicles.find(v => v.id === before.player.vehicleId)!;
  const part = mountedParts(vehicle)[0];
  const after = cloneWorld(before);
  const state = newTimedCombat(); after.combat = state;
  state.records.push({ at: 100, kind: 'impact', flight: null, event: { t: 'shot', shooter: vehicle.id, target: vehicle.id, weapon: part.id, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [{ hit: true, crit: false, offset: 0, struck: vehicle.id, hits: [{ part: part.id, damage: 3 }], blast: [], burst: null }] } });
  const hp = (at: number) => mountedParts(timedDisplay(before, after, at).vehicles.find(v => v.id === vehicle.id)!)[0].hp;
  expect(hp(99)).toBe(part.hp);
  expect(hp(100)).toBe(part.hp - 3);
  expect(mountedParts(after.vehicles.find(v => v.id === vehicle.id)!)[0].hp).toBe(part.hp);
});

it('builds the shown world once per moment of playback', () => {
  const before = emptyWorld();
  const after = cloneWorld(before);
  after.combat = newTimedCombat();
  const at = (elapsed: number) => playbackWorld(after, { impacts: false, before, elapsed });
  expect(at(100)).toBe(at(100));
  expect(at(116)).not.toBe(at(100));
  const later = cloneWorld(after);
  expect(playbackWorld(later, { impacts: false, before, elapsed: 100 })).not.toBe(at(100));
});

it('keeps projectile playback inside the simulated turn while trucks coast', async () => {
  const { combatFrameMs } = await import('./timed-display');
  expect(combatFrameMs({ elapsed: 500 }, 16, 1000)).toBe(16);
  expect(combatFrameMs({ elapsed: 990 }, 20, 1000)).toBe(10);
  expect(combatFrameMs({ elapsed: 1000 }, 16, 1000)).toBe(0);
  expect(combatFrameMs(null, 16, 1000)).toBe(0);
});

function frame(x: number, z = 0): VehicleFrame {
  return { pos: { x, y: 0, z }, rot: { x: 0, y: 0, z: 0, w: 1 }, acc: { x: 0, y: 0, z: 0 }, wheels: [] };
}

function steady(metersPerStep: number, count: number): VehicleFrame[] {
  return Array.from({ length: count }, (_, i) => frame(i * metersPerStep));
}

describe("playbackKph", () => {
  it("matches the kph of the same speed in tiles per turn", () => {
    const tilesPerTurn = 3;
    const metersPerStep = (tilesPerTurn * PHYSICS.metersPerTile) / (PHYSICS.turnSeconds * PHYSICS.stepsPerSecond);
    expect(playbackKph(steady(metersPerStep, 40), 20)).toBe(kph(tilesPerTurn));
  });

  it("reads zero for a parked truck", () => {
    expect(playbackKph(steady(0, 20), 10)).toBe(0);
  });

  it("follows a speed that rises along the frames", () => {
    const frames = Array.from({ length: 60 }, (_, i) => frame(i * i * 0.01));
    expect(playbackKph(frames, 50)).toBeGreaterThan(playbackKph(frames, 10));
  });

  it("clamps the step to the frame range", () => {
    const frames = steady(0.1, 10);
    expect(playbackKph(frames, -1)).toBe(playbackKph(frames, 0));
    expect(playbackKph(frames, 30)).toBe(playbackKph(frames, 9));
  });

  it("reads zero for a single frame", () => {
    expect(playbackKph([frame(0)], 0)).toBe(0);
  });

  it("measures along the ground in both axes", () => {
    const frames = Array.from({ length: 20 }, (_, i) => frame(i * 0.1, i * 0.1));
    expect(playbackKph(frames, 10)).toBe(playbackKph(steady(Math.SQRT2 * 0.1, 20), 10));
  });
});
