import { describe, expect, it } from 'vitest';
import type { World } from './types';
import { recordTurns } from './progression/record';
import type { Archetype } from './progression/bot';

const RUN_TIMEOUT = 600_000;

function fractionalMoney(world: World): string[] {
  const wallets = [
    ['player', world.player.money] as const,
    ...world.vehicles.flatMap((v) => (v.resources ? [[v.id, v.resources.money] as const] : [])),
  ];
  return wallets.filter(([, money]) => !Number.isInteger(money)).map(([id, money]) => `turn ${world.turn} ${id} ${money}`);
}

describe('money in cents', () => {
  it.each([
    ['trader', 6, 56],
    ['hauler', 1, 72],
  ] as [Archetype, number, number][])('stays whole for every truck through %s play with NPCs trading, towing and guard and escort pay', async (archetype, seed, turns) => {
    const bad: string[] = [];
    let played = 0;
    for (const step of recordTurns(seed, archetype, turns)) {
      bad.push(...fractionalMoney(step.world));
      played++;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    expect(played).toBe(turns);
    expect(bad.slice(0, 10)).toEqual([]);
  }, RUN_TIMEOUT);
});
