import { describe, expect, it } from 'vitest';
import FORMAT_2_138 from './save-fixtures/format-2-138.json';
import { TINY_STEPS, type SavedJson } from './save-migrations';

const convoyRumor = TINY_STEPS.find((s) => s.name === 'withConvoyRumor')!;
const step = (world: SavedJson): SavedJson => convoyRumor.step(structuredClone(world));

type Saved = { player: { notes: { id: string; turn: number }[]; quests: { world: SavedJson } } };

describe('save migration withConvoyRumor, the Burnt Convoy note becomes a world variable', () => {
  it('marks the rumor heard for a save holding the note and keeps everything else', () => {
    const before = FORMAT_2_138 as unknown as Saved & SavedJson;
    const next = step(before) as unknown as Saved;

    expect(next.player.quests.world).toEqual({ depot_thief: 'vance', convoy_rumor: true });
    expect(next.player.notes).toEqual(before.player.notes);
    expect({ ...next, player: { ...next.player, quests: null } }).toEqual({ ...before, player: { ...before.player, quests: null } });
  });

  it('leaves a save without the note as it was', () => {
    const before = structuredClone(FORMAT_2_138) as unknown as Saved & SavedJson;
    before.player.notes = before.player.notes.filter((n) => n.id !== 'burntConvoy');

    expect(step(before)).toEqual(before);
  });
});
