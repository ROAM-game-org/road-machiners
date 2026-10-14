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

function namesPublicChannel(path: string): boolean {
  return /publicChannel|FACTORY_PUBLIC_CHANNEL/.test(readFileSync(path, 'utf8'));
}

describe('public channel', () => {
  it('is reached only by the release post Publish, and the dashboard only links to it', () => {
    const readers = sourceFiles(SRC).filter(namesPublicChannel).map((path) => relative(SRC, path)).filter((path) => !path.startsWith('dashboard/'));
    expect(readers.sort()).toEqual(CHANNEL_READERS);
  });

  it('gets one send call, inside publishPost', () => {
    const source = readFileSync(join(SRC, 'release-post.ts'), 'utf8');
    const uses = [...source.matchAll(/ctx\.cfg\.publicChannel/g)].map((match) => match.index);
    expect(uses).toHaveLength(1);
    expect(uses[0]).toBeGreaterThan(source.indexOf('export async function publishPost'));
  });
});
