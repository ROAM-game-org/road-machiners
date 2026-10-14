import { describe, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { claimReward, claimTargets, claimWindow, sendRival } from '../sim/claims';
import { contractReward, estimateTurns, shopState, siteOf, type Contract } from '../sim/market';
import { claimedPartIn, type ClaimContract } from '../sim/salvage';
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
  it('loads a posted offer with a rival out, a held claim with a lead and a rival mid-run as the same world, awarding nothing', () => {
    const world = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    for (const shop of Object.values(world.shops)) shop.contracts = shop.contracts.filter((c) => c.kind !== 'claim');
    const targets = claimTargets(world);
    expect(targets.length).toBeGreaterThan(1);
    const [posted, held] = [targets[0], targets.find((t) => t.stock.id !== targets[0].stock.id)!];
    const offer = claimOf('ct-posted', posted) as ClaimContract;
    offer.rivalAt = world.turn;
    shopState(world, 'bowl').contracts.push(offer);
    const mine = claimOf('ct-held', held) as ClaimContract;
    mine.leads.push({ turn: world.turn, from: { x: 12.5, y: 40 }, driver: 'Jed Cobb' });
    world.player.contracts.push(mine);
    const rival = sendRival(world, offer);
    expect(rival).not.toBeNull();
    world.events = [];
    const slots = new SaveSlots(memoryBackend(), new Map());
    saveWorld(slots, world, 'run-1', 20, 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(loaded).toEqual(world);
    expect(loaded.events).toEqual([]);
    expect(loaded.player.money).toBe(world.player.money);
    expect(loaded.player.xp).toEqual(world.player.xp);
    expect(loaded.vehicles.find((v) => v.id === rival!.id)!.brain!.goals.at(-1)).toMatchObject({ kind: 'claim', claim: 'ct-posted', reason: 'claimRun' });
    for (const target of [posted, held]) expect(claimedPartIn(loaded, loaded.salvage.find((s) => s.id === target.stock.id)!)).toBe(target.part.id);
  });
});
