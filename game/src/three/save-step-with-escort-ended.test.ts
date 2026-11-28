import { describe, expect, it } from 'vitest';
import OLD from './save-fixtures/escort-held-old.json';
import { FOLDED_AND_TINY_STEPS as TINY_STEPS, type SavedJson } from './save-migrations';

type Saved = {
  shops: { bowl: { contracts: SavedJson[] } };
  player: { contracts: SavedJson[]; pastContracts: { contract: SavedJson }[] };
};

const step = TINY_STEPS.find((s) => s.name === 'withEscortEnded')!;
const migrated = (): Saved => step.step(structuredClone(OLD) as SavedJson) as unknown as Saved;

describe('save step withEscortEnded', () => {
  it('is the newest tiny step', () => {
    expect(TINY_STEPS.at(-1)).toBe(step);
  });

  it('marks every escort on the board, in hand and in the past as still on the road', () => {
    const saved = migrated();
    expect(saved.shops.bowl.contracts[0]).toMatchObject({ kind: 'escort', ended: null });
    expect(saved.player.contracts[0]).toMatchObject({ kind: 'escort', ended: null });
    expect(saved.player.pastContracts[0].contract).toMatchObject({ kind: 'escort', ended: null });
  });

  it('keeps a value already set', () => {
    const old = structuredClone(OLD) as SavedJson;
    ((old.player as SavedJson).contracts as SavedJson[])[0].ended = 'done';
    expect((step.step(old) as unknown as Saved).player.contracts[0].ended).toBe('done');
  });
});
