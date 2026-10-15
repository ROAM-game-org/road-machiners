import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { evidenceFor, recordEvidence, suiteCounts, toolchainKey, type Evidence } from './check-evidence';

const HOME = resolve('tmp/factory-check-evidence-test');
const NOW = new Date('2026-10-15T10:00:00Z');

function entry(tree: string, toolchain: string, at = NOW.toISOString()): Evidence {
  return { tree, commit: `c-${tree}`, toolchain, ran: ['typecheck', 'suite', 'playtest', 'build'], reused: [], by: 'verify', issue: 7, at };
}

beforeEach(() => {
  rmSync(HOME, { recursive: true, force: true });
  mkdirSync(HOME, { recursive: true });
});

describe('check evidence', () => {
  it('finds evidence only for the exact tree and toolchain it was recorded under', () => {
    recordEvidence(HOME, entry('t1', 'k1'), NOW);
    expect(evidenceFor(HOME, 't1', 'k1')?.commit).toBe('c-t1');
    expect(evidenceFor(HOME, 't2', 'k1')).toBeNull();
    expect(evidenceFor(HOME, 't1', 'k2')).toBeNull();
  });

  it('keys the toolchain on the image definition and the check script, so a change to either misses the cache', () => {
    const dockerfile = join(HOME, 'Dockerfile');
    writeFileSync(dockerfile, 'FROM node:24');
    const before = toolchainKey('npm test', dockerfile);
    expect(toolchainKey('npm test', dockerfile)).toBe(before);
    expect(toolchainKey('npm run test:cached', dockerfile)).not.toBe(before);
    writeFileSync(dockerfile, 'FROM node:26');
    expect(toolchainKey('npm test', dockerfile)).not.toBe(before);
  });

  it('drops evidence older than 30 days on the next write', () => {
    recordEvidence(HOME, entry('old', 'k', '2026-09-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z'));
    recordEvidence(HOME, entry('new', 'k'), NOW);
    expect(evidenceFor(HOME, 'old', 'k')).toBeNull();
    expect(evidenceFor(HOME, 'new', 'k')).not.toBeNull();
  });

  it('treats a corrupt store as no evidence, so checks run, and replaces it on the next write', () => {
    writeFileSync(join(HOME, 'check-evidence.json'), '{');
    expect(evidenceFor(HOME, 't', 'k')).toBeNull();
    recordEvidence(HOME, entry('t', 'k'), NOW);
    expect(evidenceFor(HOME, 't', 'k')?.commit).toBe('c-t');
  });

  it('reads the last cached suite count from a checks log', () => {
    const log = join(HOME, 'checks.log');
    expect(suiteCounts(log)).toBeNull();
    writeFileSync(log, '[test-cache] ran 226, skipped 0, uncacheable 0\n[checks] x\n[test-cache] ran 3, skipped 223, uncacheable 1\n');
    expect(suiteCounts(log)).toEqual({ ran: 3, skipped: 223 });
  });
});
