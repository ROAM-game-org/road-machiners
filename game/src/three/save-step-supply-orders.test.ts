import { describe, expect, it } from 'vitest';
import FORMAT_2_103 from './save-fixtures/format-2-103.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

type Saved = typeof FORMAT_2_103;

const step = (world: Saved): Saved => TINY_STEPS[103 - TINY_FROM].step(structuredClone(world) as unknown as SavedJson) as unknown as Saved;
const fixture = () => structuredClone(FORMAT_2_103);
const ids = (contracts: { id: string }[]) => contracts.map((c) => c.id);

describe('save migration 103 to 104, supply orders replace fetches and bounties', () => {
  it('drops every fetch and bounty from the shop boards and keeps the other offers as they were', () => {
    const next = step(fixture());
    expect(ids(next.shops.bowl.contracts)).toEqual(['ct-board-haul']);
    expect(next.shops.bowl.contracts[0]).toEqual(fixture().shops.bowl.contracts[2]);
    expect(next.shops.nose.contracts).toEqual([]);
    expect(next.shops.bowl.goods).toEqual(fixture().shops.bowl.goods);
  });

  it('pays a held met bounty once and drops every held fetch and bounty with no charge (IV7)', () => {
    const next = step(fixture());
    expect(next.player.contracts).toEqual([]);
    expect(next.player.money).toBe(50000 + 11100);
  });

  it('drops past fetches and bounties from the journal and keeps the rest', () => {
    const next = step(fixture());
    expect(next.player.pastContracts).toEqual([fixture().player.pastContracts[2]]);
  });

  it('carries Bounty talk over as Bounty hunter and leaves the other perks (IV8)', () => {
    expect(step(fixture()).player.perks).toEqual(['rammer', 'bountyHunter']);
  });

  it('changes nothing in a save with no fetch, bounty or Bounty talk', () => {
    const plain = fixture();
    plain.shops.bowl.contracts = [plain.shops.bowl.contracts[2]];
    plain.shops.nose.contracts = [];
    plain.player.contracts = [];
    plain.player.pastContracts = [plain.player.pastContracts[2]];
    plain.player.perks = ['rammer'];
    expect(step(plain)).toEqual(plain);
  });
});
