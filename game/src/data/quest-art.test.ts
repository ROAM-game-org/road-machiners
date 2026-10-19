import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHOPS } from './market';
import { QUEST_ART, TOWN_ART } from './quest-art';

describe('quest art', () => {
  it('has a file in public/quest-art/ for every picture', () => {
    const missing = Object.entries(QUEST_ART)
      .filter(([, art]) => !existsSync(`public/quest-art/${art.file}`))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it('keeps every focus inside the picture', () => {
    for (const art of Object.values(QUEST_ART)) {
      expect(art.focusX).toBeGreaterThanOrEqual(0);
      expect(art.focusX).toBeLessThanOrEqual(100);
      expect(art.focusY).toBeGreaterThanOrEqual(0);
      expect(art.focusY).toBeLessThanOrEqual(100);
    }
  });

  it('names a real picture and a shop for every town band', () => {
    for (const [place, art] of Object.entries(TOWN_ART)) {
      expect(Object.keys(SHOPS)).toContain(place);
      for (const key of [art.band, ...Object.values(art.sections)]) expect(QUEST_ART[key]).toBeDefined();
    }
  });
});
