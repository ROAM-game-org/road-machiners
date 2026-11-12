import { describe, expect, it } from 'vitest';
import FORMAT_2_104 from './save-fixtures/format-2-104.json';
import { FIRST_TINY as TINY_FROM, FOLDED_AND_TINY_STEPS as TINY_STEPS, type SavedJson } from './save-migrations';

type Saved = typeof FORMAT_2_104;

const step = (world: Saved): Saved => TINY_STEPS[104 - TINY_FROM].step(structuredClone(world) as unknown as SavedJson) as unknown as Saved;

describe('save migration 104 to 105, leave steps take a lean', () => {
  it('gives every saved leave step no lean, in the call and in its line', () => {
    const next = step(structuredClone(FORMAT_2_104)) as unknown as { player: { call: { vars: { way: { steps: { lean?: null }[] } }; line: { vars: { way: { steps: { lean?: null }[] } } } } } };
    expect(next.player.call.vars.way.steps[1].lean).toBeNull();
    expect(next.player.call.vars.way.steps[0]).toEqual(FORMAT_2_104.player.call.vars.way.steps[0]);
    expect(next.player.call.line.vars.way.steps[0].lean).toBeNull();
  });

  it('changes nothing in a save with no call', () => {
    expect(step({ player: { call: null } } as unknown as Saved)).toEqual({ player: { call: null } });
  });
});
