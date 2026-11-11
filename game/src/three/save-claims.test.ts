import { describe, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { claimReward, claimTargets, claimWindow, isFreeRival, sendRival } from '../sim/claims';
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
  it('loads a posted offer with no rival, a held claim with a lead and a rival mid-run as the same world, awarding nothing', () => {
    const world = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    for (const shop of Object.values(world.shops)) shop.contracts = shop.contracts.filter((c) => c.kind !== 'claim');
    const targets = claimTargets(world, 'bowl');
    expect(targets.length).toBeGreaterThan(1);
    const [posted, held] = [targets[0], targets.find((t) => t.stock.id !== targets[0].stock.id)!];
    const offer = claimOf('ct-posted', posted) as ClaimContract;
    shopState(world, 'bowl').contracts.push(offer);
    const mine = claimOf('ct-held', held) as ClaimContract;
    mine.leads.push({ turn: world.turn, from: { x: 12.5, y: 40 }, driver: 'Jed Cobb' });
    world.player.contracts.push(mine);
    mine.rivalAt = world.turn;
    const behind = { x: siteOf('bowl').pos.x * 2 - mine.at.x, y: siteOf('bowl').pos.y * 2 - mine.at.y };
    const free = world.vehicles.filter((v) => isFreeRival(world, v, held.part));
    free.forEach((v, i) => { v.pos = { x: behind.x + i * 4, y: behind.y }; });
    const rival = sendRival(world, mine);
    expect(rival).not.toBeNull();
    world.events = [];
    const slots = new SaveSlots(memoryBackend(), new Map());
    saveWorld(slots, world, 'run-1', 20, 1000);
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(loaded).toEqual(world);
    expect(loaded.events).toEqual([]);
    expect(loaded.player.money).toBe(world.player.money);
    expect(loaded.player.xp).toEqual(world.player.xp);
    expect((shopState(loaded, 'bowl').contracts.find((c) => c.id === 'ct-posted') as ClaimContract).rival).toBeNull();
    expect(loaded.vehicles.find((v) => v.id === rival!.id)!.brain!.goals.at(-1)).toMatchObject({ kind: 'claim', claim: 'ct-held', reason: 'claimRun' });
    for (const target of [posted, held]) expect(claimedPartIn(loaded, loaded.salvage.find((s) => s.id === target.stock.id)!)).toBe(target.part.id);
  });
});
