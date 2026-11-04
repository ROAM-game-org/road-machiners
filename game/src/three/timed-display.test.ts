import { expect, it } from 'vitest';
import { emptyWorld } from '../sim/testkit';
import { cloneWorld } from '../sim/world';
import { mountedParts } from '../sim/grid';
import { timedDisplay } from './timed-display';
import { newTimedCombat } from '../sim/timed-combat';
import type { PrototypeWorld } from '../sim/timed-combat';

it('changes inspected health at the recorded impact without changing simulation state', () => {
  const before = emptyWorld();
  const vehicle = before.vehicles.find(v => v.id === before.player.vehicleId)!;
  const part = mountedParts(vehicle)[0];
  const after = cloneWorld(before) as PrototypeWorld;
  const state = newTimedCombat(); after.prototypeCombat = state;
  state.records.push({ at: 100, kind: 'impact', flight: null, event: { t: 'shot', shooter: vehicle.id, target: vehicle.id, weapon: part.id, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [{ hit: true, crit: false, offset: 0, struck: vehicle.id, hits: [{ part: part.id, damage: 3 }], blast: [], burst: null }] } });
  const hp = (at: number) => mountedParts(timedDisplay(before, after, at).vehicles.find(v => v.id === vehicle.id)!)[0].hp;
  expect(hp(99)).toBe(part.hp);
  expect(hp(100)).toBe(part.hp - 3);
  expect(mountedParts(after.vehicles.find(v => v.id === vehicle.id)!)[0].hp).toBe(part.hp);
});
