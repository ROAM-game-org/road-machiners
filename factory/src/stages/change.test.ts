import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_STATE, readState, writeState } from '../state';
import { ROOT, fake, reset, type Fake } from './test-fakes';
import { change } from './change';

beforeEach(reset);

function pending(f: Fake): void {
  writeState(f.ctx.statePath, { ...EMPTY_STATE, pendingChanges: [{ id: 4, text: 'post daily', by: 'ann' }] });
}

describe('change', () => {
  it('opens a pull request for a diff outside factory/ and lists its files', async () => {
    const f = fake();
    pending(f);
    f.files = ['factory/src/a.ts', 'quality/check.ts'];
    await change(f.ctx, 4);
    expect(f.calls).toContain('push work-head factory-change/4');
    expect(f.prBodies.at(-1)).toContain('quality/check.ts');
    expect(readState(f.ctx.statePath).pendingChanges).toEqual([]);
  });

  it('opens a pull request for a factory-only diff and clears the request', async () => {
    const f = fake();
    pending(f);
    f.files = ['factory/src/a.ts'];
    f.agentWrites = { 'pr-title.txt': 'Post daily\n' };
    f.ctx.cfg = { ...f.ctx.cfg, designModel: 'opus' };
    const dirs: string[] = [];
    const runs: { model: string; prompt: string }[] = [];
    const agent = f.ctx.container.agent;
    f.ctx.container.agent = async (run) => { dirs.push(run.dir); runs.push(run); return agent(run); };
    const bases: string[] = [];
    const prepare = f.ctx.repo.prepareWorkClone;
    f.ctx.repo.prepareWorkClone = async (branch, base, dir) => { bases.push(base); await prepare(branch, base, dir); };
    await change(f.ctx, 4);
    expect(dirs).toEqual(['factory']);
    expect(runs[0].model).toBe('opus');
    expect(runs[0].prompt).toContain('up:make in hands-off mode on the task file .factory-tasks/change-4.md');
    expect(bases).toEqual(['main']);
    expect(f.calls).toContain('push work-head factory-change/4');
    expect(f.calls).toContain('pr factory-change/4 main Post daily');
    expect(readState(f.ctx.statePath).pendingChanges).toEqual([]);
    expect(f.prBodies.at(-1)).toContain('## Requested by');
    expect(readFileSync(join(ROOT, 'work/change-4/factory/.factory/request.md'), 'utf8')).toContain('ann');
  });

  it('answers the member message with the pull request, and the committee chat when the request has no message', async () => {
    const f = fake();
    writeState(f.ctx.statePath, { ...EMPTY_STATE, pendingChanges: [{ id: 4, text: 'a', by: 'ann', reply: { chat: '-7', messageId: 31 } }, { id: 5, text: 'b', by: 'ann' }] });
    f.files = ['factory/src/a.ts'];
    await change(f.ctx, 4);
    await change(f.ctx, 5);
    const messages = f.calls.filter((call) => call.startsWith('message '));
    expect(messages[0]).toMatch(/^message -7 31 Factory change 4 is ready for review: /);
    expect(messages[1]).toMatch(new RegExp(`^message ${f.ctx.cfg.committeeChat} - Factory change 5 is ready`));
  });

  it('throws for an unknown id', async () => {
    const f = fake();
    await expect(change(f.ctx, 9)).rejects.toThrow('no pending');
  });
});
