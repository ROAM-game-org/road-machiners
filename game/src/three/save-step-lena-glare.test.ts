import { describe, expect, it } from 'vitest';
import FORMAT_2_115 from './save-fixtures/format-2-115.json';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';

type Saved = typeof FORMAT_2_115;

const step = (world: unknown): Saved => TINY_STEPS[115 - TINY_FROM].step(structuredClone(world) as SavedJson) as unknown as Saved;
const fixture = () => structuredClone(FORMAT_2_115);

describe('save migration 115 to 116, Lena no longer sells a glare answer', () => {
  it('drops both glare marks and keeps her other variables, the world variables and the open session', () => {
    const next = step(fixture());
    expect(next.player.quests.local.nose_lena).toEqual({ heard_sun: true, asked_sun: true });
    expect(next.player.quests.world).toEqual({ hattie_met: true });
    expect(next.player.quests.session).toEqual({ quest: 'nose_lena', checkpoint: 'start.hub', seed: 7 });
    expect(next.player.money).toBe(1200);
  });

  it('removes the Lena entry when it held only the glare marks', () => {
    const saved = fixture();
    saved.player.quests.local.nose_lena = { heard_glare: true, asked_glare: true } as never;
    expect(step(saved).player.quests.local).toEqual({});
  });

  it('leaves a save that never asked about the glare unchanged', () => {
    const saved = fixture();
    saved.player.quests.local.nose_lena = { heard_sun: true } as never;
    expect(step(saved)).toEqual(saved);
  });
});
