import { describe, expect, it } from 'vitest';
import { changedAgainstAll, guardAgainstAll, type Side } from './diff-guard';

const section = (file: string, line: string): string => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-old\n+${line}\n`;
const side = (...parts: [string, string][]): Side => ({ files: parts.map(([file]) => file), diff: parts.map(([file, line]) => section(file, line)).join('') });

describe('changedAgainstAll', () => {
  it('keeps a file that differs from every approved side and drops one that only a side brought', () => {
    expect(changedAgainstAll([['.github/ci.yml', 'game/a.ts'], ['game/a.ts', 'factory/x.ts']])).toEqual(['game/a.ts']);
  });

  it('keeps every file when one side is approved', () => {
    expect(changedAgainstAll([['.github/ci.yml', 'game/a.ts']])).toEqual(['.github/ci.yml', 'game/a.ts']);
  });

  it('keeps nothing from an empty side', () => {
    expect(changedAgainstAll([[], ['game/a.ts']])).toEqual([]);
  });
});

describe('guardAgainstAll', () => {
  const SAVE = 'game/src/three/save-migrations.ts';
  const bump = side([SAVE, 'export const SAVE_MAJOR = 4;']);
  const other = side([SAVE, 'const note = 1;']);

  it('passes a SAVE_MAJOR bump that one approved side already holds', () => {
    expect(() => guardAgainstAll([bump, other])).not.toThrow();
  });

  it('refuses a SAVE_MAJOR change that differs from every approved side', () => {
    expect(() => guardAgainstAll([bump, bump])).toThrow('SAVE_MAJOR');
  });

  it('refuses a protected path that differs from every approved side', () => {
    expect(() => guardAgainstAll([side(['.github/ci.yml', 'x']), side(['.github/ci.yml', 'x'])])).toThrow('.github/ci.yml');
  });
});
