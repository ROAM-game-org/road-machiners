import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QUEST_ART } from './quest-art';

describe('quest art', () => {
  it('has a file in public/quest-art/ for every picture', () => {
    const missing = Object.entries(QUEST_ART)
      .filter(([, art]) => !existsSync(`public/quest-art/${art.file}`))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it('gives every picture a whole-percent focus point', () => {
    const bad = Object.entries(QUEST_ART)
      .filter(([, art]) => [art.focusX, art.focusY].some((n) => !Number.isInteger(n) || n < 0 || n > 100))
      .map(([key]) => key);
    expect(bad).toEqual([]);
  });
});
