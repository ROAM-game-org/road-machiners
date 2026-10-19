import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fnv1a } from './file-hash';
import { decodeMap } from './sim/terrain';

describe('fnv1a', () => {
  it('gives the hash a decoded map records for its file', () => {
    const bytes = new Uint8Array(readFileSync('public/maps/icarus.bin'));
    expect(fnv1a(bytes)).toBe(decodeMap(bytes).hash);
  });
});
