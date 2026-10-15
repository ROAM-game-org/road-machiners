import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hashOf = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const oggs = readdirSync('public/sfx').filter((f) => f.endsWith('.ogg')).sort();
const manifest: Record<string, string> = JSON.parse(readFileSync('src/data/sound-twins.json', 'utf8'));
const twins = readdirSync('public/sfx-m4a');
const fix = 'Run npm run sfx:twins';

describe('AAC twins', () => {
  it('has a current twin for every ogg', () => {
    const stale = oggs.filter((f) => manifest[f] !== hashOf(`public/sfx/${f}`) || !twins.includes(f.replace(/\.ogg$/, '.m4a')));
    expect(stale, fix).toEqual([]);
  });

  it('has no twin or manifest entry without its ogg', () => {
    const orphans = [...Object.keys(manifest).filter((f) => !oggs.includes(f)), ...twins.filter((f) => !oggs.includes(f.replace(/\.m4a$/, '.ogg')))];
    expect(orphans, fix).toEqual([]);
  });
});
