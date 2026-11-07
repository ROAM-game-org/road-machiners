import { describe, expect, it } from 'vitest';
import { MIX } from '../data/sounds';
import type { GameEvent } from '../sim/types';
import { HornCues, hornSteps } from './volley';

const horn = (vehicle: string, cause: 'sight' | 'brake'): GameEvent => ({ t: 'roadHorn', vehicle, cause, other: 'p', at: { x: 0, y: 0 } });

describe('road horn cues', () => {
  const events = [horn('a', 'brake'), horn('b', 'sight'), horn('far', 'sight'), { t: 'honk', vehicle: 'a' } as GameEvent];
  const timed = hornSteps(events, (e) => e.vehicle !== 'far', () => 0.5);

  it('drops unheard horns and other events', () => {
    expect(timed.map((t) => t.event.vehicle)).toEqual(['a', 'b']);
  });

  it('puts a brake horn at the reaction step and a sight horn inside the first half', () => {
    expect(timed[0].step).toBe(MIX.roadHorn.brakeStep);
    expect(timed[1].step).toBe(Math.floor(0.5 * MIX.roadHorn.sightSpanSteps));
  });

  it('serves each horn once at its step, and flushes the rest at the end', () => {
    const cues = new HornCues(timed);
    expect(cues.due(MIX.roadHorn.brakeStep - 1)).toEqual([]);
    expect(cues.due(MIX.roadHorn.brakeStep).map((e) => e.vehicle)).toEqual(['a']);
    expect(cues.due(MIX.roadHorn.brakeStep)).toEqual([]);
    expect(cues.due(null).map((e) => e.vehicle)).toEqual(['b']);
    expect(cues.due(null)).toEqual([]);
  });
});
