import { describe, expect, it } from 'vitest';
import { emptyWorld } from './testkit';
import { bountyTurn, dueTurn, isExpired, isLate, lateBy, type Contract } from './market';

const haul: Extract<Contract, { kind: 'haul' }> = { id: 'h', shop: 'bowl', kind: 'haul', good: 'salt', units: 3, to: 'nose', reward: 100, deadline: 500, window: 400, rush: false, tier: 1 };

describe('contract expiry turns', () => {
  it('expires a contract on its due turn and not one turn before', () => {
    const w = emptyWorld();
    w.turn = dueTurn(haul) - 1;
    expect(isExpired(w, haul)).toBe(false);
    w.turn = dueTurn(haul);
    expect(isExpired(w, haul)).toBe(true);
    expect(isLate(w, haul)).toBe(true);
  });

  it('puts the bounty turn one turn after the late limit', () => {
    expect(bountyTurn(haul)).toBe(lateBy(haul) + 1);
    expect(bountyTurn(haul)).toBeGreaterThan(dueTurn(haul));
  });
});
