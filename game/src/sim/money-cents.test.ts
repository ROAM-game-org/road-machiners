import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from './types';
import { FAR_MOVER, startWorld, stepsFrom } from './progression/record';
import type { Archetype } from './progression/bot';
import { warmRoutes } from './path';
import { vehicleStats } from './stats';

const RUN_TIMEOUT = 600_000;
const RUNS: [Archetype, number, number][] = [
  ['trader', 6, 56],
  ['hauler', 1, 72],
];

function fractionalMoney(world: World): string[] {
  const wallets = [
    ['player', world.player.money] as const,
    ...world.vehicles.flatMap((v) => (v.resources ? [[v.id, v.resources.money] as const] : [])),
  ];
  return wallets.filter(([, money]) => !Number.isInteger(money)).map(([id, money]) => `turn ${world.turn} ${id} ${money}`);
}

describe('money in cents', () => {
  const starts = new Map<number, World>();

  beforeAll(() => {
    for (const [, seed] of RUNS) {
      const world = startWorld(seed);
      warmRoutes(world, [...new Set(world.vehicles.map((v) => vehicleStats(world, v).radius))]);
      starts.set(seed, world);
    }
  }, RUN_TIMEOUT);

  it.each(RUNS)('stays whole for every truck through %s play with NPCs trading, towing and guard and escort pay', async (archetype, seed, turns) => {
    const bad: string[] = [];
    let played = 0;
    for (const step of stepsFrom(starts.get(seed)!, `seed ${seed} ${archetype}`, archetype, turns, {}, FAR_MOVER)) {
      bad.push(...fractionalMoney(step.world));
      played++;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    expect(played).toBe(turns);
    expect(bad.slice(0, 10)).toEqual([]);
  }, RUN_TIMEOUT);
});
