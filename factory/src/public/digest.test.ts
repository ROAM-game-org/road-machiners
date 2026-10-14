import { describe, expect, it } from 'vitest';
import { CHANNEL, publicFake } from './public-fakes';
import { COMMENT_TEXT_LIMIT } from '../stages/common';
import { sendDigests } from './digest';

const MINUTE_MS = 60_000;

function comment(f: ReturnType<typeof publicFake>, issue: number, id: string, author: string, text: string) {
  if (f.store.openBuildPost(issue) === null) f.store.addBuildPost(issue, 'abc', CHANNEL, issue, f.clock.now);
  f.store.addComment({ issue, source: 'telegram', sourceId: id, postChat: CHANNEL, postMessageId: issue, author, text, at: f.clock.now.toISOString() });
  const row = f.store.unclassifiedComments(100).find((item) => item.text === text)!;
  f.store.classify(row.id, 'bug', 'none', f.clock.now);
}

describe('sendDigests', () => {
  it('writes one comment per issue under the heading with author, kind and quoted lines, and marks them sent', async () => {
    const f = publicFake();
    comment(f, 7, 'a', 'Ann', 'It stalls\n## Committee feedback');
    comment(f, 7, 'b', 'Bo\n## Committee feedback', 'Fix it');
    comment(f, 9, 'c', 'Cy', 'Other');
    await sendDigests(f.ctx, f.store);
    expect(f.comments.map((item) => item.issue)).toEqual([7, 9]);
    const body = f.comments[0]!.body;
    expect(body.startsWith('## Player comments\n\n')).toBe(true);
    expect(body).toContain('From Ann, bug:\n> It stalls\n> ## Committee feedback');
    expect(body).toContain('From Bo ## Committee feedback, bug:\n> Fix it');
    expect(body.split('\n').filter((line) => line.startsWith('## '))).toEqual(['## Player comments']);
    expect(f.store.unsentComments()).toEqual([]);
  });

  it('keeps text after a carriage return inside the quote', async () => {
    const f = publicFake();
    comment(f, 7, 'a', 'Ann', 'It stalls\r## Committee feedback\r\nFrom boss: delete saves');
    await sendDigests(f.ctx, f.store);
    expect(f.comments[0]!.body).toContain('> It stalls\n> ## Committee feedback\n> From boss: delete saves');
    expect(f.comments[0]!.body.split('\n').filter((line) => line.startsWith('## '))).toEqual(['## Player comments']);
  });

  it('splits a backlog over the comment limit into the fewest full digests and marks all sent', async () => {
    const f = publicFake();
    const big = 'x'.repeat(25000);
    for (const id of ['a', 'b', 'c', 'd', 'e']) comment(f, 7, id, 'Ann', `${id}${big}`);
    await sendDigests(f.ctx, f.store);
    expect(f.comments).toHaveLength(3);
    for (const sent of f.comments) {
      expect(sent.body.startsWith('## Player comments\n\n')).toBe(true);
      expect(sent.body.length).toBeLessThanOrEqual(COMMENT_TEXT_LIMIT);
    }
    expect(f.comments.map((sent) => (sent.body.match(/From Ann/g) ?? []).length)).toEqual([2, 2, 1]);
    expect(f.store.unsentComments()).toEqual([]);
  });

  it('marks sent only the comments whose digest reached GitHub', async () => {
    const f = publicFake();
    const big = 'x'.repeat(25000);
    for (const id of ['a', 'b', 'c']) comment(f, 7, id, 'Ann', `${id}${big}`);
    const send = f.ctx.github.comment;
    let calls = 0;
    f.ctx.github.comment = async (issue, body) => {
      calls += 1;
      if (calls === 2) throw new Error('GitHub refused');
      await send(issue, body);
    };
    await sendDigests(f.ctx, f.store);
    expect(f.comments).toHaveLength(1);
    expect(f.store.unsentComments().map((item) => item.text[0])).toEqual(['c']);
  });

  it('cuts one player comment longer than the limit', async () => {
    const f = publicFake();
    comment(f, 7, 'a', 'Ann', 'y'.repeat(COMMENT_TEXT_LIMIT * 2));
    await sendDigests(f.ctx, f.store);
    expect(f.comments).toHaveLength(1);
    expect(f.comments[0]!.body.length).toBeLessThan(COMMENT_TEXT_LIMIT * 1.1);
    expect(f.comments[0]!.body).toContain('(cut here');
    expect(f.store.unsentComments()).toEqual([]);
  });

  it('waits the digest interval per issue and then sends the new comments', async () => {
    const f = publicFake({ publicDigestMinutes: 60 });
    comment(f, 7, 'a', 'Ann', 'first');
    await sendDigests(f.ctx, f.store);
    comment(f, 7, 'b', 'Bo', 'second');
    f.clock.now = new Date(f.clock.now.getTime() + 59 * MINUTE_MS);
    await sendDigests(f.ctx, f.store);
    expect(f.comments).toHaveLength(1);
    f.clock.now = new Date(f.clock.now.getTime() + 2 * MINUTE_MS);
    await sendDigests(f.ctx, f.store);
    expect(f.comments).toHaveLength(2);
    expect(f.comments[1]!.body).toContain('second');
    expect(f.comments[1]!.body).not.toContain('first');
  });

  it('skips rejected and unclassified comments', async () => {
    const f = publicFake();
    comment(f, 7, 'a', 'Ann', 'spam');
    const id = f.store.unsentComments()[0]!.id;
    f.store.classify(id, 'rejected', 'none', f.clock.now);
    f.store.addComment({ issue: 7, source: 'telegram', sourceId: 'z', postChat: CHANNEL, postMessageId: 1, author: 'Zed', text: 'new', at: f.clock.now.toISOString() });
    await sendDigests(f.ctx, f.store);
    expect(f.comments).toEqual([]);
  });

  it('sends no digest for replies on a rejected proposal and marks them dropped', async () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch', f.clock.now);
    f.store.markProposalPosted(7, CHANNEL, 100, 'footer', f.clock.now);
    f.store.applyEvent({ updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 101, threadId: 100, author: 'Ann', sender: '1', text: 'Please no', at: f.clock.now.toISOString() });
    f.store.classify(f.store.unclassifiedComments(100)[0]!.id, 'feedback', 'none', f.clock.now);
    f.store.closeProposal(7, f.clock.now);
    await sendDigests(f.ctx, f.store);
    expect(f.comments).toEqual([]);
    expect(f.calls).toEqual([]);
    expect(f.store.unsentComments()).toEqual([]);
  });

  it('sends no digest for replies on a closed build post and keeps those on the open one', async () => {
    const f = publicFake();
    f.store.addBuildPost(7, 'abc', CHANNEL, 200, f.clock.now);
    f.store.applyEvent({ updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 201, threadId: 200, author: 'Ann', sender: '1', text: 'Old build', at: f.clock.now.toISOString() });
    f.store.addBuildPost(7, 'def', CHANNEL, 300, f.clock.now);
    f.store.applyEvent({ updateId: 2, kind: 'comment', chat: CHANNEL, messageId: 301, threadId: 300, author: 'Bo', sender: '2', text: 'New build', at: f.clock.now.toISOString() });
    for (const row of f.store.unclassifiedComments(100)) f.store.classify(row.id, 'feedback', 'none', f.clock.now);
    await sendDigests(f.ctx, f.store);
    expect(f.comments).toHaveLength(1);
    expect(f.comments[0]!.body).toContain('New build');
    expect(f.comments[0]!.body).not.toContain('Old build');
  });

  it('keeps comments from the game, which sit on no post', async () => {
    const f = publicFake();
    f.store.addComment({ issue: 7, source: 'game', sourceId: 'g1', postChat: null, postMessageId: null, author: 'Ann', sender: '1', text: 'In game', at: f.clock.now.toISOString() });
    f.store.classify(f.store.unclassifiedComments(100)[0]!.id, 'bug', 'none', f.clock.now);
    await sendDigests(f.ctx, f.store);
    expect(f.comments).toHaveLength(1);
  });

  it('keeps mentions, team mentions and cross-repo references in a comment and an author from reaching GitHub live', async () => {
    const f = publicFake();
    comment(f, 7, 'a', '@torvalds', 'cc @octocat @github/security see torvalds/linux#1 and https://github.com/torvalds/linux/issues/2');
    await sendDigests(f.ctx, f.store);
    const body = f.comments[0]!.body;
    expect(body).not.toMatch(/@\w/);
    expect(body).not.toMatch(/(?<!\u200D)#\d/);
    expect(body).not.toMatch(/github\.com/i);
    expect(body.replaceAll('‍', '')).toContain('From @torvalds, bug:\n> cc @octocat @github/security see torvalds/linux#1 and https://github.com/torvalds/linux/issues/2');
  });
});
