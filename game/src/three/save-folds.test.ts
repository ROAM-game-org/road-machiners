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
  '63-136 2-63-highway.json': '400ccc459d0f391f68012d47d23e45449a27daafb9250025b5a7f2af77279458',
  '136-138 2-136-highway.json': '26b5d5e55486b2397901ffdf14b3ebd3ef3b70e4b661c942daf9af6033b6ccc2',
  '136-138 2-136-roaming.json': '9b615e85763af330150729cb6dcc8e69bc1d4c52a8b76d20aef3288f7a596e1a',
  '63-136 2-63-roaming.json': '00816bc6270e14ec8549b62ab892af4d8fbb14656c0c7351ea41983da0751afc',
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
