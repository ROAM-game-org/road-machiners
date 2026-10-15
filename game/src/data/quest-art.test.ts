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
});
