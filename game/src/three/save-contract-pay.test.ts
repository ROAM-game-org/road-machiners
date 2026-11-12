import { describe, expect, it } from 'vitest';
import { contractPay } from '../sim/contract-pay';
import { TEST_MAP } from '../test/map';
import { loadWorld } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import ANCHOR from './save-fixtures/anchors/2-138-roaming.json';

describe('contract pay on load', () => {
  it('reprices the offers of a save from before the economy rescale', () => {
    const saved = ANCHOR as unknown as { world: { shops: Record<string, { contracts: { kind: string; good: string; to: string; reward: number }[] }> } };
    const stored = saved.world.shops.nose.contracts.find((c) => c.kind === 'haul' && c.to === 'bowl')!;
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('slot1', structuredClone(ANCHOR));
    const world = loadWorld(slots, 'slot1', TEST_MAP)!;
    const loaded = world.shops.nose.contracts.find((c) => c.kind === 'haul' && c.to === 'bowl')!;

    expect(stored.reward).toBeGreaterThan(1000);
    expect(loaded.reward).toBeLessThan(stored.reward / 5);
    const board = Object.values(world.shops).flatMap((s) => s.contracts);
    for (const c of board) {
      const pay = contractPay(world, c);
      if (pay) expect(c.reward).toBe(pay.reward);
    }
  });
});
