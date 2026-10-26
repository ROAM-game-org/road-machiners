import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isFreeSfxLoop, SOUNDS } from '../data/sounds';

const hashOf = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const loops = [...new Set(Object.values(SOUNDS).filter(isFreeSfxLoop).flatMap((cue) => cue.files))].sort();
const manifest: Record<string, string> = JSON.parse(readFileSync('src/data/loop-checks.json', 'utf8'));
const fix = 'Run npm run sfx:twins after the loop passes its check';

describe('free sfx loop checks', () => {
  it('has a current passing check for every free sfx loop file', () => {
    const stale = loops.filter((f) => manifest[f] !== hashOf(`public/sfx/${f}`));
    expect(stale, fix).toEqual([]);
  });

  it('names no file that is not a free sfx loop', () => {
    expect(Object.keys(manifest).filter((f) => !loops.includes(f)), fix).toEqual([]);
  });
});
