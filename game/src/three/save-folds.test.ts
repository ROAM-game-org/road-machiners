import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RELEASE_STEPS, type SavedJson } from './save-migrations';

const ANCHOR_DIR = join(__dirname, 'save-fixtures/anchors');

const RECORDED: Record<string, string> = {
  '1-6 2-1-roaming.json': 'f274610b9df48f6a19298bb91ff94561c830ecaf8ea092d73f89ace561a2b6fc',
  '6-25 2-6-roaming.json': '04150fb2b21512cb2199dd36a01c20d26ed2d92a74ac0eace7b611071fb7bab1',
  '25-61 2-25-roaming.json': 'f257ce793c4a196042a5053f22b1dc44c40f3cabcba9057c2dfca9d67c962a05',
  '61-62 2-61-highway.json': '4684a26465a5fe45a48e70b5235e99e7d3f249a600d6e81a8c1f662fed9a7fb0',
  '61-62 2-61-roaming.json': 'c0cda477a836b024b10c4fac258dc04a73967a3c7d4e242d5d216756051311b3',
  '62-63 2-62-highway.json': '4684a26465a5fe45a48e70b5235e99e7d3f249a600d6e81a8c1f662fed9a7fb0',
  '62-63 2-62-roaming.json': 'c0cda477a836b024b10c4fac258dc04a73967a3c7d4e242d5d216756051311b3',
};

function savesAt(minor: number): { file: string; world: SavedJson }[] {
  return readdirSync(ANCHOR_DIR)
    .filter((file) => file.startsWith(`2-${minor}-`))
    .map((file) => ({ file, world: (JSON.parse(readFileSync(join(ANCHOR_DIR, file), 'utf8')) as { world: SavedJson }).world }));
}

function hashOf(world: SavedJson): string {
  return createHash('sha256').update(JSON.stringify(world)).digest('hex');
}

describe('release steps', () => {
  for (const release of RELEASE_STEPS) {
    it(`give the recorded world from each shipped ${release.from} save`, () => {
      const saves = savesAt(release.from);
      expect(saves.length).toBeGreaterThan(0);
      for (const { file, world } of saves) {
        const out = release.step(structuredClone(world));
        const key = `${release.from}-${release.to} ${file}`;
        if (RECORDED[key] !== hashOf(out)) {
          mkdirSync('tmp/release-steps', { recursive: true });
          writeFileSync(join('tmp/release-steps', `${key}.json`), JSON.stringify(out, null, 1));
        }
        expect(hashOf(out), key).toBe(RECORDED[key]);
      }
    });
  }
});
