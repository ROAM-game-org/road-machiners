import { describe, expect, it } from 'vitest';
import FORMAT_2_104 from './save-fixtures/format-2-104.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';
import { directionsText } from '../ui/directions-text';
import { resolve } from '../text/resolve';
import type { DirectionStep } from '../sim/types';

type Saved = typeof FORMAT_2_104;

const step = (world: Saved): Saved => TINY_STEPS[104 - TINY_FROM].step(structuredClone(world) as unknown as SavedJson) as unknown as Saved;
const speak = (steps: unknown) => resolve(directionsText(steps as DirectionStep[]), 'en');

describe('save migration 104 to 105, leave steps take a lean', () => {
  it('gives every saved leave step no lean, in the call and in its line', () => {
    const next = step(structuredClone(FORMAT_2_104)) as unknown as { player: { call: { vars: { way: { steps: { lean?: null }[] } }; line: { vars: { way: { steps: { lean?: null }[] } } } } } };
    expect(next.player.call.vars.way.steps[1].lean).toBeNull();
    expect(next.player.call.vars.way.steps[0]).toEqual(FORMAT_2_104.player.call.vars.way.steps[0]);
    expect(next.player.call.line.vars.way.steps[0].lean).toBeNull();
  });

  it('reads the same sentence as before the step', () => {
    const next = step(structuredClone(FORMAT_2_104));
    expect(speak(next.player.call.vars.way.steps)).toBe('Take the road to Nose, heading east. Where the road runs closest, leave the road and head south-west, a fair way.');
    expect(speak(next.player.call.line.vars.way.steps)).toBe('Past the second fork, where the road runs closest, leave the road and head south-east, a short way.');
  });

  it('changes nothing in a save with no call', () => {
    expect(step({ player: { call: null } } as unknown as Saved)).toEqual({ player: { call: null } });
  });
});
