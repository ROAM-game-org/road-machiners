import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../types';
import { oneSuiteAtATime } from './checks';

let home = '';
afterEach(() => rmSync(home, { recursive: true, force: true }));

function ctxAt(logs: string[]): Ctx {
  home = mkdtempSync(join(tmpdir(), 'one-suite-'));
  return { cfg: { home, verifyTimeoutMinutes: 1, mergeTimeoutMinutes: 1, playtestTimeoutMinutes: 1 }, log: (_stage: string, _issue: number | null, msg: string) => logs.push(msg) } as unknown as Ctx;
}

describe('oneSuiteAtATime', () => {
  it('runs a second full suite only after the first ends, and says it waits', async () => {
    const logs: string[] = [];
    const ctx = ctxAt(logs);
    const events: string[] = [];
    const suite = (name: string) => async () => {
      events.push(`${name} start`);
      await new Promise((done) => setTimeout(done, 300));
      events.push(`${name} end`);
    };
    const first = oneSuiteAtATime(ctx, { stage: 'merge', issue: null }, suite('merge'));
    await new Promise((done) => setTimeout(done, 50));
    await Promise.all([first, oneSuiteAtATime(ctx, { stage: 'verify', issue: 7 }, suite('hotfix'))]);
    expect(events).toEqual(['merge start', 'merge end', 'hotfix start', 'hotfix end']);
    expect(logs).toEqual(['waits for the full suite of another job, since one runs at a time']);
  });
});
