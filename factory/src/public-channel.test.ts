import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = 'src';
const CHANNEL_READERS = ['config.ts', 'release-post.ts', 'stages/test-fakes.ts', 'types.ts'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

function namesChannel(text: string): boolean {
  return /publicChannel|FACTORY_PUBLIC_CHANNEL/.test(text);
}

function namesPublicChannel(path: string): boolean {
  return namesChannel(readFileSync(path, 'utf8'));
}

describe('public channel', () => {
  it('is reached only by the release post Publish, and the dashboard only links to it', () => {
    const readers = sourceFiles(SRC).filter(namesPublicChannel).map((path) => relative(SRC, path)).filter((path) => !path.startsWith('dashboard/'));
    expect(readers.sort()).toEqual(CHANNEL_READERS);
  });

  it('is named in release-post.ts only inside publishPost', () => {
    const source = readFileSync(join(SRC, 'release-post.ts'), 'utf8');
    const start = source.indexOf('export async function publishPost');
    const next = source.slice(start + 1).search(/\n(export )?(async )?function /);
    const end = next === -1 ? source.length : start + 1 + next;
    expect(namesChannel(source.slice(start, end))).toBe(true);
    expect(namesChannel(source.slice(0, start) + source.slice(end))).toBe(false);
  });
});
