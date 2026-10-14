import { describe, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { claimReward, claimTargets, claimWindow } from '../sim/claims';
import { contractReward, estimateTurns, shopState, siteOf, type Contract } from '../sim/market';
import { claimedPartIn } from '../sim/salvage';
import { defaultSetup } from '../sim/settings';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { memoryBackend, SaveSlots } from './save-db';
import { loadWorld, saveWorld } from './save';

function claimOf(id: string, target: ReturnType<typeof claimTargets>[number]): Contract {
  const turns = estimateTurns(siteOf('bowl').pos, target.stock.pos);
  const window = claimWindow(turns);
  return { id, shop: 'bowl', kind: 'claim', stockId: target.stock.id, at: { ...target.stock.pos }, partId: target.part.id, defId: target.part.defId, reward: claimReward(target.part, contractReward(turns, 0, false)), deadline: 500 + window, window, tier: 1, rivalAt: 500 + window, rival: null, leads: [] };
}

describe('saving salvage claims', () => {
  it('loads a posted offer and a held claim as the same world, with the same parts claimed', () => {
    const world = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    for (const shop of Object.values(world.shops)) shop.contracts = shop.contracts.filter((c) => c.kind !== 'claim');
    const targets = claimTargets(world);
    expect(targets.length).toBeGreaterThan(1);
    const [posted, held] = [targets[0], targets.find((t) => t.stock.id !== targets[0].stock.id)!];
    shopState(world, 'bowl').contracts.push(claimOf('ct-posted', posted));
    world.player.contracts.push(claimOf('ct-held', held));
    const slots = new SaveSlots(memoryBackend(), new Map());
    saveWorld(slots, world, 'run-1', 20, 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(loaded).toEqual(world);
    expect(loaded.events).toEqual(world.events);
    expect(loaded.player.money).toBe(world.player.money);
    for (const target of [posted, held]) expect(claimedPartIn(loaded, loaded.salvage.find((s) => s.id === target.stock.id)!)).toBe(target.part.id);
  });
});
