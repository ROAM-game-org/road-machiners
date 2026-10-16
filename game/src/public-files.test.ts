import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { publicHashes } from './public-files';

function tree(second: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'public-'));
  mkdirSync(join(dir, 'models'));
  writeFileSync(join(dir, 'a.txt'), Uint8Array.of(1, 2, 3));
  writeFileSync(join(dir, 'models', 'x.glb'), Uint8Array.of(4, second));
  return dir;
}

describe('publicHashes', () => {
  it('keys every nested file by its relative path', () => {
    expect(Object.keys(publicHashes(tree(5))).sort()).toEqual(['a.txt', 'models/x.glb']);
  });

  it('changes a hash only when that file changes', () => {
    const before = publicHashes(tree(5));
    const after = publicHashes(tree(6));
    expect(after['models/x.glb']).not.toBe(before['models/x.glb']);
    expect(after['a.txt']).toBe(before['a.txt']);
  });
});
