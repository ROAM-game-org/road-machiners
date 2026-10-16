import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentOutputPath, readAgentOutput } from './agent-output';

const ROOT = resolve('tmp/agent-output');
const HOME = join(ROOT, 'clone/game');
const OUT = join(HOME, '.factory');
const HOST = join(ROOT, 'host');

beforeEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  mkdirSync(HOST, { recursive: true });
  writeFileSync(join(HOST, 'secret.env'), 'BOT_TOKEN=1');
});
afterEach(() => rmSync(ROOT, { recursive: true, force: true }));

describe('agent output', () => {
  it('reads a plain file, a link that stays in the clone, and nothing for a missing file', () => {
    writeFileSync(join(OUT, 'report.md'), 'done');
    writeFileSync(join(HOME, 'notes.md'), 'notes');
    symlinkSync(join(HOME, 'notes.md'), join(OUT, 'notes.md'));
    expect(readAgentOutput(HOME, 'report.md')).toBe('done');
    expect(readAgentOutput(HOME, 'notes.md')).toBe('notes');
    expect(readAgentOutput(HOME, 'missing.md')).toBeNull();
  });

  it('refuses a file that links out of the clone', () => {
    symlinkSync(join(HOST, 'secret.env'), join(OUT, 'report.md'));
    expect(() => readAgentOutput(HOME, 'report.md')).toThrow('points outside the work clone');
    expect(() => agentOutputPath(HOME, 'report.md')).toThrow('points outside the work clone');
  });

  it('refuses a .factory folder that links out of the clone', () => {
    rmSync(OUT, { recursive: true });
    writeFileSync(join(HOST, 'report.md'), 'host file');
    symlinkSync(HOST, OUT);
    expect(() => readAgentOutput(HOME, 'report.md')).toThrow('points outside the work clone');
  });
});
