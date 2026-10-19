import { describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { markPost, pruneCaptions, withStatus } from './post-status';
import { EMPTY_STATE, writeState } from './state';
import type { Ctx } from './types';
import { CAPTION_LIMIT } from './stages/checks';

describe('withStatus', () => {
  it('adds the status on its own line under the caption', () => {
    expect(withStatus('Post', '✅ Approved by Ann')).toBe('Post\n\n✅ Approved by Ann');
  });

  it('cuts the caption body, never the status, to stay inside the caption limit', () => {
    const caption = withStatus('x'.repeat(CAPTION_LIMIT), '✅ Approved by Ann');
    expect(caption.length).toBe(CAPTION_LIMIT);
    expect(caption.endsWith('…\n\n✅ Approved by Ann')).toBe(true);
  });
});

describe('pruneCaptions', () => {
  it('keeps the captions of open approval posts and the current candidate only', () => {
    const release = { issue: 3, branch: 'release/x', day: 'x', postId: 30, removed: [], tasks: [], merges: [], candidateSha: null, playtest: { seed: 1, runs: 0, passed: null, blocked: null, notes: [] } };
    const state = { ...structuredClone(EMPTY_STATE), approvalPosts: { 10: 1 }, release, postCaptions: { 10: 'a', 20: 'gone', 30: 'rc' } };
    expect(pruneCaptions(state).postCaptions).toEqual({ 10: 'a', 30: 'rc' });
  });
});

describe('markPost for a player report', () => {
  it('says a player report sent the post back instead of naming a committee member', async () => {
    const edits: string[] = [];
    const statePath = `tmp/post-status-${process.pid}.json`;
    writeState(statePath, { ...structuredClone(EMPTY_STATE), postCaptions: { 40: 'Caption' }, textPosts: ['40'] });
    const ctx = { statePath, cfg: { committeeChat: 'c' }, telegram: { editText: async (_chat: string, id: number, text: string) => { edits.push(`${id} ${text}`); } } } as unknown as Ctx;
    await markPost(ctx, { kind: 'redesign', issue: 7, text: 'x', by: 'public', byName: null, chat: 'c', messageId: null, postId: 40 }, 'public');
    rmSync(statePath);
    expect(edits).toEqual(['40 Caption\n\nA player report sent it back. Back to design.']);
  });
});
