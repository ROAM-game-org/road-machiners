import { describe, expect, it } from 'vitest';
import { NPCS, SPAWN } from '../data/npcs';
import { START_KITS } from '../data/start';
import { playerVehicle } from '../sim/damage';
import { defaultSetup } from '../sim/settings';
import type { World } from '../sim/types';
import { dist } from '../sim/vec';
import { carriedWorld, newWorld } from '../sim/world';
import { budget } from './budget';
import { TEST_MAP } from './map';
import { reusedWorld } from './world-cache';

const startWorld = (seed: number) => reusedWorld(`start ${seed}`, () => newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming')));

const carried = (seed: number) =>
  reusedWorld(`carried ${seed}`, () =>
    carriedWorld(
      { seed, money: 0, xp: 0, ranks: {}, xpBySource: {}, perks: [], paint: null, discovered: [], knockouts: 0, autoFire: true, autoRepair: false, fuel: 5, supplies: 3, costBasis: {}, truck: null, storage: [], setup: undefined, quests: { world: {}, local: {} }, run: null, notes: [], revisions: {}, refunded: 0 },
      START_KITS.standard,
      () => TEST_MAP,
      () => seed,
    ),
  );

const leaders = (w: World) => {
  const followers = new Set(w.states.filter((s) => s.kind === 'escort').map((s) => s.holder));
  return w.vehicles.filter((v) => v.brain && !followers.has(v.id) && NPCS[v.brain.templateId].spawn.kind !== 'hollow');
};

export function spawnRoomOnSeeds(seeds: readonly number[]): void {
  describe(`spawn room on seeds ${seeds[0]} to ${seeds[seeds.length - 1]}`, () => {
    it('places no driver close to a migrated player and keeps the roster whole', () => {
      const roster = SPAWN.initial.length + SPAWN.startTraffic.templates.length;
      for (const seed of seeds) {
        const w = carried(seed);
        const npcs = w.vehicles.filter((v) => v.brain);
        expect(npcs.length).toBeGreaterThanOrEqual(roster);
        for (const v of npcs) expect(dist(v.pos, playerVehicle(w).pos)).toBeGreaterThanOrEqual(SPAWN.minPlayerDist);
      }
    }, budget(120_000));

    it('never spawns a leader into a crowd', () => {
      for (const seed of seeds) {
        for (const w of [startWorld(seed), carried(seed)]) {
          for (const v of leaders(w)) {
            const before = w.vehicles.slice(0, w.vehicles.indexOf(v));
            const crowd = before.filter((o) => dist(o.pos, v.pos) < SPAWN.crowd.reach).length;
            expect(crowd).toBeLessThan(SPAWN.crowd.most);
          }
        }
      }
    }, budget(120_000));
  });
}
