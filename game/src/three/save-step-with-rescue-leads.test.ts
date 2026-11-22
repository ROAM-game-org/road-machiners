import { describe, expect, it } from 'vitest';
import OLD from './save-fixtures/rescue-leads-old.json';
import { FOLDED_AND_TINY_STEPS as TINY_STEPS, type SavedJson } from './save-migrations';

type Saved = {
  shops: { bowl: { contracts: SavedJson[] } };
  player: { contracts: SavedJson[]; pastContracts: { contract: SavedJson }[]; call: { vars: SavedJson; line: { vars: SavedJson } } | null };
};

const step = TINY_STEPS.find((s) => s.name === 'withRescueLeads')!;
const migrated = (): Saved => step.step(structuredClone(OLD) as SavedJson) as unknown as Saved;

describe('save step withRescueLeads', () => {
  it('is the newest tiny step', () => {
    expect(TINY_STEPS.at(-1)).toBe(step);
  });

  it('gives every rescue a null lead on the board, in hand and in the past', () => {
    const saved = migrated();
    expect(saved.shops.bowl.contracts[0]).toMatchObject({ kind: 'rescue', lead: null });
    expect(saved.player.contracts[1]).toMatchObject({ kind: 'rescue', lead: null });
    expect(saved.player.pastContracts[0].contract).toMatchObject({ kind: 'rescue', lead: null });
  });

  it('leaves other contracts as they were', () => {
    const saved = migrated();
    expect(saved.shops.bowl.contracts[1]).toEqual(OLD.shops.bowl.contracts[1]);
    expect(saved.player.contracts[0]).toEqual(OLD.player.contracts[0]);
  });

  it('turns a saved sighting into a list naming the held search', () => {
    const saved = migrated();
    expect(saved.player.call!.vars.sighting).toEqual({ kind: 'sightings', told: [{ contract: 's1', driver: 'Mack Holt', seen: { bearing: 1, tiles: 20, turns: 4, heading: 2 } }] });
    expect(saved.player.call!.line.vars.sighting).toMatchObject({ kind: 'sightings', told: [{ contract: 's1', seen: null }] });
  });

  it('keeps a world with no open call', () => {
    const old = structuredClone(OLD) as SavedJson;
    (old.player as SavedJson).call = null;
    expect(((step.step(old) as SavedJson).player as SavedJson).call).toBeNull();
  });
});
